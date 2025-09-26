import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchSimilarDocuments } from '@/lib/pinecone'
import { SimilaritySearchResult, SearchFilters } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log(`🔍 Starting similarity search for document ${id} (cancellation supported)`)
    
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { filters = {}, topK = 20 }: { filters?: SearchFilters; topK?: number } = body

    // Get the source document
    const { data: sourceDocument, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (docError) {
      if (docError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
    }

    if (sourceDocument.status !== 'completed' || !sourceDocument.extracted_text) {
      return NextResponse.json({ 
        error: 'Document processing not completed or no text extracted' 
      }, { status: 400 })
    }

    // Check if embeddings are available
    if (sourceDocument.metadata?.embeddings_skipped) {
      return NextResponse.json({ 
        error: 'Similarity search unavailable: ' + (sourceDocument.metadata.embeddings_error || 'Embeddings were not generated for this document'),
        code: 'EMBEDDINGS_UNAVAILABLE'
      }, { status: 400 })
    }

    // Get embeddings for the source document chunks from Supabase
    const { data: sourceEmbeddings, error: embeddingError } = await supabase
      .from('document_embeddings')
      .select('*')
      .eq('document_id', id)
      .order('chunk_index')

    if (embeddingError || !sourceEmbeddings || sourceEmbeddings.length === 0) {
      return NextResponse.json({ 
        error: 'Source document embeddings not found. Please reprocess this document.',
        code: 'NO_SOURCE_EMBEDDINGS'
      }, { status: 400 })
    }

    // Source chunk count is simply the number of embeddings we fetched
    const sourceDocChunkCount = sourceEmbeddings.length

    // Build Pinecone filter from search filters
    const pineconeFilter: Record<string, any> = {}

    // Exclude the source document itself
    pineconeFilter.document_id = { $ne: id }

    // Apply additional filters if provided
    if (filters.investor_type && filters.investor_type.length > 0) {
      pineconeFilter['metadata.investor_type'] = { $in: filters.investor_type }
    }

    if (filters.document_type && filters.document_type.length > 0) {
      pineconeFilter['metadata.document_type'] = { $in: filters.document_type }
    }

    if (filters.tags && filters.tags.length > 0) {
      pineconeFilter['metadata.tags'] = { $in: filters.tags }
    }

    // Get user's total document count for adaptive search optimization
    const { count: totalDocs } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed')
    
    // Adaptive searchLimit based on library size
    // Tiny libraries (1-10 docs): searchLimit = 30-50
    // Small libraries (10-100 docs): searchLimit = 50-100
    // Medium libraries (100-800 docs): searchLimit = 100-200  
    // Large libraries (800+ docs): searchLimit = 200-250
    const librarySize = totalDocs || 0
    
    let searchLimit
    if (librarySize <= 10) {
      // For very small libraries, use minimal search
      searchLimit = Math.max(topK * 2, 30) // Much more aggressive
    } else if (librarySize <= 100) {
      // Small libraries
      searchLimit = Math.max(topK * 5, 50)
    } else {
      // Medium to large libraries  
      const baseLimit = Math.max(topK * 10, 50)
      const adaptiveLimit = Math.min(250, Math.max(50, Math.floor(librarySize / 8)))
      searchLimit = Math.max(baseLimit, adaptiveLimit)
    }
    
    // Search for similar documents using each chunk from the source document
    const allSimilarVectors = new Map<string, {score: number, text: string, docId: string}>()
    
    console.log(`📊 Library size: ${librarySize} documents`)
    console.log(`🔍 Adaptive searchLimit: ${searchLimit} per chunk (was fixed at 250)`)
    if (librarySize <= 10) {
      console.log(`💡 Tiny library calculation: Math.max(${topK} * 2, 30) = ${searchLimit}`)
    } else if (librarySize <= 100) {
      console.log(`💡 Small library calculation: Math.max(${topK} * 5, 50) = ${searchLimit}`)
    } else {
      const baseLimit = Math.max(topK * 10, 50)
      const adaptiveLimit = Math.min(250, Math.max(50, Math.floor(librarySize / 8)))
      console.log(`💡 Large library calculation: Math.max(${baseLimit}, ${adaptiveLimit}) = ${searchLimit}`)
    }
    console.log(`Searching with ${sourceEmbeddings.length} source chunks, searchLimit=${searchLimit} per chunk`)
    
    // Search with each source chunk embedding
    for (let i = 0; i < sourceEmbeddings.length; i++) {
      // Check if request was cancelled
      if (request.signal?.aborted) {
        console.log('🛑 Similarity search cancelled by user at chunk', i)
        return new NextResponse('Search cancelled', { status: 499 })
      }

      const sourceChunk = sourceEmbeddings[i]
      
      if (!sourceChunk.embedding) {
        console.warn(`Source chunk ${i} has no embedding, skipping`)
        continue
      }
      
      // Parse the embedding from PostgreSQL vector format to number array
      let chunkEmbedding: number[]
      if (typeof sourceChunk.embedding === 'string') {
        // Parse string format like "[0.123, -0.456, ...]" to number array
        chunkEmbedding = JSON.parse(sourceChunk.embedding)
      } else if (Array.isArray(sourceChunk.embedding)) {
        chunkEmbedding = sourceChunk.embedding
      } else {
        console.warn(`Invalid embedding format for chunk ${i}:`, typeof sourceChunk.embedding)
        continue
      }
      
      if (!Array.isArray(chunkEmbedding) || chunkEmbedding.length === 0) {
        console.warn(`Chunk ${i} has invalid embedding array:`, chunkEmbedding)
        continue
      }
      
      const chunkResults = await searchSimilarDocuments(chunkEmbedding, searchLimit, pineconeFilter)
      
      // Check for cancellation after each Pinecone search
      if (request.signal?.aborted) {
        console.log('🛑 Similarity search cancelled by user after Pinecone search for chunk', i)
        return new NextResponse('Search cancelled', { status: 499 })
      }
      
      console.log(`Chunk ${i} search: found ${chunkResults.length} similar vectors`)
      
      // Debug: log the document IDs found for this chunk
      const docIds = new Set(chunkResults.map(r => r.metadata.document_id).filter(Boolean))
      console.log(`  Documents found: [${Array.from(docIds).join(', ')}]`)
      
      if (chunkResults.length > 0) {
        const topScores = chunkResults.slice(0, 3).map(r => `${Math.round(r.score * 100)}%`).join(', ')
        console.log(`  Top scores: [${topScores}]`)
      }
      
      // Add results to our aggregated map, keeping the highest score for each vector
      for (const result of chunkResults) {
        const key = result.id
        if (!allSimilarVectors.has(key) || allSimilarVectors.get(key)!.score < result.score) {
          allSimilarVectors.set(key, {
            score: result.score,
            text: result.metadata.text || '',
            docId: result.metadata.document_id
          })
        }
      }
    }
    
    // Convert to array format
    const similarVectors = Array.from(allSimilarVectors.entries()).map(([id, data]) => ({
      id,
      score: data.score,
      metadata: {
        document_id: data.docId,
        text: data.text
      }
    }))
    
    // Final cancellation check before expensive processing
    if (request.signal?.aborted) {
      console.log('🛑 Similarity search cancelled by user before final processing')
      return new NextResponse('Search cancelled', { status: 499 })
    }
    
    console.log(`Total unique vectors found: ${similarVectors.length}`)
    
    // Debug: show document distribution in results
    const docDistribution = new Map<string, number>()
    for (const vector of similarVectors) {
      const docId = vector.metadata.document_id
      docDistribution.set(docId, (docDistribution.get(docId) || 0) + 1)
    }
    console.log('Document distribution in vectors:')
    for (const [docId, count] of docDistribution.entries()) {
      console.log(`  ${docId}: ${count} chunks`)
    }

    if (similarVectors.length === 0) {
      console.log('No similar vectors found - search returned empty results')
      return NextResponse.json([])
    }

    // Group results by document_id and get unique documents
    const documentScores = new Map<string, { score: number; chunks: Array<{ text: string; score: number }> }>()

    for (const vector of similarVectors) {
      const docId = vector.metadata.document_id
      
      if (!documentScores.has(docId)) {
        documentScores.set(docId, { score: 0, chunks: [] })
      }

      const existing = documentScores.get(docId)!
      existing.chunks.push({
        text: vector.metadata.text || '',
        score: vector.score
      })
    }


    // Get target document chunk counts for proportional scoring
    const targetDocIds = Array.from(documentScores.keys())
    const { data: targetDocChunkCounts } = await supabase
      .from('document_embeddings')
      .select('document_id, chunk_index')
      .in('document_id', targetDocIds)
      .order('document_id, chunk_index', { ascending: false })

    const targetChunkCountMap = new Map<string, number>()
    if (targetDocChunkCounts) {
      // Group by document_id and get max chunk_index + 1 for each
      const grouped = targetDocChunkCounts.reduce((acc, item) => {
        if (!acc[item.document_id]) {
          acc[item.document_id] = item.chunk_index + 1 // Convert to count (0-based to 1-based)
        }
        return acc
      }, {} as Record<string, number>)
      
      Object.entries(grouped).forEach(([docId, count]) => {
        targetChunkCountMap.set(docId, count)
      })
    }

    // Calculate proportional similarity scores for each document
    for (const [docId, data] of documentScores.entries()) {
      const targetDocChunkCount = targetChunkCountMap.get(docId) || data.chunks.length
      
      // Coverage ratio: how much of the source document content we found
      const sourceCoverage = Math.min(data.chunks.length / sourceDocChunkCount, 1.0)
      
      // Proportional ratio: account for document size differences
      const proportionalRatio = Math.min(sourceDocChunkCount / targetDocChunkCount, 1.0)
      
      // Average similarity of matching chunks
      const avgSimilarity = data.chunks.reduce((sum, chunk) => sum + chunk.score, 0) / data.chunks.length
      
      // Symmetric similarity scoring for bidirectional results
      const sizeRatio = sourceDocChunkCount / targetDocChunkCount
      
      if (sizeRatio >= 0.9 && sizeRatio <= 1.1) {
        // Documents are similar in size - use original coverage + similarity algorithm
        data.score = (sourceCoverage * 0.5) + (avgSimilarity * 0.5)
      } else {
        // Calculate bidirectional overlap for asymmetric documents
        const smallerDocSize = Math.min(sourceDocChunkCount, targetDocChunkCount)
        const largerDocSize = Math.max(sourceDocChunkCount, targetDocChunkCount)
        
        // Calculate what portion of content is shared between both documents
        const sharedContentRatio = smallerDocSize / largerDocSize
        const effectiveOverlap = Math.min(data.chunks.length / smallerDocSize, 1.0)
        
        // Symmetric similarity: how much content do they share relative to their combined content
        // This gives the same score regardless of direction
        data.score = sharedContentRatio * effectiveOverlap * avgSimilarity
      }
      
      // Enhanced logging
      console.log(`=== PROPORTIONAL SIMILARITY CALCULATION for ${docId} ===`)
      console.log(`Source chunks: ${sourceDocChunkCount}`)
      console.log(`Target chunks: ${targetDocChunkCount}`)
      console.log(`Found chunks: ${data.chunks.length}`)
      console.log(`Size ratio: ${sourceDocChunkCount}/${targetDocChunkCount} = ${Math.round(sizeRatio * 100)}%`)
      console.log(`Source coverage: ${data.chunks.length}/${sourceDocChunkCount} = ${Math.round(sourceCoverage * 100)}%`)
      console.log(`Proportional ratio: ${Math.round(proportionalRatio * 100)}%`)
      console.log(`Individual chunk scores: [${data.chunks.map(c => Math.round(c.score * 100) + '%').join(', ')}]`)
      console.log(`Average similarity: ${Math.round(avgSimilarity * 100)}%`)
      
      if (sizeRatio >= 0.9 && sizeRatio <= 1.1) {
        console.log(`Algorithm: Similar sizes - (${Math.round(sourceCoverage * 100)}% × 0.5) + (${Math.round(avgSimilarity * 100)}% × 0.5) = ${Math.round(data.score * 100)}%`)
      } else {
        const smallerDocSize = Math.min(sourceDocChunkCount, targetDocChunkCount)
        const largerDocSize = Math.max(sourceDocChunkCount, targetDocChunkCount)
        const sharedContentRatio = smallerDocSize / largerDocSize
        const effectiveOverlap = Math.min(data.chunks.length / smallerDocSize, 1.0)
        
        console.log(`Algorithm: Symmetric similarity`)
        console.log(`  Smaller doc: ${smallerDocSize} chunks, Larger doc: ${largerDocSize} chunks`)
        console.log(`  Shared content ratio: ${Math.round(sharedContentRatio * 100)}% (${smallerDocSize}/${largerDocSize})`)
        console.log(`  Effective overlap: ${Math.round(effectiveOverlap * 100)}%`)
        console.log(`  Average similarity: ${Math.round(avgSimilarity * 100)}%`)
        console.log(`  Final: ${Math.round(sharedContentRatio * 100)}% × ${Math.round(effectiveOverlap * 100)}% × ${Math.round(avgSimilarity * 100)}% = ${Math.round(data.score * 100)}%`)
      }
      console.log(`=== END ===`)
    }

    // Apply minimum score filter if specified
    const minScore = filters.min_score || 0.7
    
    console.log(`=== FILTERING RESULTS ===`)
    console.log(`Minimum score filter: ${minScore} (${Math.round(minScore * 100)}%)`)
    console.log(`Total documents before filtering: ${documentScores.size}`)
    
    const allResults = Array.from(documentScores.entries())
      .sort((a, b) => {
        // Primary sort: by score (descending)
        const scoreDiff = b[1].score - a[1].score
        if (Math.abs(scoreDiff) > 0.001) return scoreDiff
        
        // Secondary sort: by document ID (ascending) for stable ordering
        return a[0].localeCompare(b[0])
      })
    
    console.log('All documents with scores:')
    allResults.forEach(([docId, data]) => {
      const exactScore = data.score * 100
      const roundedScore = Math.round(exactScore)
      const passes = data.score >= minScore ? '✅' : '❌'
      console.log(`  ${docId}: ${exactScore.toFixed(2)}% (displayed as ${roundedScore}%) ${passes}`)
      
      // Debug potential rounding issues
      if (Math.abs(exactScore - (minScore * 100)) < 1) {
        console.log(`    ⚠️  Close to filter threshold: exact=${exactScore.toFixed(4)}%, filter=${(minScore * 100).toFixed(2)}%`)
      }
    })
    
    // Use a small tolerance to handle floating-point precision and rounding issues
    // If the rounded percentage matches the filter, include it
    const passedFilter = allResults.filter(([_, data]) => {
      const exactScore = data.score * 100
      const roundedScore = Math.round(exactScore)
      const filterPercentage = Math.round(minScore * 100)
      
      // Pass if either the exact score meets threshold OR the rounded score meets threshold
      return data.score >= minScore || roundedScore >= filterPercentage
    })
    
    console.log(`Documents passed filter: ${passedFilter.length}`)
    console.log(`TopK limit: ${topK}`)
    
    // If more documents pass than topK, show which ones are getting cut off
    if (passedFilter.length > topK) {
      console.log(`⚠️  ${passedFilter.length - topK} documents will be cut off by topK limit!`)
      console.log('Documents that will be cut off:')
      passedFilter.slice(topK).forEach(([docId, data]) => {
        console.log(`  ${docId}: ${(data.score * 100).toFixed(2)}%`)
      })
    }
    
    const filteredDocuments = passedFilter.slice(0, topK)
    
    console.log(`Final documents returned: ${filteredDocuments.length}`)
    console.log(`=== END FILTERING ===`)

    if (filteredDocuments.length === 0) {
      return NextResponse.json([])
    }

    // Fetch document details from Supabase
    const documentIds = filteredDocuments.map(([docId]) => docId)
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .in('id', documentIds)
      .eq('user_id', user.id)
      .eq('status', 'completed')

    if (fetchError) {
      console.error('Database error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch similar documents' }, { status: 500 })
    }

    // Apply additional date range filter if specified
    let filteredResults = documents || []

    if (filters.date_range) {
      filteredResults = filteredResults.filter(doc => {
        const docDate = new Date(doc.created_at)
        const startDate = filters.date_range?.start_date ? new Date(filters.date_range.start_date) : null
        const endDate = filters.date_range?.end_date ? new Date(filters.date_range.end_date) : null

        if (startDate && docDate < startDate) return false
        if (endDate && docDate > endDate) return false
        return true
      })
    }

    // Build final results with scores and matching chunks
    const results: SimilaritySearchResult[] = filteredResults.map(document => {
      const scoreData = documentScores.get(document.id)!
      return {
        document,
        score: scoreData.score,
        matching_chunks: scoreData.chunks
          .sort((a, b) => b.score - a.score)
          .slice(0, 3) // Keep top 3 matching chunks per document
      }
    })

    return NextResponse.json(results)

  } catch (error) {
    console.error('Similarity search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}