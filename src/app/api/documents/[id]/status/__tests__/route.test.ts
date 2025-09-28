import { GET } from '../route'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Mock dependencies
jest.mock('@/lib/supabase/server')

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>

describe('/api/documents/[id]/status API Route', () => {
  let mockSupabase: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Supabase client
    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null
        })
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn(),
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest.fn()
              })
            })
          })
        })
      })
    }

    mockCreateClient.mockResolvedValue(mockSupabase)
  })

  const createMockRequest = (documentId: string) => {
    const request = new NextRequest(`http://localhost:3000/api/documents/${documentId}/status`)
    const params = Promise.resolve({ id: documentId })
    return { request, params }
  }

  describe('Authentication', () => {
    it('should return 401 for unauthenticated users', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Unauthorized')
      })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Document Status Retrieval', () => {
    it('should return 404 for non-existent document', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      })

      const { request, params } = createMockRequest('non-existent')
      const response = await GET(request, { params })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Document not found')
    })

    it('should return basic status for completed document', async () => {
      const mockDocument = {
        id: 'doc-123',
        status: 'completed',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z'
      }

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: mockDocument, error: null }) // Document query
        .mockResolvedValueOnce({ data: null, error: null }) // Processing status query
        .mockResolvedValueOnce({ data: null, error: null }) // Job query

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.id).toBe('doc-123')
      expect(data.status).toBe('completed')
      expect(data.detailed_status.phase).toBe('Completed')
      expect(data.detailed_status.message).toBe('Document has been successfully processed and is ready for use')
      expect(data.processing_method).toBe('sync')
    })

    it('should provide detailed status for processing document', async () => {
      const mockDocument = {
        id: 'doc-123',
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: new Date().toISOString() // Recent update
      }

      const mockProcessingStatus = {
        progress: 40,
        message: 'Extracting structured data...'
      }

      const mockJob = {
        processing_method: 'sync'
      }

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: mockDocument, error: null })
        .mockResolvedValueOnce({ data: mockProcessingStatus, error: null })
        .mockResolvedValueOnce({ data: mockJob, error: null })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.detailed_status.phase).toBe('Analyzing Document')
      expect(data.detailed_status.message).toBe('Extracting structured data...')
      expect(data.detailed_status.estimatedTimeRemaining).toBe('30-90 seconds')
      expect(data.detailed_status.processingMethod).toBe('sync')
      expect(data.detailed_status.isStale).toBe(false)
    })

    it('should detect stale processing status', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString()
      
      const mockDocument = {
        id: 'doc-123',
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: fiveMinutesAgo // Old update
      }

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: mockDocument, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { processing_method: 'sync' }, error: null })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.detailed_status.isStale).toBe(true)
      expect(data.detailed_status.estimatedTimeRemaining).toBe('Unknown (checking status...)')
    })

    it('should provide batch processing status', async () => {
      const mockDocument = {
        id: 'doc-123',
        status: 'processing',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: new Date().toISOString()
      }

      const mockJob = {
        processing_method: 'batch',
        batch_operation_id: 'batch-op-456'
      }

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: mockDocument, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: mockJob, error: null })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.detailed_status.phase).toBe('Batch Processing')
      expect(data.detailed_status.message).toBe('Document is being processed by Google Cloud Document AI. This may take several minutes.')
      expect(data.detailed_status.estimatedTimeRemaining).toBe('3-8 minutes remaining')
      expect(data.detailed_status.processingMethod).toBe('batch')
    })

    it('should handle error status', async () => {
      const mockDocument = {
        id: 'doc-123',
        status: 'error',
        processing_error: 'Document AI service unavailable',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z'
      }

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: mockDocument, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.detailed_status.phase).toBe('Error')
      expect(data.detailed_status.message).toBe('Processing failed: Document AI service unavailable')
      expect(data.error).toBe('Document AI service unavailable')
    })

    it('should handle queued status', async () => {
      const mockDocument = {
        id: 'doc-123',
        status: 'queued',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:30:00Z'
      }

      const mockJob = {
        processing_method: 'batch'
      }

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: mockDocument, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: mockJob, error: null })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.detailed_status.phase).toBe('Queued')
      expect(data.detailed_status.message).toBe('Document is queued for processing')
      expect(data.detailed_status.estimatedTimeRemaining).toBe('5-10 minutes')
      expect(data.detailed_status.processingMethod).toBe('batch')
    })
  })

  describe('Processing Phase Detection', () => {
    it('should correctly identify sync processing phases', async () => {
      const testCases = [
        { progress: 15, expectedPhase: 'Starting', expectedTime: '1-2 minutes' },
        { progress: 40, expectedPhase: 'Analyzing Document', expectedTime: '30-90 seconds' },
        { progress: 70, expectedPhase: 'Extracting Data', expectedTime: '30-60 seconds' },
        { progress: 90, expectedPhase: 'Generating Embeddings', expectedTime: '30-45 seconds' }
      ]

      for (const testCase of testCases) {
        const mockDocument = {
          id: 'doc-123',
          status: 'processing',
          updated_at: new Date().toISOString()
        }

        const mockProcessingStatus = {
          progress: testCase.progress,
          message: 'Processing...'
        }

        const mockJob = {
          processing_method: 'sync'
        }

        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({ data: mockDocument, error: null })
          .mockResolvedValueOnce({ data: mockProcessingStatus, error: null })
          .mockResolvedValueOnce({ data: mockJob, error: null })

        const { request, params } = createMockRequest('doc-123')
        const response = await GET(request, { params })
        const data = await response.json()

        expect(data.detailed_status.phase).toBe(testCase.expectedPhase)
        expect(data.detailed_status.estimatedTimeRemaining).toBe(testCase.expectedTime)

        jest.clearAllMocks()
        mockCreateClient.mockResolvedValue(mockSupabase)
      }
    })

    it('should correctly identify batch processing phases', async () => {
      const testCases = [
        { 
          hasOperationId: false, 
          expectedPhase: 'Preparing Batch',
          expectedMessage: 'Uploading document to Google Cloud Storage for batch processing...'
        },
        { 
          hasOperationId: true, 
          expectedPhase: 'Batch Processing',
          expectedMessage: 'Document is being processed by Google Cloud Document AI. This may take several minutes.'
        }
      ]

      for (const testCase of testCases) {
        const mockDocument = {
          id: 'doc-123',
          status: 'processing',
          updated_at: new Date().toISOString()
        }

        const mockJob = {
          processing_method: 'batch',
          batch_operation_id: testCase.hasOperationId ? 'batch-op-123' : null
        }

        mockSupabase.from().select().eq().single
          .mockResolvedValueOnce({ data: mockDocument, error: null })
          .mockResolvedValueOnce({ data: null, error: null })
          .mockResolvedValueOnce({ data: mockJob, error: null })

        const { request, params } = createMockRequest('doc-123')
        const response = await GET(request, { params })
        const data = await response.json()

        expect(data.detailed_status.phase).toBe(testCase.expectedPhase)
        expect(data.detailed_status.message).toBe(testCase.expectedMessage)

        jest.clearAllMocks()
        mockCreateClient.mockResolvedValue(mockSupabase)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to fetch document status')
    })

    it('should handle unknown document status', async () => {
      const mockDocument = {
        id: 'doc-123',
        status: 'unknown_status',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z'
      }

      mockSupabase.from().select().eq().single
        .mockResolvedValueOnce({ data: mockDocument, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      const { request, params } = createMockRequest('doc-123')
      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      
      expect(data.detailed_status.phase).toBe('Unknown')
      expect(data.detailed_status.message).toBe('Document status: unknown_status')
    })
  })
})