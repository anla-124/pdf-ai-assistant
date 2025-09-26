import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processDocument } from '@/lib/document-processing'
import { batchProcessor } from '@/lib/document-ai-batch'

// Helper function to determine if document needs batch processing
function needsBatchProcessing(fileSize: number, filename: string): boolean {
  // Estimate page count based on file size (rough estimate: 50KB per page for PDFs)
  const estimatedPages = Math.ceil(fileSize / (50 * 1024))
  
  // Use batch processing for documents likely >30 pages or files >2MB
  const needsBatch = estimatedPages > 30 || fileSize > 2 * 1024 * 1024
  
  console.log(`Document ${filename}: ${fileSize} bytes, ~${estimatedPages} pages, batch: ${needsBatch}`)
  
  return needsBatch
}

export async function GET(request: NextRequest) {
  try {
    // Verify this is called by Vercel Cron
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the next queued job (FIFO order, with priority support)
    console.log('🔍 Checking for queued jobs...')
    const { data: jobs, error: jobsError } = await supabase
      .from('document_jobs')
      .select(`
        id,
        document_id,
        user_id,
        attempts,
        max_attempts,
        batch_operation_id,
        processing_method,
        metadata,
        documents (
          id,
          title,
          filename,
          file_path,
          file_size,
          user_id
        )
      `)
      .in('status', ['queued', 'processing'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    if (!jobs || jobs.length === 0) {
      console.log('📭 No queued or processing jobs found')
      
      // Also check what jobs exist in general for debugging
      const { data: allJobs } = await supabase
        .from('document_jobs')
        .select('id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
      
      console.log('📊 Recent jobs:', allJobs)
      return NextResponse.json({ 
        message: 'No jobs to process',
        debug: {
          totalRecentJobs: allJobs?.length || 0,
          recentJobs: allJobs || []
        }
      }, { status: 200 })
    }

    const job = jobs[0]
    console.log(`Processing job ${job.id} for document ${job.document_id} (status: ${job.status})`)

    // Only update to processing if job is queued (not already processing)
    if (job.status === 'queued') {
      // Mark job as processing
      const { error: updateJobError } = await supabase
        .from('document_jobs')
        .update({ 
          status: 'processing', 
          started_at: new Date().toISOString(),
          attempts: job.attempts + 1
        })
        .eq('id', job.id)

      if (updateJobError) {
        console.error('Error updating job status:', updateJobError)
        return NextResponse.json({ error: 'Failed to update job status' }, { status: 500 })
      }

      // Mark document as processing
      const { error: updateDocError } = await supabase
        .from('documents')
        .update({ status: 'processing' })
        .eq('id', job.document_id)

      if (updateDocError) {
        console.error('Error updating document status:', updateDocError)
      }
    } else {
      console.log(`Job ${job.id} already in processing status, checking batch operation...`)
    }

    try {
      const document = job.documents
      
      if (!document) {
        throw new Error('Document not found')
      }

      // Determine processing method if not already set
      let processingMethod = job.processing_method
      if (!processingMethod || processingMethod === 'sync') {
        const shouldUseBatch = needsBatchProcessing(document.file_size, document.filename)
        processingMethod = shouldUseBatch ? 'batch' : 'sync'
        
        // Update job with determined processing method
        await supabase
          .from('document_jobs')
          .update({ processing_method: processingMethod })
          .eq('id', job.id)
      }

      console.log(`Processing job ${job.id} using ${processingMethod} method`)

      if (processingMethod === 'batch') {
        // Handle batch processing
        if (!job.batch_operation_id) {
          // Start new batch operation
          console.log('Starting batch processing...')
          const operationId = await batchProcessor.startBatchProcessing(job.document_id)
          
          // Update job with operation ID
          await supabase
            .from('document_jobs')
            .update({ batch_operation_id: operationId })
            .eq('id', job.id)
          
          console.log(`Batch operation started: ${operationId}`)
          
          return NextResponse.json({
            message: 'Batch processing initiated',
            jobId: job.id,
            documentId: job.document_id,
            operationId: operationId
          })
        } else {
          // Check existing batch operation status
          console.log(`Checking batch operation: ${job.batch_operation_id}`)
          const status = await batchProcessor.checkBatchOperationStatus(job.batch_operation_id)
          
          if (status.status === 'SUCCEEDED') {
            // Process batch results
            await batchProcessor.processBatchResults(job.document_id, job.batch_operation_id)
            
            // Generate embeddings (same as sync processing)
            const { data: doc } = await supabase
              .from('documents')
              .select('extracted_text')
              .eq('id', job.document_id)
              .single()
              
            if (doc?.extracted_text) {
              // Import embeddings function
              const { generateAndIndexEmbeddings } = await import('@/lib/document-processing')
              try {
                console.log('Generating embeddings for batch processed document...')
                await generateAndIndexEmbeddings(job.document_id, doc.extracted_text)
                console.log('Embeddings generation completed successfully')
              } catch (embeddingError) {
                console.error('Embedding generation failed, completing without embeddings:', embeddingError)
                
                // Update document with a note about missing embeddings
                await supabase
                  .from('documents')
                  .update({ 
                    metadata: { 
                      embeddings_skipped: true,
                      embeddings_error: embeddingError instanceof Error ? embeddingError.message : 'Network timeout'
                    }
                  })
                  .eq('id', job.document_id)
              }
            }
            
            // Cleanup batch files
            await batchProcessor.cleanupBatchOperation(job.document_id)
            
            // Mark job and document as completed
            await supabase
              .from('document_jobs')
              .update({ 
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', job.id)

            await supabase
              .from('documents')
              .update({ status: 'completed' })
              .eq('id', job.document_id)

            console.log(`Batch processing completed for job ${job.id}`)
            
            return NextResponse.json({
              message: 'Batch processing completed',
              jobId: job.id,
              documentId: job.document_id
            })
            
          } else if (status.status === 'FAILED') {
            throw new Error(`Batch operation failed: ${status.error}`)
          } else {
            // Still running - leave job as processing
            console.log(`Batch operation still running: ${status.progress || 0}%`)
            return NextResponse.json({
              message: 'Batch processing in progress',
              jobId: job.id,
              documentId: job.document_id,
              progress: status.progress || 0
            })
          }
        }
      } else {
        // Handle synchronous processing (existing logic)
        await processDocument(job.document_id)

        // Mark job as completed
        await supabase
          .from('document_jobs')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id)

        console.log(`Successfully processed job ${job.id} (sync)`)
        
        return NextResponse.json({ 
          message: 'Document processed successfully (sync)',
          jobId: job.id,
          documentId: job.document_id
        })
      }

    } catch (processingError) {
      console.error(`Error processing document ${job.document_id}:`, processingError)

      const errorMessage = processingError instanceof Error 
        ? processingError.message 
        : 'Unknown processing error'

      // Check if we should retry
      const shouldRetry = job.attempts < job.max_attempts
      const newStatus = shouldRetry ? 'queued' : 'failed'

      // Update job status
      await supabase
        .from('document_jobs')
        .update({ 
          status: newStatus,
          error_message: errorMessage,
          completed_at: shouldRetry ? null : new Date().toISOString()
        })
        .eq('id', job.id)

      // Update document status
      await supabase
        .from('documents')
        .update({ 
          status: 'error',
          processing_error: errorMessage
        })
        .eq('id', job.document_id)

      if (shouldRetry) {
        console.log(`Job ${job.id} will be retried (attempt ${job.attempts + 1}/${job.max_attempts})`)
        return NextResponse.json({ 
          message: 'Job failed, will retry',
          jobId: job.id,
          documentId: job.document_id,
          attempt: job.attempts + 1,
          maxAttempts: job.max_attempts
        })
      } else {
        console.log(`Job ${job.id} failed permanently after ${job.attempts + 1} attempts`)
        return NextResponse.json({ 
          error: 'Job failed permanently',
          jobId: job.id,
          documentId: job.document_id,
          errorMessage: errorMessage
        }, { status: 500 })
      }
    }

  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Also support POST for manual triggering (optional)
export async function POST(request: NextRequest) {
  return GET(request)
}