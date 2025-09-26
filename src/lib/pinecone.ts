import { Pinecone } from '@pinecone-database/pinecone'

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
})

const indexName = process.env.PINECONE_INDEX_NAME || 'pdf-documents'

export async function initializePineconeIndex() {
  try {
    const index = pinecone.Index(indexName)
    return index
  } catch (error) {
    console.error('Error initializing Pinecone index:', error)
    throw new Error(`Failed to initialize Pinecone index: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function indexDocumentInPinecone(
  vectorId: string,
  embedding: number[],
  metadata: Record<string, any>
): Promise<void> {
  try {
    const index = await initializePineconeIndex()
    
    console.log(`Indexing vector ${vectorId} with ${embedding.length} dimensions`)
    
    await index.upsert([{
      id: vectorId,
      values: embedding,
      metadata: {
        ...metadata,
        // Ensure metadata is JSON serializable
        timestamp: new Date().toISOString(),
        embedding_model: 'vertex-ai-gecko', // Track which model was used
      }
    }])
    
    console.log(`Indexed vector ${vectorId} in Pinecone with Vertex AI embeddings`)
  } catch (error) {
    console.error('Error indexing document in Pinecone:', error)
    if (error instanceof Error && error.message?.includes('dimension')) {
      throw new Error('Pinecone index dimension mismatch. Vertex AI uses 768 dimensions. Please create a new Pinecone index with 768 dimensions.')
    }
    throw new Error(`Failed to index document in Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function searchSimilarDocuments(
  queryEmbedding: number[],
  topK: number = 10,
  filter?: Record<string, any>
): Promise<Array<{
  id: string
  score: number
  metadata: Record<string, any>
}>> {
  try {
    const index = await initializePineconeIndex()
    
    const queryRequest: any = {
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      includeValues: false,
    }

    if (filter) {
      queryRequest.filter = filter
    }

    const queryResponse = await index.query(queryRequest)
    
    if (!queryResponse.matches) {
      return []
    }

    return queryResponse.matches.map(match => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata || {},
    }))
  } catch (error) {
    console.error('Error searching similar documents in Pinecone:', error)
    throw new Error(`Failed to search similar documents: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function deleteDocumentFromPinecone(documentId: string): Promise<void> {
  try {
    const index = await initializePineconeIndex()
    
    // First, list all vectors for this document
    const listResponse = await index.listPaginated({
      prefix: `${documentId}_chunk_`,
    })

    if (listResponse.vectors && listResponse.vectors.length > 0) {
      const vectorIds = listResponse.vectors.map(v => v.id)
      
      // Delete all vectors for this document
      await index.deleteMany(vectorIds)
      
      console.log(`Deleted ${vectorIds.length} vectors for document ${documentId} from Pinecone`)
    }
  } catch (error) {
    console.error('Error deleting document from Pinecone:', error)
    // Don't throw here as this is cleanup - log the error but continue
  }
}

export async function updateDocumentMetadataInPinecone(
  documentId: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    const index = await initializePineconeIndex()
    
    // List all vectors for this document
    const listResponse = await index.listPaginated({
      prefix: `${documentId}_chunk_`,
    })

    if (listResponse.vectors && listResponse.vectors.length > 0) {
      const updates = listResponse.vectors.map(vector => ({
        id: vector.id,
        setMetadata: {
          ...((vector as any).metadata || {}),
          ...metadata,
          timestamp: new Date().toISOString(),
        }
      }))
      
      // Update metadata for all chunks
      for (const update of updates) {
        await index.update({
          id: update.id!,
          metadata: update.setMetadata,
        })
      }
      
      console.log(`Updated metadata for ${updates.length} vectors of document ${documentId} in Pinecone`)
    }
  } catch (error) {
    console.error('Error updating document metadata in Pinecone:', error)
    throw new Error(`Failed to update document metadata in Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function getIndexStats(): Promise<any> {
  try {
    const index = await initializePineconeIndex()
    const stats = await index.describeIndexStats()
    return stats
  } catch (error) {
    console.error('Error getting Pinecone index stats:', error)
    throw new Error(`Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}