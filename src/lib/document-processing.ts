import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import { createServiceClient } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/embeddings-vertex'
import { indexDocumentInPinecone } from '@/lib/pinecone'
import { detectOptimalProcessor, getProcessorId, getProcessorName } from '@/lib/document-ai-config'
import { batchProcessor } from '@/lib/document-ai-batch'
import CacheManager from '@/lib/cache'
import { getGoogleClientOptions } from '@/lib/google-credentials'
import { SmartRetry, RetryConfigs, circuitBreakers } from '@/lib/retry-logic'

const client = new DocumentProcessorServiceClient(getGoogleClientOptions())

export async function processDocument(documentId: string): Promise<{ switchedToBatch?: boolean }> {
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

    // Always try sync processing first - let Document AI tell us if it's too large
    const fileSizeMB = document.file_size / (1024 * 1024)
    console.log(`Processing document (${fileSizeMB.toFixed(1)}MB) - trying sync processing first`)

    // Process with Google Document AI (synchronous for smaller documents)
    // Auto-detect optimal processor or use default
    const optimalProcessor = detectOptimalProcessor(document.filename, document.file_size)
    const processorId = getProcessorId(optimalProcessor)
    const name = getProcessorName(processorId)
    
    const request = {
      name,
      rawDocument: {
        content: base64Content,
        mimeType: 'application/pdf',
      },
    }

    let result;
    try {
      // Use smart retry with circuit breaker for Document AI processing
      const retryResult = await circuitBreakers.documentAI.execute(async () => {
        return await SmartRetry.execute(
          async () => {
            console.log(`🔄 Attempting Document AI processing for ${documentId}`)
            const response = await client.processDocument(request)
            return Array.isArray(response) ? response[0] : response
          },
          RetryConfigs.documentAI
        )
      })

      if (!retryResult.success) {
        throw retryResult.error
      }

      result = retryResult.result!
      console.log(`✅ Document AI processing completed in ${retryResult.attempts} attempts (${retryResult.totalTime}ms)`)

    } catch (error: any) {
      // Handle page limit errors by automatically switching to batch processing
      if (error.code === 3 && error.details?.includes('exceed the limit')) {
        console.log('Page limit exceeded for synchronous processing, switching to batch processing...')
        try {
          await processBatchDocument(documentId)
          return { switchedToBatch: true } // Indicate successful switch to batch
        } catch (batchError) {
          console.error('Failed to switch to batch processing:', batchError)
          throw batchError // If batch switch fails, throw the batch error
        }
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
    
    // Extract page count from document
    const pageCount = result.document.pages ? result.document.pages.length : 0

    // Update document with extracted data
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        extracted_text: extractedText,
        extracted_fields: extractedFields,
        page_count: pageCount,
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

    // Generate embeddings and index in Pinecone with page tracking
    try {
      await generateAndIndexPagedEmbeddings(documentId, result.document)
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
    
    // Invalidate caches when document processing completes
    await invalidateDocumentCaches(documentId, document.user_id)
    
    return {} // Successful sync processing

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
    
    // Re-throw the error so job processor can handle it
    throw error
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

// Generate embeddings with page tracking (new version)
export async function generateAndIndexPagedEmbeddings(documentId: string, document: any): Promise<void> {
  // Get document metadata for Pinecone indexing
  const supabase = createServiceClient()
  const { data: docRecord, error: docError } = await supabase
    .from('documents')
    .select('metadata')
    .eq('id', documentId)
    .single()

  if (docError) {
    console.warn(`Could not fetch document metadata for ${documentId}:`, docError)
  }

  const businessMetadata = docRecord?.metadata || {}

  // Extract text by pages to preserve page information
  const pagesText = extractTextByPages(document)
  
  // Split into chunks while preserving page numbers
  const pagedChunks = splitTextIntoPagedChunks(pagesText, 1000) // 1000 character chunks with overlap
  
  for (const pagedChunk of pagedChunks) {
    // Generate embedding with Vertex AI using smart retry
    const embeddingResult = await circuitBreakers.vertexAI.execute(async () => {
      return await SmartRetry.execute(
        async () => {
          console.log(`🔄 Generating embeddings for chunk ${pagedChunk.chunkIndex}`)
          return await generateEmbeddings(pagedChunk.text)
        },
        RetryConfigs.vertexEmbeddings
      )
    })

    if (!embeddingResult.success) {
      console.error(`❌ Failed to generate embeddings for chunk ${pagedChunk.chunkIndex}:`, embeddingResult.error)
      throw embeddingResult.error
    }

    const embedding = embeddingResult.result!
    console.log(`✅ Embeddings generated for chunk ${pagedChunk.chunkIndex} in ${embeddingResult.attempts} attempts`)
    
    // Create unique vector ID
    const vectorId = `${documentId}_chunk_${pagedChunk.chunkIndex}`
    
    // Store embedding in Supabase with retry logic
    const supabaseResult = await SmartRetry.execute(
      async () => {
        const supabase = createServiceClient()
        const { error } = await supabase.from('document_embeddings').insert({
          document_id: documentId,
          vector_id: vectorId,
          embedding,
          chunk_text: pagedChunk.text,
          chunk_index: pagedChunk.chunkIndex,
          page_number: pagedChunk.pageNumber,
        })
        
        if (error) throw error
        return true
      },
      RetryConfigs.supabaseOperations
    )
    
    if (!supabaseResult.success) {
      console.error(`❌ Failed to store embedding ${vectorId} in Supabase:`, supabaseResult.error)
      throw new Error(`Supabase storage failed: ${supabaseResult.error?.message}`)
    }

    // Index in Pinecone with retry logic and circuit breaker
    const pineconeResult = await circuitBreakers.pinecone.execute(async () => {
      return await SmartRetry.execute(
        async () => {
          console.log(`🔄 Indexing vector ${vectorId} in Pinecone`)
          await indexDocumentInPinecone(vectorId, embedding, {
            document_id: documentId,
            chunk_index: pagedChunk.chunkIndex,
            page_number: pagedChunk.pageNumber,
            text: pagedChunk.text,
            // Include business metadata for filtering
            ...businessMetadata
          })
          return true
        },
        RetryConfigs.pineconeIndexing
      )
    })

    if (!pineconeResult.success) {
      console.error(`❌ Failed to index vector ${vectorId} in Pinecone:`, pineconeResult.error)
      throw new Error(`Pinecone indexing failed: ${pineconeResult.error?.message}`)
    }

    console.log(`✅ Vector ${vectorId} indexed successfully in Pinecone`)
  }
}

// Legacy function for backward compatibility  
export async function generateAndIndexEmbeddings(documentId: string, text: string): Promise<void> {
  // Get document metadata for Pinecone indexing
  const supabase = createServiceClient()
  const { data: docRecord, error: docError } = await supabase
    .from('documents')
    .select('metadata')
    .eq('id', documentId)
    .single()

  if (docError) {
    console.warn(`Could not fetch document metadata for ${documentId}:`, docError)
  }

  const businessMetadata = docRecord?.metadata || {}

  // Split text into chunks for embedding
  const chunks = splitTextIntoChunks(text, 1000) // 1000 character chunks with overlap
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    
    // Generate embedding with Vertex AI
    const embedding = await generateEmbeddings(chunk)
    
    // Create unique vector ID
    const vectorId = `${documentId}_chunk_${i}`
    
    // Store embedding in Supabase (without page tracking for legacy)
    const supabase = createServiceClient()
    const { error: supabaseError } = await supabase.from('document_embeddings').insert({
      document_id: documentId,
      vector_id: vectorId,
      embedding,
      chunk_text: chunk,
      chunk_index: i,
      page_number: null, // Legacy documents don't have page tracking
    })
    
    if (supabaseError) {
      console.error(`Failed to store embedding ${vectorId} in Supabase:`, supabaseError)
      throw new Error(`Supabase storage failed: ${supabaseError.message}`)
    }
    
    // Index in Pinecone with business metadata
    await indexDocumentInPinecone(vectorId, embedding, {
      document_id: documentId,
      chunk_index: i,
      text: chunk,
      // Include business metadata for filtering
      ...businessMetadata
    })
  }
}

// Interface for text chunks with page information
interface PagedChunk {
  text: string
  chunkIndex: number
  pageNumber: number
}

// Extract text page by page from Document AI result
function extractTextByPages(document: any): { text: string; pageNumber: number }[] {
  const pagesText: { text: string; pageNumber: number }[] = []
  
  if (document.pages) {
    for (const page of document.pages) {
      const pageNumber = page.pageNumber || 1
      
      // Extract text for this specific page using text anchors
      let pageText = ''
      
      if (page.paragraphs) {
        for (const paragraph of page.paragraphs) {
          if (paragraph.layout?.textAnchor) {
            const paragraphText = getTextFromTextAnchor(document.text, paragraph.layout.textAnchor)
            if (paragraphText) {
              pageText += paragraphText + '\n'
            }
          }
        }
      }
      
      // Fallback: if no paragraphs, try to extract from lines
      if (!pageText && page.lines) {
        for (const line of page.lines) {
          if (line.layout?.textAnchor) {
            const lineText = getTextFromTextAnchor(document.text, line.layout.textAnchor)
            if (lineText) {
              pageText += lineText + '\n'
            }
          }
        }
      }
      
      if (pageText.trim()) {
        pagesText.push({
          text: pageText.trim(),
          pageNumber: pageNumber
        })
      }
    }
  }
  
  // Fallback: if no pages structure, treat entire text as page 1
  if (pagesText.length === 0 && document.text) {
    pagesText.push({
      text: document.text,
      pageNumber: 1
    })
  }
  
  return pagesText
}

// Split text into chunks while preserving page information
function splitTextIntoPagedChunks(pagesText: { text: string; pageNumber: number }[], chunkSize: number, overlap: number = 200): PagedChunk[] {
  const pagedChunks: PagedChunk[] = []
  let globalChunkIndex = 0
  
  for (const pageInfo of pagesText) {
    const pageChunks = splitTextIntoChunks(pageInfo.text, chunkSize, overlap)
    
    for (const chunkText of pageChunks) {
      pagedChunks.push({
        text: chunkText,
        chunkIndex: globalChunkIndex,
        pageNumber: pageInfo.pageNumber
      })
      globalChunkIndex++
    }
  }
  
  return pagedChunks
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

/**
 * Process large documents using Google Cloud Document AI batch processing
 */
async function processBatchDocument(documentId: string): Promise<void> {
  const supabase = createServiceClient()
  
  try {
    console.log(`Starting batch processing for document: ${documentId}`)
    
    // Update processing status
    await updateProcessingStatus(documentId, 'processing', 50, 'Uploading to Google Cloud Storage for batch processing...')
    
    // Start batch processing operation
    const operationId = await batchProcessor.startBatchProcessing(documentId)
    
    // Update processing status
    await updateProcessingStatus(documentId, 'processing', 60, 'Document sent for batch processing. This may take several minutes...')
    
    // Update document status to indicate batch processing
    await supabase
      .from('documents')
      .update({ 
        status: 'processing',
        processing_notes: `Batch processing started. Operation ID: ${operationId.substring(0, 20)}...`
      })
      .eq('id', documentId)
    
  } catch (error) {
    console.error('Batch processing initiation failed:', error)
    
    // Update document and processing status with error
    await supabase
      .from('documents')
      .update({
        status: 'error',
        processing_error: error instanceof Error ? error.message : 'Batch processing initiation failed'
      })
      .eq('id', documentId)

    await updateProcessingStatus(
      documentId, 
      'error', 
      0, 
      'Batch processing failed to start',
      error instanceof Error ? error.message : 'Unknown error'
    )
    
    throw error
  }
}

/**
 * Invalidate relevant caches when document status changes
 */
async function invalidateDocumentCaches(documentId: string, userId: string): Promise<void> {
  try {
    console.log(`♻️ Invalidating caches for document ${documentId}`)
    
    // Invalidate document-specific caches
    await CacheManager.invalidateDocument(documentId)
    
    // Invalidate user dashboard data
    await CacheManager.invalidateDashboardData(userId)
    
    // Invalidate any similarity search results involving this document
    await CacheManager.invalidatePattern(`similar:*`)
    
    console.log(`✅ Cache invalidation completed for document ${documentId}`)
  } catch (error) {
    console.warn(`⚠️ Cache invalidation failed for document ${documentId}:`, error)
    // Don't throw error - cache invalidation failure shouldn't stop document processing
  }
}