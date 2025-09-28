import { POST } from '../route'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchSimilarDocuments } from '@/lib/pinecone'

// Mock dependencies
jest.mock('@/lib/supabase/server')
jest.mock('@/lib/pinecone')

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockSearchSimilarDocuments = searchSimilarDocuments as jest.MockedFunction<typeof searchSimilarDocuments>

// Mock console methods to reduce test noise
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

describe('/api/documents/[id]/similar API Route', () => {
  let mockSupabase: any

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Setup default Supabase mock
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
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'doc-123',
                status: 'completed',
                extracted_text: 'Sample text',
                user_id: 'user-123',
                metadata: {}
              },
              error: null
            }),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'embedding-1',
                  document_id: 'doc-123',
                  embedding: '[0.1, 0.2, 0.3]',
                  text: 'Sample chunk',
                  chunk_index: 0,
                  page_number: 1
                }
              ],
              error: null
            })
          }),
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        }),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })
    }
    
    mockCreateClient.mockResolvedValue(mockSupabase)
    mockSearchSimilarDocuments.mockResolvedValue([])
  })

  const createMockRequest = (body: any, params: { id: string }) => {
    const request = new NextRequest('http://localhost:3000/api/documents/doc-123/similar', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json'
      }
    })
    
    return { request, params: Promise.resolve(params) }
  }

  it('should return 401 for unauthenticated users', async () => {
    // Mock authentication failure
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Unauthorized')
    })

    const { request, params } = createMockRequest({}, { id: 'doc-123' })
    const response = await POST(request, { params })
    
    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 for non-existent document', async () => {
    // Mock document not found
    mockSupabase.from().select().eq().single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }
    })

    const { request, params } = createMockRequest({}, { id: 'non-existent' })
    const response = await POST(request, { params })
    
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Document not found')
  })

  it('should apply business metadata filters correctly', async () => {
    const { request, params } = createMockRequest({
      filters: {
        law_firm: ['STB'],
        fund_manager: ['Blackstone'],
        min_score: 0.7,
        page_range: {
          use_entire_document: true
        }
      },
      topK: 20
    }, { id: 'doc-123' })

    mockSearchSimilarDocuments.mockResolvedValue([
      {
        id: 'vector-1',
        score: 0.8,
        metadata: {
          document_id: 'doc-456',
          text: 'Similar content'
        }
      }
    ])

    // Mock document fetch for results
    mockSupabase.from().select().in().eq.mockResolvedValue({
      data: [{
        id: 'doc-456',
        title: 'Similar Document',
        user_id: 'user-123',
        status: 'completed',
        metadata: {
          law_firm: 'STB',
          fund_manager: 'Blackstone'
        }
      }],
      error: null
    })

    const response = await POST(request, { params })
    
    expect(response.status).toBe(200)
    
    // Verify that searchSimilarDocuments was called with proper filters
    expect(mockSearchSimilarDocuments).toHaveBeenCalledWith(
      expect.any(Array), // embedding array
      expect.any(Number), // searchLimit
      expect.objectContaining({
        document_id: { $ne: 'doc-123' },
        'metadata.law_firm': { $in: ['STB'] },
        'metadata.fund_manager': { $in: ['Blackstone'] }
      })
    )
  })

  it('should not include empty filter arrays in Pinecone query', async () => {
    const { request, params } = createMockRequest({
      filters: {
        law_firm: [],
        fund_manager: ['Blackstone'],
        fund_admin: [],
        jurisdiction: [],
        min_score: 0.7,
        page_range: {
          use_entire_document: true
        }
      },
      topK: 20
    }, { id: 'doc-123' })

    mockSearchSimilarDocuments.mockResolvedValue([])

    await POST(request, { params })
    
    // Verify only non-empty filters are included
    expect(mockSearchSimilarDocuments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      expect.objectContaining({
        document_id: { $ne: 'doc-123' },
        'metadata.fund_manager': { $in: ['Blackstone'] }
        // Should NOT include law_firm, fund_admin, or jurisdiction
      })
    )
    
    const pineconeFilter = mockSearchSimilarDocuments.mock.calls[0][2]
    expect(pineconeFilter).not.toHaveProperty('metadata.law_firm')
    expect(pineconeFilter).not.toHaveProperty('metadata.fund_admin')
    expect(pineconeFilter).not.toHaveProperty('metadata.jurisdiction')
  })

  it('should handle multiple business filters simultaneously', async () => {
    const { request, params } = createMockRequest({
      filters: {
        law_firm: ['STB'],
        fund_manager: ['Blackstone'],
        fund_admin: ['Standish'],
        jurisdiction: ['Delaware'],
        min_score: 0.7,
        page_range: {
          use_entire_document: true
        }
      },
      topK: 20
    }, { id: 'doc-123' })

    mockSearchSimilarDocuments.mockResolvedValue([])

    await POST(request, { params })
    
    // Verify all filters are applied
    expect(mockSearchSimilarDocuments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      expect.objectContaining({
        document_id: { $ne: 'doc-123' },
        'metadata.law_firm': { $in: ['STB'] },
        'metadata.fund_manager': { $in: ['Blackstone'] },
        'metadata.fund_admin': { $in: ['Standish'] },
        'metadata.jurisdiction': { $in: ['Delaware'] }
      })
    )
  })

  it('should maintain backward compatibility with legacy filters', async () => {
    const { request, params } = createMockRequest({
      filters: {
        law_firm: ['STB'],
        investor_type: ['PE'],
        document_type: ['Contract'],
        min_score: 0.7,
        page_range: {
          use_entire_document: true
        }
      },
      topK: 20
    }, { id: 'doc-123' })

    mockSearchSimilarDocuments.mockResolvedValue([])

    await POST(request, { params })
    
    // Verify both new and legacy filters are applied
    expect(mockSearchSimilarDocuments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      expect.objectContaining({
        document_id: { $ne: 'doc-123' },
        'metadata.law_firm': { $in: ['STB'] },
        'metadata.investor_type': { $in: ['PE'] },
        'metadata.document_type': { $in: ['Contract'] }
      })
    )
  })

  it('should return empty array when no similar documents found', async () => {
    mockSearchSimilarDocuments.mockResolvedValue([])

    const { request, params } = createMockRequest({
      filters: {
        law_firm: ['NonExistentFirm'],
        min_score: 0.7,
        page_range: {
          use_entire_document: true
        }
      },
      topK: 20
    }, { id: 'doc-123' })

    const response = await POST(request, { params })
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual([])
  })

  it('should return 500 for internal server errors', async () => {
    // Mock Pinecone error
    mockSearchSimilarDocuments.mockRejectedValue(new Error('Pinecone error'))

    const { request, params } = createMockRequest({
      filters: { min_score: 0.7 },
      topK: 20
    }, { id: 'doc-123' })

    const response = await POST(request, { params })
    
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Internal server error')
  })

  it('should validate minimum score filter', async () => {
    mockSearchSimilarDocuments.mockResolvedValue([
      {
        id: 'vector-1',
        score: 0.6, // Below minimum
        metadata: {
          document_id: 'doc-456',
          text: 'Low similarity content'
        }
      },
      {
        id: 'vector-2', 
        score: 0.8, // Above minimum
        metadata: {
          document_id: 'doc-789',
          text: 'High similarity content'
        }
      }
    ])

    // Mock document fetch
    mockSupabase.from().select().in().eq.mockResolvedValue({
      data: [{
        id: 'doc-789',
        title: 'High Similarity Document',
        user_id: 'user-123',
        status: 'completed',
        metadata: {}
      }],
      error: null
    })

    const { request, params } = createMockRequest({
      filters: {
        min_score: 0.7 // Should filter out 0.6 score
      },
      topK: 20
    }, { id: 'doc-123' })

    const response = await POST(request, { params })
    
    expect(response.status).toBe(200)
    const data = await response.json()
    
    // Should only return the document with score >= 0.7
    expect(data).toHaveLength(1)
    expect(data[0].document.id).toBe('doc-789')
    expect(data[0].score).toBeGreaterThanOrEqual(0.7)
  })
})