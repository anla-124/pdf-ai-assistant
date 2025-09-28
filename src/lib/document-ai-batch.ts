import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import { createServiceClient } from '@/lib/supabase/server'
import { gcsManager } from '@/lib/gcs-batch-config'
import { getProcessorId, getProcessorName, detectOptimalProcessor } from '@/lib/document-ai-config'

const client = new DocumentProcessorServiceClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

export interface BatchOperationStatus {
  operationId: string
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  progress?: number
  error?: string
  metadata?: any
}

export class DocumentAIBatchProcessor {
  
  async startBatchProcessing(documentId: string): Promise<string> {
    const supabase = createServiceClient()
    
    try {
      console.log(`Starting batch processing for document: ${documentId}`)
      
      // Get document from database
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single()

      if (fetchError || !document) {
        throw new Error('Document not found')
      }

      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(document.file_path)

      if (downloadError || !fileData) {
        throw new Error('Failed to download document from storage')
      }

      // Upload to GCS for batch processing
      const arrayBuffer = await fileData.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)
      
      const gcsUri = await gcsManager.uploadDocumentForBatch(
        documentId, 
        fileBuffer, 
        document.filename
      )

      console.log(`Uploaded to GCS: ${gcsUri}`)

      // Determine optimal processor
      const processorType = detectOptimalProcessor(document.filename, document.file_size)
      const processorId = getProcessorId(processorType)
      const processorName = getProcessorName(processorId)

      console.log(`Using processor for batch: ${processorType} - ${processorName}`)

      // Setup batch processing request
      const inputUri = gcsManager.getBatchInputUri(documentId)
      const outputUri = gcsManager.getBatchOutputUri(documentId)

      const request = {
        name: processorName,
        inputDocuments: {
          gcsPrefix: {
            gcsUriPrefix: inputUri,
          },
        },
        documentOutputConfig: {
          gcsOutputConfig: {
            gcsUri: outputUri,
          },
        },
      }

      console.log(`Batch processing request:`, {
        processor: processorName,
        input: inputUri,
        output: outputUri,
      })

      // Start batch processing operation
      const response = await client.batchProcessDocuments(request)
      const operation = Array.isArray(response) ? response[0] : response
      const operationId = operation.name!

      console.log(`Batch operation started: ${operationId}`)

      // Update document_jobs with batch operation info
      await supabase
        .from('document_jobs')
        .update({
          batch_operation_id: operationId,
          processing_method: 'batch',
          metadata: {
            ...operation.metadata,
            inputUri,
            outputUri,
            processorType,
          },
        })
        .eq('document_id', documentId)

      return operationId

    } catch (error) {
      console.error('Batch processing start failed:', error)
      throw error
    }
  }

  async checkBatchOperationStatus(operationId: string): Promise<BatchOperationStatus> {
    try {
      console.log(`Checking batch operation status: ${operationId}`)
      
      // Extract document ID from operation ID to check for output files
      const supabase = createServiceClient()
      const { data: job, error: jobError } = await supabase
        .from('document_jobs')
        .select('document_id')
        .eq('batch_operation_id', operationId)
        .single()
      
      if (jobError || !job) {
        console.log(`No job found for operation ${operationId}, assuming RUNNING`)
        return {
          operationId,
          status: 'RUNNING',
          progress: 0,
        }
      }
      
      // Check if batch output files exist in GCS
      try {
        const outputExists = await gcsManager.checkBatchOutputExists(job.document_id)
        
        if (outputExists) {
          console.log(`Batch operation completed: ${operationId}`)
          return {
            operationId,
            status: 'SUCCEEDED',
            progress: 100,
          }
        } else {
          console.log(`Batch operation still running: ${operationId}`)
          return {
            operationId,
            status: 'RUNNING',
            progress: 0,
          }
        }
      } catch (gcsError) {
        console.error('Error checking GCS output:', gcsError)
        // If we can't check GCS, assume it's still running
        return {
          operationId,
          status: 'RUNNING',
          progress: 0,
        }
      }

    } catch (error) {
      console.error('Failed to check batch operation status:', error)
      return {
        operationId,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async processBatchResults(documentId: string, operationId: string): Promise<void> {
    const supabase = createServiceClient()

    try {
      console.log(`Processing batch results for document: ${documentId}`)

      // Download batch results from GCS
      const results = await gcsManager.downloadBatchResults(documentId)
      
      if (results.length === 0) {
        throw new Error('No batch results found')
      }

      // Process ALL result files and combine them (batch processing splits large documents)
      console.log(`Processing ${results.length} batch result files...`)
      
      let combinedText = ''
      let allPages: any[] = []
      let allEntities: any[] = []
      
      // Process each result file
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        console.log(`Processing result file ${i + 1}/${results.length}`)
        
        // Handle different result formats for each file
        let document = result.document
        if (!document && result.responses && result.responses[0]) {
          document = result.responses[0].document
        }
        if (!document && result.response && result.response.document) {
          document = result.response.document
        }
        
        // For batch processing, the result itself IS the document data
        if (!document && result.pages && result.text !== undefined) {
          document = result
        }
        
        if (!document) {
          console.warn(`No document data in result file ${i + 1}, skipping...`)
          continue
        }
        
        // Combine text from all files
        if (document.text) {
          combinedText += document.text + '\n'
        }
        
        // Combine pages from all files
        if (document.pages) {
          allPages = allPages.concat(document.pages)
        }
        
        // Combine entities from all files
        if (document.entities) {
          allEntities = allEntities.concat(document.entities)
        }
      }
      
      if (!combinedText && allPages.length === 0) {
        throw new Error(`No valid document data found in any of the ${results.length} result files`)
      }
      
      // Create combined document structure
      const combinedDocument = {
        text: combinedText,
        pages: allPages,
        entities: allEntities
      }

      // Extract text and structured fields from combined document
      const extractedText = combinedText
      const extractedFields = this.extractStructuredFields(combinedDocument)
      
      // Extract page count from combined document
      const pageCount = allPages.length

      console.log(`Extracted text length: ${extractedText.length}`)
      console.log(`Extracted fields count: ${extractedFields.fields?.length || 0}`)
      console.log(`Total pages processed: ${pageCount}`)

      // Update document with extracted data
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          extracted_text: extractedText,
          extracted_fields: extractedFields,
          page_count: pageCount,
          status: 'processing', // Keep processing until embeddings complete
        })
        .eq('id', documentId)

      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`)
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

        const { error: fieldsError } = await supabase
          .from('extracted_fields')
          .insert(fieldsToInsert)

        if (fieldsError) {
          console.error('Failed to insert extracted fields:', fieldsError)
        }
      }

      console.log('Batch results processed successfully')

    } catch (error) {
      console.error('Failed to process batch results:', error)
      throw error
    }
  }

  async cleanupBatchOperation(documentId: string): Promise<void> {
    try {
      console.log(`Cleaning up batch operation for document: ${documentId}`)
      await gcsManager.cleanupBatchFiles(documentId)
      console.log('Batch cleanup completed')
    } catch (error) {
      console.error('Batch cleanup failed:', error)
      // Don't throw error for cleanup failures
    }
  }

  private extractStructuredFields(document: any) {
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
            type: this.getFieldType(entity.type),
            confidence: entity.confidence || 0,
            pageNumber: this.getPageNumber(entity.pageAnchor),
            boundingBox: this.getBoundingBox(entity.pageAnchor),
          })
        }
      }
    }

    // Extract form fields
    if (document.pages) {
      for (const page of document.pages) {
        if (page.formFields) {
          for (const field of page.formFields) {
            const fieldName = this.getTextFromTextAnchor(document.text, field.fieldName?.textAnchor)
            const fieldValue = this.getTextFromTextAnchor(document.text, field.fieldValue?.textAnchor)
            
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
            const tableData = this.extractTableData(document.text, table)
            
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

  private getFieldType(entityType: string): string {
    const type = entityType.toLowerCase()
    if (type.includes('date') || type.includes('time')) return 'date'
    if (type.includes('number') || type.includes('amount') || type.includes('price')) return 'number'
    if (type.includes('checkbox') || type.includes('bool')) return 'checkbox'
    return 'text'
  }

  private getPageNumber(pageAnchor: any): number | null {
    if (pageAnchor?.pageRefs?.[0]?.page) {
      return parseInt(pageAnchor.pageRefs[0].page) + 1 // Convert to 1-based
    }
    return null
  }

  private getBoundingBox(pageAnchor: any): any | null {
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

  private getTextFromTextAnchor(documentText: string, textAnchor: any): string | null {
    if (!textAnchor?.textSegments?.[0]) return null
    
    const segment = textAnchor.textSegments[0]
    const startIndex = parseInt(segment.startIndex || '0')
    const endIndex = parseInt(segment.endIndex || documentText.length.toString())
    
    return documentText.substring(startIndex, endIndex)
  }

  private extractTableData(documentText: string, table: any): any[] {
    const tableData: any[] = []
    
    if (!table.bodyRows) return tableData
    
    for (const row of table.bodyRows) {
      const rowData: any[] = []
      
      if (row.cells) {
        for (const cell of row.cells) {
          const cellText = this.getTextFromTextAnchor(documentText, cell.layout?.textAnchor)
          rowData.push(cellText?.trim() || '')
        }
      }
      
      if (rowData.length > 0) {
        tableData.push(rowData)
      }
    }
    
    return tableData
  }
}

export const batchProcessor = new DocumentAIBatchProcessor()