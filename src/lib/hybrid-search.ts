import { searchSimilarDocuments } from '@/lib/pinecone'
import { generateEmbeddings } from '@/lib/embeddings-vertex'
import { createServiceClient } from '@/lib/supabase/server'
import { AdvancedRankingEngine } from '@/lib/advanced-ranking'

interface SearchResult {
  documentId: string
  score: number
  algorithm: string
  metadata: Record<string, any>
  chunks: Array<{
    text: string
    score: number
    pageNumber?: number
  }>
}

interface HybridSearchOptions {
  query: string
  topK: number
  filters?: Record<string, any>
  enableSemanticSearch?: boolean
  enableKeywordSearch?: boolean
  enableHybridRanking?: boolean
  enableAdvancedRanking?: boolean
  semanticWeight?: number
  keywordWeight?: number
  userId: string
  businessContext?: {
    currentProject?: string
    focusAreas?: string[]
    priorityMetadata?: Record<string, number>
  }
}

interface HybridSearchResult {
  results: SearchResult[]
  totalResults: number
  searchTime: number
  algorithmsUsed: string[]
  metadata: {
    semanticResults?: number
    keywordResults?: number
    hybridScore?: boolean
    advancedRanking?: boolean
  }
}

export class HybridSearchEngine {
  
  static async search(options: HybridSearchOptions): Promise<HybridSearchResult> {
    const startTime = Date.now()
    const {
      query,
      topK,
      filters = {},
      enableSemanticSearch = true,
      enableKeywordSearch = true,
      enableHybridRanking = true,
      enableAdvancedRanking = true,
      semanticWeight = 0.7,
      keywordWeight = 0.3,
      userId,
      businessContext
    } = options

    console.log(`🔍 Starting hybrid search for: "${query}"`)
    console.log(`📊 Configuration: semantic=${enableSemanticSearch}, keyword=${enableKeywordSearch}, hybrid=${enableHybridRanking}`)

    const algorithmsUsed: string[] = []
    const allResults: SearchResult[] = []

    // 1. Semantic Vector Search
    let semanticResults: SearchResult[] = []
    if (enableSemanticSearch) {
      try {
        console.log(`🧠 Performing semantic vector search...`)
        semanticResults = await this.semanticVectorSearch(query, topK * 2, filters, userId)
        algorithmsUsed.push('semantic-vector')
        console.log(`✅ Semantic search found ${semanticResults.length} results`)
      } catch (error) {
        console.error('Semantic search failed:', error)
      }
    }

    // 2. Keyword-based Search
    let keywordResults: SearchResult[] = []
    if (enableKeywordSearch) {
      try {
        console.log(`🔍 Performing keyword-based search...`)
        keywordResults = await this.keywordSearch(query, topK * 2, filters, userId)
        algorithmsUsed.push('keyword-matching')
        console.log(`✅ Keyword search found ${keywordResults.length} results`)
      } catch (error) {
        console.error('Keyword search failed:', error)
      }
    }

    // 3. Combine and rank results
    let finalResults: SearchResult[]
    if (enableHybridRanking && semanticResults.length > 0 && keywordResults.length > 0) {
      console.log(`🔀 Combining results with hybrid ranking...`)
      finalResults = this.hybridRanking(semanticResults, keywordResults, semanticWeight, keywordWeight)
      algorithmsUsed.push('hybrid-ranking')
    } else {
      // Fallback to single algorithm or simple combination
      finalResults = [...semanticResults, ...keywordResults]
        .sort((a, b) => b.score - a.score)
        .slice(0, topK * 2)
    }

    // 4. Remove duplicates and apply advanced ranking
    const uniqueResults = this.deduplicateResults(finalResults)
    
    let rankedResults = uniqueResults
    if (enableAdvancedRanking) {
      console.log(`🎯 Applying advanced ranking to ${uniqueResults.length} results...`)
      
      // Get user preferences for personalization
      const userPreferences = await AdvancedRankingEngine.getUserRankingPreferences(userId)
      
      // Create ranking context
      const rankingContext = {
        userId,
        userPreferences,
        businessContext
      }
      
      // Apply advanced ranking
      const rankedScores = await AdvancedRankingEngine.rankResults(
        uniqueResults.map(r => ({ document: { id: r.documentId, ...r.metadata }, score: r.score })),
        query,
        rankingContext,
        {
          enablePersonalization: true,
          enableBusinessContext: !!businessContext,
          enableQualityScoring: true,
          enableDiversityBoost: true
        }
      )
      
      // Update results with new scores and explanations
      rankedResults = rankedScores.map(scored => {
        const original = uniqueResults.find(r => r.documentId === scored.documentId)!
        return {
          ...original,
          score: scored.finalScore,
          algorithm: original.algorithm + (scored.finalScore !== scored.baseScore ? '+advanced-ranking' : ''),
          rankingExplanation: scored.explanation
        }
      })
      
      algorithmsUsed.push('advanced-ranking')
      console.log(`✅ Advanced ranking completed`)
    }
    
    const topResults = rankedResults.slice(0, topK)

    const searchTime = Date.now() - startTime
    console.log(`⚡ Hybrid search completed in ${searchTime}ms`)
    console.log(`📈 Final results: ${topResults.length} documents`)

    return {
      results: topResults,
      totalResults: rankedResults.length,
      searchTime,
      algorithmsUsed,
      metadata: {
        semanticResults: semanticResults.length,
        keywordResults: keywordResults.length,
        hybridScore: enableHybridRanking,
        advancedRanking: enableAdvancedRanking
      }
    }
  }

