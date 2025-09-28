import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { HybridSearchEngine } from '@/lib/hybrid-search'
import { SearchFilters } from '@/types'
import CacheManager, { createCacheHash } from '@/lib/cache'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      query,
      filters = {}, 
      topK = 20,
      enableSemanticSearch = true,
      enableKeywordSearch = true,
      enableHybridRanking = true,
      semanticWeight = 0.7,
      keywordWeight = 0.3
    }: { 
      query: string
      filters?: SearchFilters
      topK?: number
      enableSemanticSearch?: boolean
      enableKeywordSearch?: boolean
      enableHybridRanking?: boolean
      semanticWeight?: number
      keywordWeight?: number
    } = body

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    console.log(`🔍 Hybrid search request: "${query}"`)
    console.log(`📊 Options: semantic=${enableSemanticSearch}, keyword=${enableKeywordSearch}, hybrid=${enableHybridRanking}`)

    // Create cache key
    const cacheKey = createCacheHash({ 
      query, 
      filters, 
      topK, 
      enableSemanticSearch, 
      enableKeywordSearch, 
      enableHybridRanking,
      semanticWeight,
      keywordWeight,
      userId: user.id
    })
    
    // Try to get cached results first
    const cachedResults = await CacheManager.getSearchResults(cacheKey)
    if (cachedResults) {
      console.log(`🚀 Cache hit for hybrid search: "${query}"`)
      return NextResponse.json(cachedResults)
    }
    
    console.log(`🔍 Cache miss for hybrid search: "${query}" - performing full search`)

    // Convert filters to Pinecone format
    const pineconeFilters: Record<string, any> = {}

    // Business metadata filters
    if (filters.law_firm && filters.law_firm.length > 0) {
      pineconeFilters['law_firm'] = { $in: filters.law_firm }
    }
    if (filters.fund_manager && filters.fund_manager.length > 0) {
      pineconeFilters['fund_manager'] = { $in: filters.fund_manager }
    }
    if (filters.fund_admin && filters.fund_admin.length > 0) {
      pineconeFilters['fund_admin'] = { $in: filters.fund_admin }
    }
    if (filters.jurisdiction && filters.jurisdiction.length > 0) {
      pineconeFilters['jurisdiction'] = { $in: filters.jurisdiction }
    }

    // Perform hybrid search
    const searchResults = await HybridSearchEngine.search({
      query,
      topK,
      filters: pineconeFilters,
      enableSemanticSearch,
      enableKeywordSearch,
      enableHybridRanking,
      semanticWeight,
      keywordWeight,
      userId: user.id
    })

    if (searchResults.results.length === 0) {
      console.log(`No results found for query: "${query}"`)
      return NextResponse.json({
        results: [],
        metadata: searchResults.metadata,
        searchTime: searchResults.searchTime,
        algorithmsUsed: searchResults.algorithmsUsed
      })
    }

    // Get document details from Supabase
    const documentIds = searchResults.results.map(r => r.documentId)
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .in('id', documentIds)
      .eq('user_id', user.id)
      .eq('status', 'completed')

    if (fetchError) {
      console.error('Database error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch search results' }, { status: 500 })
    }

    // Apply date range filter if specified
    let filteredDocuments = documents || []
    if (filters.date_range) {
      filteredDocuments = filteredDocuments.filter(doc => {
        const docDate = new Date(doc.created_at)
        const startDate = filters.date_range?.start_date ? new Date(filters.date_range.start_date) : null
        const endDate = filters.date_range?.end_date ? new Date(filters.date_range.end_date) : null

        if (startDate && docDate < startDate) return false
        if (endDate && docDate > endDate) return false
        return true
      })
    }

    // Build final results
    const finalResults = filteredDocuments
      .map(document => {
        const searchResult = searchResults.results.find(r => r.documentId === document.id)
        if (!searchResult) return null

        return {
          document,
          score: searchResult.score,
          algorithm: searchResult.algorithm,
          matching_chunks: searchResult.chunks
            .sort((a, b) => b.score - a.score)
            .slice(0, 3) // Keep top 3 matching chunks per document
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)

    const response = {
      results: finalResults,
      metadata: {
        ...searchResults.metadata,
        totalDocuments: finalResults.length,
        query,
        searchTime: searchResults.searchTime,
        algorithmsUsed: searchResults.algorithmsUsed
      }
    }

    // Cache the results for future requests
    await CacheManager.setSearchResults(cacheKey, response)
    console.log(`💾 Cached hybrid search results for "${query}"`)

    return NextResponse.json(response)

  } catch (error) {
    console.error('Hybrid search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}