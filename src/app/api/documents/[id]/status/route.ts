import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import CacheManager from '@/lib/cache'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Try to get status from cache first
    const cachedStatus = await CacheManager.getProcessingStatus(id)
    if (cachedStatus && cachedStatus.user_id === user.id) {
      // For processing documents, check if cache is still fresh (30 seconds)
      const cacheAge = Date.now() - new Date(cachedStatus.cached_at).getTime()
      if (cacheAge < 30000 || cachedStatus.status !== 'processing') {
        return NextResponse.json(cachedStatus)
      }
    }

    // Get document with full details
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to fetch document status' }, { status: 500 })
    }

    // Get latest processing status
    const { data: processingStatus } = await supabase
      .from('processing_status')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Get job information if exists
    const { data: job } = await supabase
      .from('document_jobs')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Generate detailed status
    const detailedStatus = getDetailedStatus(document, processingStatus, job)

    const statusResponse = {
      id: document.id,
      status: document.status,
      detailed_status: detailedStatus,
      progress: processingStatus?.progress || 0,
      message: processingStatus?.message || detailedStatus.message,
      processing_method: job?.processing_method || 'sync',
      error: document.processing_error,
      created_at: document.created_at,
      updated_at: document.updated_at,
      user_id: user.id,
      cached_at: new Date().toISOString()
    }

    // Cache the status (shorter TTL for processing documents)
    const cacheTTL = document.status === 'processing' ? 30 : 300 // 30s for processing, 5min for others
    await CacheManager.setProcessingStatus(id, statusResponse)

    // Remove user_id and cached_at from response
    const { user_id, cached_at, ...publicResponse } = statusResponse

    return NextResponse.json(publicResponse)

  } catch (error) {
    console.error('Status fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface DetailedStatus {
  phase: string
  message: string
  estimatedTimeRemaining?: string
  processingMethod: 'sync' | 'batch'
  isStale?: boolean
}

function getDetailedStatus(document: any, processingStatus: any, job: any): DetailedStatus {
  const status = document.status
  const processingMethod = job?.processing_method || 'sync'
  const now = new Date()
  const updatedAt = new Date(document.updated_at)
  const timeSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / 1000) // seconds
  
  // Check if status is stale (no updates for more than 5 minutes during processing)
  const isStale = status === 'processing' && timeSinceUpdate > 300

  switch (status) {
    case 'queued':
      return {
        phase: 'Queued',
        message: 'Document is queued for processing',
        estimatedTimeRemaining: processingMethod === 'batch' ? '5-10 minutes' : '1-2 minutes',
        processingMethod,
        isStale: false
      }

    case 'processing':
      if (processingMethod === 'batch') {
        if (job?.batch_operation_id) {
          return {
            phase: 'Batch Processing',
            message: 'Document is being processed by Google Cloud Document AI. This may take several minutes.',
            estimatedTimeRemaining: isStale ? 'Unknown (checking status...)' : '3-8 minutes remaining',
            processingMethod,
            isStale
          }
        } else {
          return {
            phase: 'Preparing Batch',
            message: 'Uploading document to Google Cloud Storage for batch processing...',
            estimatedTimeRemaining: '1-2 minutes',
            processingMethod,
            isStale
          }
        }
      } else {
        // Sync processing phases based on processing_status
        if (processingStatus) {
          const progress = processingStatus.progress || 0
          let phase = 'Processing'
          let timeEstimate = '30-60 seconds'
          
          if (progress < 30) {
            phase = 'Starting'
            timeEstimate = '1-2 minutes'
          } else if (progress < 50) {
            phase = 'Analyzing Document'
            timeEstimate = '30-90 seconds'
          } else if (progress < 80) {
            phase = 'Extracting Data'
            timeEstimate = '30-60 seconds'
          } else {
            phase = 'Generating Embeddings'
            timeEstimate = '30-45 seconds'
          }

          return {
            phase,
            message: processingStatus.message || 'Processing document...',
            estimatedTimeRemaining: isStale ? 'Unknown (checking status...)' : timeEstimate,
            processingMethod,
            isStale
          }
        }

        return {
          phase: 'Processing',
          message: 'Document is being processed...',
          estimatedTimeRemaining: isStale ? 'Unknown (checking status...)' : '1-2 minutes',
          processingMethod,
          isStale
        }
      }

    case 'completed':
      return {
        phase: 'Completed',
        message: 'Document has been successfully processed and is ready for use',
        processingMethod,
        isStale: false
      }

    case 'error':
      const errorMessage = document.processing_error || 'An error occurred during processing'
      return {
        phase: 'Error',
        message: `Processing failed: ${errorMessage}`,
        processingMethod,
        isStale: false
      }

    default:
      return {
        phase: 'Unknown',
        message: `Document status: ${status}`,
        processingMethod,
        isStale: false
      }
  }
}