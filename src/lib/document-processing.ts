import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import { createServiceClient } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/embeddings-vertex'
import { indexDocumentInPinecone } from '@/lib/pinecone'
import { detectOptimalProcessor, getProcessorId, getProcessorName } from '@/lib/document-ai-config'

const client = new DocumentProcessorServiceClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

export async function processDocument(documentId: string): Promise<void> {
  const supabase = createServiceClient()
  
  try {
    // Update processing status
    await updateProcessingStatus(documentId, 'processing', 10, 'Starting document processing...')

    // Get document from database
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (fetchError || !document) {
      throw new Error('Document not found')
    }

    // Update processing status
    await updateProcessingStatus(documentId, 'processing', 20, 'Downloading document...')

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.file_path)

    if (downloadError || !fileData) {
      throw new Error('Failed to download document from storage')
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64Content = Buffer.from(arrayBuffer).toString('base64')

    // Update processing status
    await updateProcessingStatus(documentId, 'processing', 40, 'Processing with Document AI...')

    // Process with Google Document AI
    // Auto-detect optimal processor or use default
    const optimalProcessor = detectOptimalProcessor(document.filename, document.file_size)
    const processorId = getProcessorId(optimalProcessor)
    const name = getProcessorName(processorId)
    
    console.log(`Processing document with ${optimalProcessor} processor:`, name)
    
    const request = {
      name,
      rawDocument: {
        content: base64Content,
        mimeType: 'application/pdf',
      },
      // Enable imageless mode to support up to 30 pages (vs 15 pages default)
      processOptions: {
        imagelessMode: true,
      },
    }

    let result;
    try {
      [result] = await client.processDocument(request)
    } catch (error: any) {
      // Handle page limit errors with helpful message
      if (error.code === 3 && error.details?.includes('pages exceed the limit')) {
        const errorMessage = `Document processing failed: ${error.details}. This document exceeds the 30-page limit for synchronous processing. For documents larger than 30 pages, you'll need to implement asynchronous batch processing in Google Cloud Document AI.`
        console.error('Page limit error:', errorMessage)
        throw new Error(errorMessage)
      }
      // Re-throw other errors
      throw error
    }
    
    if (!result.document) {
      throw new Error('No document returned from Document AI')
    }

    // Update processing status
    await updateProcessingStatus(documentId, 'processing', 60, 'Extracting structured data...')

    // Extract text and structured fields
    const extractedText = result.document.text || ''
    const extractedFields = extractStructuredFields(result.document)

    // Update document with extracted data
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        extracted_text: extractedText,
        extracted_fields: extractedFields,
        status: 'processing', // Keep processing until embeddings are complete
      })
      .eq('id', documentId)

    if (updateError) {
      throw new Error('Failed to update document with extracted data')
    }

    // Store individual extracted fields
    if (extractedFields.fields && Array.isArray(extractedFields.fields)) {
      const fieldsToInsert = extractedFields.fields.map((field: any) => ({
        document_id: documentId,
        field_name: field.name || 'Unknown',
        field_value: field.value || '',
        field_type: field.type || 'text',
        confidence: field.confidence || 0,
        page_number: field.pageNumber || null,
        bounding_box: field.boundingBox || null,
      }))

      await supabase.from('extracted_fields').insert(fieldsToInsert)
    }

    // Update processing status
    await updateProcessingStatus(documentId, 'processing', 80, 'Generating embeddings...')

    // Generate embeddings and index in Pinecone (with fallback)
    try {
      await generateAndIndexEmbeddings(documentId, extractedText)
      await updateProcessingStatus(documentId, 'completed', 100, 'Document processing completed successfully')
    } catch (embeddingError) {
      console.error('Embedding generation failed, completing without embeddings:', embeddingError)
      await updateProcessingStatus(documentId, 'completed', 100, 'Document processed (similarity search unavailable due to API limits)')
      
      // Update document with a note about missing embeddings
      await supabase
        .from('documents')
        .update({ 
          metadata: { 
            ...document.metadata, 
            embeddings_skipped: true,
            embeddings_error: embeddingError instanceof Error ? embeddingError.message : 'Unknown error'
          }
        })
        .eq('id', documentId)
    }

    // Update document status to completed
    await supabase
      .from('documents')
      .update({ status: 'completed' })
      .eq('id', documentId)

  } catch (error) {
    console.error('Document processing error:', error)
    
    // Update document and processing status with error
    await supabase
      .from('documents')
      .update({
        status: 'error',
        processing_error: error instanceof Error ? error.message : 'Unknown processing error'
      })
      .eq('id', documentId)

    await updateProcessingStatus(
      documentId, 
      'error', 
      0, 
      'Processing failed',
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

async function updateProcessingStatus(
  documentId: string,
  status: 'queued' | 'processing' | 'completed' | 'error',
  progress: number,
  message?: string,
  error?: string
) {
  const supabase = createServiceClient()
  
  await supabase.from('processing_status').insert({
    document_id: documentId,
    status,
    progress,
    message,
    error,
  })
}

function extractStructuredFields(document: any) {
  const extractedFields: any = {
    fields: [],
    tables: [],
    checkboxes: [],
  }

  if (document.entities) {
    for (const entity of document.entities) {
      if (entity.type && entity.mentionText) {
        extractedFields.fields.push({
          name: entity.type,
          value: entity.mentionText,
          type: getFieldType(entity.type),
          confidence: entity.confidence || 0,
          pageNumber: getPageNumber(entity.pageAnchor),
          boundingBox: getBoundingBox(entity.pageAnchor),
        })
      }
    }
  }

  // Extract form fields
  if (document.pages) {
    for (const page of document.pages) {
      if (page.formFields) {
        for (const field of page.formFields) {
          const fieldName = getTextFromTextAnchor(document.text, field.fieldName?.textAnchor)
          const fieldValue = getTextFromTextAnchor(document.text, field.fieldValue?.textAnchor)
          
          if (fieldName && fieldValue) {
            extractedFields.fields.push({
              name: fieldName.trim(),
              value: fieldValue.trim(),
              type: 'text',
              confidence: field.fieldName?.confidence || 0,
              pageNumber: page.pageNumber || 1,
            })
          }
        }
      }

      // Extract tables
      if (page.tables) {
        for (let tableIndex = 0; tableIndex < page.tables.length; tableIndex++) {
          const table = page.tables[tableIndex]
          const tableData = extractTableData(document.text, table)
          
          if (tableData.length > 0) {
            extractedFields.tables.push({
              index: tableIndex,
              pageNumber: page.pageNumber || 1,
              data: tableData,
            })
          }
        }
      }
    }
  }

  return extractedFields
}

function getFieldType(entityType: string): string {
  const type = entityType.toLowerCase()
  if (type.includes('date') || type.includes('time')) return 'date'
  if (type.includes('number') || type.includes('amount') || type.includes('price')) return 'number'
  if (type.includes('checkbox') || type.includes('bool')) return 'checkbox'
  return 'text'
}

function getPageNumber(pageAnchor: any): number | null {
  if (pageAnchor?.pageRefs?.[0]?.page) {
    return parseInt(pageAnchor.pageRefs[0].page) + 1 // Convert to 1-based
  }
  return null
}

function getBoundingBox(pageAnchor: any): any | null {
  if (pageAnchor?.pageRefs?.[0]?.boundingPoly?.normalizedVertices) {
    const vertices = pageAnchor.pageRefs[0].boundingPoly.normalizedVertices
    if (vertices.length >= 2) {
      return {
        x: vertices[0].x || 0,
        y: vertices[0].y || 0,
        width: (vertices[2]?.x || 1) - (vertices[0].x || 0),
        height: (vertices[2]?.y || 1) - (vertices[0].y || 0),
      }
    }
  }
  return null
}

function getTextFromTextAnchor(documentText: string, textAnchor: any): string | null {
  if (!textAnchor?.textSegments?.[0]) return null
  
  const segment = textAnchor.textSegments[0]
  const startIndex = parseInt(segment.startIndex || '0')
  const endIndex = parseInt(segment.endIndex || documentText.length.toString())
  
  return documentText.substring(startIndex, endIndex)
}

function extractTableData(documentText: string, table: any): any[] {
  const tableData: any[] = []
  
  if (!table.bodyRows) return tableData
  
  for (const row of table.bodyRows) {
    const rowData: any[] = []
    
    if (row.cells) {
      for (const cell of row.cells) {
        const cellText = getTextFromTextAnchor(documentText, cell.layout?.textAnchor)
        rowData.push(cellText?.trim() || '')
      }
    }
    
    if (rowData.length > 0) {
      tableData.push(rowData)
    }
  }
  
  return tableData
}

export async function generateAndIndexEmbeddings(documentId: string, text: string): Promise<void> {
  // Split text into chunks for embedding
  const chunks = splitTextIntoChunks(text, 1000) // 1000 character chunks with overlap
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    
    // Generate embedding with Vertex AI
    const embedding = await generateEmbeddings(chunk)
    
    // Create unique vector ID
    const vectorId = `${documentId}_chunk_${i}`
    
    // Store embedding in Supabase
    const supabase = createServiceClient()
    const { error: supabaseError } = await supabase.from('document_embeddings').insert({
      document_id: documentId,
      vector_id: vectorId,
      embedding,
      chunk_text: chunk,
      chunk_index: i,
    })
    
    if (supabaseError) {
      console.error(`Failed to store embedding ${vectorId} in Supabase:`, supabaseError)
      throw new Error(`Supabase storage failed: ${supabaseError.message}`)
    }
    
    console.log(`Stored embedding ${vectorId} in Supabase database`)
    
    // Index in Pinecone
    await indexDocumentInPinecone(vectorId, embedding, {
      document_id: documentId,
      chunk_index: i,
      text: chunk,
    })
  }
}

export function splitTextIntoChunks(text: string, chunkSize: number, overlap: number = 200): string[] {
  const chunks: string[] = []
  let start = 0
  
  while (start < text.length) {
    let end = start + chunkSize
    
    // Try to break at a sentence or word boundary
    if (end < text.length) {
      const lastSentence = text.lastIndexOf('.', end)
      const lastWord = text.lastIndexOf(' ', end)
      
      if (lastSentence > start + chunkSize * 0.5) {
        end = lastSentence + 1
      } else if (lastWord > start + chunkSize * 0.5) {
        end = lastWord
      }
    }
    
    chunks.push(text.substring(start, end))
    start = Math.max(start + chunkSize - overlap, end)
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0)
}