  private static async semanticVectorSearch(
    query: string,
    limit: number,
    filters: Record<string, any>,
    userId: string
  ): Promise<SearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await generateEmbeddings(query)
    
    // Add user filter
    const pineconeFilters = {
      ...filters,
      // Add any additional semantic-specific filters
    }

    // Search similar vectors
    const vectorResults = await searchSimilarDocuments(queryEmbedding, limit, pineconeFilters)
    
    // Group by document and aggregate scores
    const documentMap = new Map<string, SearchResult>()
    
    for (const result of vectorResults) {
      const docId = result.metadata.document_id
      
      if (!documentMap.has(docId)) {
        documentMap.set(docId, {
          documentId: docId,
          score: result.score,
          algorithm: 'semantic-vector',
          metadata: result.metadata,
          chunks: [{
            text: result.metadata.text || '',
            score: result.score,
            pageNumber: result.metadata.page_number
          }]
        })
      } else {
        const existing = documentMap.get(docId)!
        existing.chunks.push({
          text: result.metadata.text || '',
          score: result.score,
          pageNumber: result.metadata.page_number
        })
        // Update overall score (use max score for now, could be more sophisticated)
        existing.score = Math.max(existing.score, result.score)
      }
    }

    return Array.from(documentMap.values())
      .sort((a, b) => b.score - a.score)
  }

  private static async keywordSearch(
    query: string,
    limit: number,
    filters: Record<string, any>,
    userId: string
  ): Promise<SearchResult[]> {
    const supabase = createServiceClient()
    
    // Prepare keyword search with PostgreSQL full-text search
    const keywords = this.extractKeywords(query)
    const searchTerms = keywords.join(' | ') // OR search
    
    console.log(`🔍 Keyword search terms: ${searchTerms}`)

    // Build the query
    let queryBuilder = supabase
      .from('documents')
      .select(`
        id,
        title,
        filename,
        extracted_text,
        metadata,
        created_at
      `)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .textSearch('extracted_text', searchTerms)

    // Apply filters
    if (filters.law_firm) {
      queryBuilder = queryBuilder.in('metadata->>law_firm', Array.isArray(filters.law_firm) ? filters.law_firm : [filters.law_firm])
    }
    if (filters.fund_manager) {
      queryBuilder = queryBuilder.in('metadata->>fund_manager', Array.isArray(filters.fund_manager) ? filters.fund_manager : [filters.fund_manager])
    }
    if (filters.fund_admin) {
      queryBuilder = queryBuilder.in('metadata->>fund_admin', Array.isArray(filters.fund_admin) ? filters.fund_admin : [filters.fund_admin])
    }
    if (filters.jurisdiction) {
      queryBuilder = queryBuilder.in('metadata->>jurisdiction', Array.isArray(filters.jurisdiction) ? filters.jurisdiction : [filters.jurisdiction])
    }

    const { data: documents, error } = await queryBuilder
      .limit(limit)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Keyword search error:', error)
      return []
    }

    if (!documents || documents.length === 0) {
      return []
    }

    // Calculate keyword-based scores
    return documents.map(doc => {
      const score = this.calculateKeywordScore(query, doc.extracted_text || '', doc.title)
      
      return {
        documentId: doc.id,
        score,
        algorithm: 'keyword-matching',
        metadata: {
          document_id: doc.id,
          title: doc.title,
          filename: doc.filename,
          ...doc.metadata
        },
        chunks: [{
          text: this.extractRelevantText(query, doc.extracted_text || ''),
          score,
          pageNumber: undefined
        }]
      }
    })
    .filter(result => result.score > 0.1) // Filter out very low scores
    .sort((a, b) => b.score - a.score)
  }

  private static hybridRanking(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    semanticWeight: number,
    keywordWeight: number
  ): SearchResult[] {
    const hybridMap = new Map<string, SearchResult>()
    
    // Normalize scores to 0-1 range
    const maxSemanticScore = Math.max(...semanticResults.map(r => r.score), 0.001)
    const maxKeywordScore = Math.max(...keywordResults.map(r => r.score), 0.001)
    
    // Process semantic results
    for (const result of semanticResults) {
      const normalizedScore = result.score / maxSemanticScore
      hybridMap.set(result.documentId, {
        ...result,
        score: normalizedScore * semanticWeight,
        algorithm: 'hybrid',
        chunks: result.chunks
      })
    }
    
    // Process keyword results and combine
    for (const result of keywordResults) {
      const normalizedScore = result.score / maxKeywordScore
      const existing = hybridMap.get(result.documentId)
      
      if (existing) {
        // Combine scores
        existing.score += normalizedScore * keywordWeight
        existing.chunks = [...existing.chunks, ...result.chunks]
          .sort((a, b) => b.score - a.score)
          .slice(0, 5) // Keep top 5 chunks
      } else {
        hybridMap.set(result.documentId, {
          ...result,
          score: normalizedScore * keywordWeight,
          algorithm: 'hybrid',
          chunks: result.chunks
        })
      }
    }
    
    return Array.from(hybridMap.values())
      .sort((a, b) => b.score - a.score)
  }

  private static deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>()
    return results.filter(result => {
      if (seen.has(result.documentId)) {
        return false
      }
      seen.add(result.documentId)
      return true
    })
  }

  private static extractKeywords(query: string): string[] {
    // Simple keyword extraction - could be enhanced with NLP
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'].includes(word))
  }

  private static calculateKeywordScore(query: string, text: string, title: string): number {
    const queryLower = query.toLowerCase()
    const textLower = text.toLowerCase()
    const titleLower = title.toLowerCase()
    
    let score = 0
    
    // Exact phrase match gets highest score
    if (textLower.includes(queryLower)) {
      score += 1.0
    }
    
    // Title matches get bonus
    if (titleLower.includes(queryLower)) {
      score += 0.5
    }
    
    // Individual keyword matches
    const keywords = this.extractKeywords(query)
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
      const matches = (text.match(regex) || []).length
      score += matches * 0.1
    }
    
    // Normalize by text length
    score = score / Math.log(text.length / 1000 + 1)
    
    return Math.min(score, 1.0)
  }

  private static extractRelevantText(query: string, text: string, maxLength: number = 200): string {
    const queryLower = query.toLowerCase()
    const sentences = text.split(/[.!?]+/)
    
    // Find sentences containing query terms
    const relevantSentences = sentences.filter(sentence => 
      sentence.toLowerCase().includes(queryLower) ||
      this.extractKeywords(query).some(keyword => 
        sentence.toLowerCase().includes(keyword)
      )
    )
    
    if (relevantSentences.length > 0) {
      let result = relevantSentences[0].trim()
      if (result.length > maxLength) {
        result = result.substring(0, maxLength) + '...'
      }
      return result
    }
    
    // Fallback to beginning of text
    return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '')
  }
}