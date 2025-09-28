import { createServiceClient } from '@/lib/supabase/server'
import { batchProcessor } from '@/lib/document-ai-batch'
import { generateAndIndexPagedEmbeddings } from '@/lib/document-processing'
import { NextRequest, NextResponse } from 'next/server'

/**
 * API endpoint to check and complete batch processing operations
 * 
 * Usage:
 * GET /api/admin/batch-status - Check all pending batch operations
 * POST /api/admin/batch-status?operationId=<id> - Check specific operation
 * POST /api/admin/batch-status?documentId=<id> - Complete batch processing for document
 */

export async function GET() {
  try {
    const supabase = createServiceClient()
    
    // Get all documents with pending batch operations
    const { data: batchJobs, error } = await supabase
      .from('document_jobs')
      .select(`
        document_id,
        batch_operation_id,
        processing_method,
        metadata,
        documents!inner(id, filename, status)
      `)
      .eq('processing_method', 'batch')
      .in('documents.status', ['processing', 'queued'])
      .not('batch_operation_id', 'is', null)
    
    if (error) {
      throw new Error(`Failed to fetch batch jobs: ${error.message}`)
    }
    
    console.log(`📋 Found ${batchJobs?.length || 0} pending batch operations`)
    
    return NextResponse.json({
      success: true,
      pendingOperations: batchJobs?.length || 0,
      operations: batchJobs || []
    })
    
  } catch (error) {
    console.error('Failed to get batch status:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const operationId = searchParams.get('operationId')
  const documentId = searchParams.get('documentId')
  
  try {
    if (operationId) {
      // Check specific operation status
      const status = await batchProcessor.checkBatchOperationStatus(operationId)
      return NextResponse.json({
        success: true,
        operationId,
        status
      })
    }
    
    if (documentId) {
      // Complete batch processing for a specific document
      const result = await completeBatchProcessing(documentId)
      return NextResponse.json(result)
    }
    
    // Check and complete all pending batch operations
    const result = await checkAllBatchOperations()
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('Batch status operation failed:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

async function checkAllBatchOperations() {
  const supabase = createServiceClient()
  
  // Get all pending batch operations
  const { data: batchJobs, error } = await supabase
    .from('document_jobs')
    .select(`
      document_id,
      batch_operation_id,
      metadata,
      documents!inner(id, filename, status)
    `)
    .eq('processing_method', 'batch')
    .in('documents.status', ['processing', 'queued'])
    .not('batch_operation_id', 'is', null)
  
  if (error) {
    throw new Error(`Failed to fetch batch jobs: ${error.message}`)
  }
  
  if (!batchJobs || batchJobs.length === 0) {
    return {
      success: true,
      message: 'No pending batch operations found',
      checked: 0
    }
  }
  
  console.log(`🔍 Checking ${batchJobs.length} batch operations...`)
  
  let completed = 0
  let failed = 0
  let stillRunning = 0
  
  for (const job of batchJobs) {
    try {
      console.log(`📋 Checking batch operation for document ${job.document_id}`)
      
      // Check operation status
      const status = await batchProcessor.checkBatchOperationStatus(job.batch_operation_id)
      
      if (status.status === 'SUCCEEDED') {
        console.log(`✅ Batch operation completed for document ${job.document_id}`)
        await completeBatchProcessing(job.document_id)
        completed++
      } else if (status.status === 'FAILED') {
        console.log(`❌ Batch operation failed for document ${job.document_id}`)
        await markBatchProcessingFailed(job.document_id, status.error || 'Batch operation failed')
        failed++
      } else {
        console.log(`⏳ Batch operation still running for document ${job.document_id}`)
        stillRunning++
      }
      
    } catch (error) {
      console.error(`Failed to process batch job for document ${job.document_id}:`, error)
      failed++
    }
  }
  
  return {
    success: true,
    message: `Checked ${batchJobs.length} batch operations`,
    results: {
      completed,
      failed,
      stillRunning,
      total: batchJobs.length
    }
  }
}

async function completeBatchProcessing(documentId: string) {
  const supabase = createServiceClient()
  
  try {
    console.log(`🔄 Completing batch processing for document: ${documentId}`)
    
    // Get the batch operation ID
    const { data: job, error: jobError } = await supabase
      .from('document_jobs')
      .select('batch_operation_id')
      .eq('document_id', documentId)
      .single()
    
    if (jobError || !job?.batch_operation_id) {
      throw new Error('Batch operation ID not found')
    }
    
    // Process batch results
    await batchProcessor.processBatchResults(documentId, job.batch_operation_id)
    
    // Get the updated document with extracted text
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()
    
    if (docError || !document) {
      throw new Error('Failed to fetch updated document')
    }
    
    if (!document.extracted_text) {
      throw new Error('No extracted text found after batch processing')
    }
    
    // Generate embeddings for the batch-processed document
    console.log(`🔄 Generating embeddings for batch-processed document...`)
    
    // For batch-processed documents, we'll create a simple document structure
    const mockDocument = {
      text: document.extracted_text,
      pages: document.page_count ? Array.from({ length: document.page_count }, (_, i) => ({ pageNumber: i + 1 })) : []
    }
    
    try {
      await generateAndIndexPagedEmbeddings(documentId, mockDocument)
      
      // Mark document as completed
      await supabase
        .from('documents')
        .update({ 
          status: 'completed',
          processing_notes: 'Batch processing completed successfully'
        })
        .eq('id', documentId)
      
      console.log(`✅ Batch processing completed successfully for document ${documentId}`)
      
    } catch (embeddingError) {
      console.error('Embedding generation failed for batch-processed document:', embeddingError)
      
      // Mark as completed but note embedding issue
      await supabase
        .from('documents')
        .update({ 
          status: 'completed',
          processing_notes: 'Batch processing completed, but embedding generation failed',
          metadata: { 
            ...document.metadata,
            embeddings_skipped: true,
            embeddings_error: embeddingError instanceof Error ? embeddingError.message : 'Unknown error'
          }
        })
        .eq('id', documentId)
    }
    
    // Clean up batch files
    await batchProcessor.cleanupBatchOperation(documentId)
    
    return {
      success: true,
      message: `Batch processing completed for document ${documentId}`,
      documentId
    }
    
  } catch (error) {
    console.error(`Failed to complete batch processing for document ${documentId}:`, error)
    await markBatchProcessingFailed(documentId, error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

async function markBatchProcessingFailed(documentId: string, errorMessage: string) {
  const supabase = createServiceClient()
  
  await supabase
    .from('documents')
    .update({
      status: 'error',
      processing_error: `Batch processing failed: ${errorMessage}`
    })
    .eq('id', documentId)
  
  console.log(`❌ Marked document ${documentId} as failed: ${errorMessage}`)
}