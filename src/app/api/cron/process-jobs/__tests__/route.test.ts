import { GET } from '../route'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processDocument } from '@/lib/document-processing'
import { batchProcessor } from '@/lib/document-ai-batch'

// Mock dependencies
jest.mock('@supabase/supabase-js')
jest.mock('@/lib/document-processing')
jest.mock('@/lib/document-ai-batch')

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockProcessDocument = processDocument as jest.MockedFunction<typeof processDocument>
const mockBatchProcessor = batchProcessor as jest.Mocked<typeof batchProcessor>

// Mock console methods
const originalConsoleLog = console.log
const originalConsoleError = console.error
beforeAll(() => {
  console.log = jest.fn()
  console.error = jest.fn()
})
afterAll(() => {
  console.log = originalConsoleLog
  console.error = originalConsoleError
})

describe('/api/cron/process-jobs API Route', () => {
  let mockSupabase: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock environment variables
    process.env.CRON_SECRET = 'test-secret'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

    // Setup Supabase mock
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          }),
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'doc-123',
                title: 'Test Document',
                filename: 'test.pdf',
                file_size: 1024 * 1024,
                user_id: 'user-123'
              },
              error: null
            })
          })
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      })
    }

    mockCreateClient.mockReturnValue(mockSupabase)
    mockProcessDocument.mockResolvedValue({})
  })

  const createMockRequest = (authHeader?: string) => {
    return new NextRequest('http://localhost:3000/api/cron/process-jobs', {
      method: 'GET',
      headers: authHeader ? { authorization: authHeader } : {}
    })
  }

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should reject requests with invalid authorization', async () => {
      const request = createMockRequest('Bearer wrong-secret')
      const response = await GET(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should accept requests with valid authorization', async () => {
      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
    })
  })

  describe('Job Processing', () => {
    it('should return message when no jobs are queued', async () => {
      // Mock no jobs found
      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [],
        error: null
      })

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('No jobs to process')
    })

    it('should process a queued sync job successfully', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'queued',
        attempts: 0,
        max_attempts: 3,
        processing_method: null,
        documents: [{
          id: 'doc-123',
          title: 'Test Document',
          filename: 'test.pdf',
          file_size: 1024 * 1024,
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Document processed successfully (sync)')
      expect(data.jobId).toBe('job-123')

      // Verify job was marked as processing
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        status: 'processing',
        started_at: expect.any(String),
        attempts: 1
      })

      // Verify document was processed
      expect(mockProcessDocument).toHaveBeenCalledWith('doc-123')
    })

    it('should handle sync-to-batch processing switch', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'queued',
        attempts: 0,
        max_attempts: 3,
        processing_method: 'sync',
        documents: [{
          id: 'doc-123',
          title: 'Large Document',
          filename: 'large.pdf',
          file_size: 20 * 1024 * 1024, // 20MB
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      // Mock document processor switching to batch
      mockProcessDocument.mockResolvedValue({ switchedToBatch: true })

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Document switched to batch processing')
      expect(data.switchedToBatch).toBe(true)

      // Verify job was updated to batch processing
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        processing_method: 'batch',
        status: 'processing'
      })
    })

    it('should handle batch processing initiation', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'queued',
        attempts: 0,
        max_attempts: 3,
        processing_method: 'batch',
        batch_operation_id: null,
        documents: [{
          id: 'doc-123',
          title: 'Large Document',
          filename: 'large.pdf',
          file_size: 50 * 1024 * 1024, // 50MB
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      mockBatchProcessor.startBatchProcessing.mockResolvedValue('batch-op-456')

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Batch processing initiated')
      expect(data.operationId).toBe('batch-op-456')

      expect(mockBatchProcessor.startBatchProcessing).toHaveBeenCalledWith('doc-123')
    })

    it('should check existing batch operation status', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'processing',
        attempts: 1,
        max_attempts: 3,
        processing_method: 'batch',
        batch_operation_id: 'batch-op-456',
        documents: [{
          id: 'doc-123',
          title: 'Large Document',
          filename: 'large.pdf',
          file_size: 50 * 1024 * 1024,
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      // Mock batch operation still running
      mockBatchProcessor.checkBatchOperationStatus.mockResolvedValue({
        status: 'RUNNING',
        progress: 50
      })

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Batch processing in progress')
      expect(data.progress).toBe(50)
    })

    it('should complete successful batch operation', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'processing',
        attempts: 1,
        max_attempts: 3,
        processing_method: 'batch',
        batch_operation_id: 'batch-op-456',
        documents: [{
          id: 'doc-123',
          title: 'Large Document',
          filename: 'large.pdf',
          file_size: 50 * 1024 * 1024,
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      // Mock batch operation completed
      mockBatchProcessor.checkBatchOperationStatus.mockResolvedValue({
        status: 'SUCCEEDED'
      })

      // Mock successful batch result processing
      mockBatchProcessor.processBatchResults.mockResolvedValue(undefined)
      mockBatchProcessor.cleanupBatchOperation.mockResolvedValue(undefined)

      // Mock document with extracted text for embeddings
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: {
          extracted_text: 'Extracted text from batch processing'
        },
        error: null
      })

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Batch processing completed')

      // Verify cleanup was called
      expect(mockBatchProcessor.cleanupBatchOperation).toHaveBeenCalledWith('doc-123')

      // Verify job was marked as completed
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        status: 'completed',
        completed_at: expect.any(String)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle job processing failures with retry', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'queued',
        attempts: 1,
        max_attempts: 3,
        processing_method: 'sync',
        documents: [{
          id: 'doc-123',
          title: 'Test Document',
          filename: 'test.pdf',
          file_size: 1024 * 1024,
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      // Mock processing failure
      mockProcessDocument.mockRejectedValue(new Error('Temporary network error'))

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Job failed, will retry')
      expect(data.attempt).toBe(2)

      // Verify job was queued for retry
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        status: 'queued',
        error_message: 'Temporary network error',
        completed_at: null
      })
    })

    it('should handle permanent job failure after max attempts', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'queued',
        attempts: 3,
        max_attempts: 3,
        processing_method: 'sync',
        documents: [{
          id: 'doc-123',
          title: 'Test Document',
          filename: 'test.pdf',
          file_size: 1024 * 1024,
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      // Mock persistent failure
      mockProcessDocument.mockRejectedValue(new Error('Permanent processing error'))

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Job failed permanently')

      // Verify job was marked as failed
      expect(mockSupabase.from().update).toHaveBeenCalledWith({
        status: 'failed',
        error_message: 'Permanent processing error',
        completed_at: expect.any(String)
      })
    })

    it('should handle batch operation failures', async () => {
      const mockJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'processing',
        processing_method: 'batch',
        batch_operation_id: 'batch-op-456',
        attempts: 1,
        max_attempts: 3,
        documents: [{ id: 'doc-123' }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [mockJob],
        error: null
      })

      // Mock batch operation failed
      mockBatchProcessor.checkBatchOperationStatus.mockResolvedValue({
        status: 'FAILED',
        error: 'Document AI processing failed'
      })

      const request = createMockRequest('Bearer test-secret')
      
      await expect(async () => {
        await GET(request)
      }).rejects.toThrow('Batch operation failed: Document AI processing failed')
    })

    it('should handle database errors', async () => {
      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      })

      const request = createMockRequest('Bearer test-secret')
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch jobs')
    })
  })

  describe('Sync-First Approach', () => {
    it('should always try sync processing first regardless of file size', async () => {
      const largeJob = {
        id: 'job-123',
        document_id: 'doc-123',
        status: 'queued',
        attempts: 0,
        max_attempts: 3,
        processing_method: null, // No processing method set
        documents: [{
          id: 'doc-123',
          title: 'Large Document',
          filename: 'large.pdf',
          file_size: 50 * 1024 * 1024, // 50MB - would traditionally be batch
          user_id: 'user-123'
        }]
      }

      mockSupabase.from().select().in().order().limit.mockResolvedValue({
        data: [largeJob],
        error: null
      })

      const request = createMockRequest('Bearer test-secret')
      await GET(request)

      // Should attempt sync processing first
      expect(mockProcessDocument).toHaveBeenCalledWith('doc-123')
      
      // Should set processing method to sync
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          processing_method: 'sync'
        })
      )
    })
  })
})