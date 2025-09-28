import { createServiceClient } from '@/lib/supabase/server'
import { indexDocumentInPinecone } from '@/lib/pinecone'
import { NextRequest, NextResponse } from 'next/server'

/**
 * API endpoint to reprocess existing documents and add business metadata to their Pinecone vectors
 * This fixes the issue where documents processed before the metadata fix don't have 
 * business metadata in Pinecone, causing filters to return no results.
 * 
 * Usage:
 * POST /api/admin/reprocess-metadata - Reprocess all documents
 * POST /api/admin/reprocess-metadata?documentId=<id> - Reprocess specific document
 */

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const documentId = searchParams.get('documentId')
  
  try {
    if (documentId) {
      console.log(`🎯 Reprocessing specific document: ${documentId}`)
      const result = await reprocessSingleDocument(documentId)
      return NextResponse.json(result)
    } else {
      console.log('🔄 Reprocessing all documents with business metadata...')
      const result = await reprocessAllDocuments()
      return NextResponse.json(result)
    }
  } catch (error) {
    console.error('💥 Error during reprocessing:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}

async function reprocessAllDocuments() {
  const supabase = createServiceClient()
  
  // Get all completed documents that have embeddings
  console.log('📋 Fetching documents with embeddings...')
  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('id, filename, metadata')
    .eq('status', 'completed')
    .not('metadata', 'is', null)
  
  if (docsError) {
    throw new Error(`Failed to fetch documents: ${docsError.message}`)
  }
  
  if (!documents || documents.length === 0) {
    return {
      success: true,
      message: 'No completed documents with metadata found.',
      documentsProcessed: 0
    }
  }
  
  console.log(`📊 Found ${documents.length} documents to reprocess`)
  
  let successCount = 0
  let errorCount = 0
  const errors: string[] = []
  
  // Process each document
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    console.log(`📝 Processing ${i + 1}/${documents.length}: ${doc.filename}`)
    console.log(`📋 Business metadata:`, doc.metadata)
    
    try {
      await reprocessDocumentEmbeddings(doc.id, doc.metadata)
      successCount++
      console.log(`✅ Completed ${doc.filename}`)
    } catch (error) {
      errorCount++
      const errorMessage = `Failed to process ${doc.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
      console.error(`❌ ${errorMessage}`)
      errors.push(errorMessage)
    }
  }
  
  console.log(`🎉 Reprocessing complete! Success: ${successCount}, Errors: ${errorCount}`)
  
  return {
    success: true,
    message: `Reprocessed ${successCount} documents successfully`,
    documentsProcessed: successCount,
    errors: errorCount > 0 ? errors : undefined,
    summary: {
      total: documents.length,
      success: successCount,
      errors: errorCount
    }
  }
}

async function reprocessSingleDocument(documentId: string) {
  const supabase = createServiceClient()
  
  // Get the specific document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, filename, metadata, status')
    .eq('id', documentId)
    .single()
  
  if (docError || !doc) {
    throw new Error(`Document ${documentId} not found: ${docError?.message}`)
  }
  
  if (doc.status !== 'completed') {
    throw new Error(`Document ${documentId} is not completed (status: ${doc.status})`)
  }
  
  if (!doc.metadata) {
    return {
      success: true,
      message: 'Document has no business metadata, skipping...',
      documentsProcessed: 0
    }
  }
  
  console.log(`📝 Document: ${doc.filename}`)
  console.log(`📋 Business metadata:`, doc.metadata)
  
  await reprocessDocumentEmbeddings(documentId, doc.metadata)
  
  console.log(`✅ Successfully reprocessed ${doc.filename}!`)
  
  return {
    success: true,
    message: `Successfully reprocessed ${doc.filename}`,
    documentsProcessed: 1,
    document: {
      id: documentId,
      filename: doc.filename,
      metadata: doc.metadata
    }
  }
}

async function reprocessDocumentEmbeddings(documentId: string, metadata: any) {
  const supabase = createServiceClient()
  
  // Get all embeddings for this document
  const { data: embeddings, error: embeddingsError } = await supabase
    .from('document_embeddings')
    .select('*')
    .eq('document_id', documentId)
  
  if (embeddingsError) {
    throw new Error(`Failed to fetch embeddings: ${embeddingsError.message}`)
  }
  
  if (!embeddings || embeddings.length === 0) {
    throw new Error('No embeddings found for this document')
  }
  
  console.log(`🔍 Found ${embeddings.length} embeddings to update in Pinecone`)
  
  // Update each embedding vector in Pinecone with business metadata
  for (const embedding of embeddings) {
    const vectorMetadata = {
      document_id: documentId,
      chunk_index: embedding.chunk_index || 0,
      text: embedding.chunk_text,
      // Include business metadata for filtering, removing null values
      ...Object.fromEntries(
        Object.entries(metadata).filter(([_, value]) => value !== null && value !== undefined)
      )
    }
    
    // Only include page_number if it's not null
    if (embedding.page_number !== null && embedding.page_number !== undefined) {
      vectorMetadata.page_number = embedding.page_number
    }
    
    // Parse embedding if it's stored as a string
    const embeddingArray = typeof embedding.embedding === 'string' 
      ? JSON.parse(embedding.embedding) 
      : embedding.embedding
    
    await indexDocumentInPinecone(embedding.vector_id, embeddingArray, vectorMetadata)
    console.log(`   ✅ Updated vector ${embedding.vector_id} with business metadata`)
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Reprocess Metadata API',
    usage: {
      'POST /api/admin/reprocess-metadata': 'Reprocess all documents',
      'POST /api/admin/reprocess-metadata?documentId=<id>': 'Reprocess specific document'
    }
  })
}