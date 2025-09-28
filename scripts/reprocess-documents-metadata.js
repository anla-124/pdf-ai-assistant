const { createClient } = require('@supabase/supabase-js');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

/**
 * Script to reprocess existing documents and add business metadata to their Pinecone vectors
 * This fixes the issue where documents processed before the metadata fix don't have 
 * business metadata in Pinecone, causing filters to return no results.
 */

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

async function indexDocumentInPinecone(vectorId, embedding, metadata) {
  try {
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
    
    await index.upsert([{
      id: vectorId,
      values: embedding,
      metadata: metadata
    }]);
    
    return true;
  } catch (error) {
    console.error(`Failed to index vector ${vectorId} in Pinecone:`, error);
    throw error;
  }
}

async function reprocessDocumentsMetadata() {
  console.log('🔄 Starting to reprocess documents with business metadata...\n');
  
  try {
    // Get all completed documents that have embeddings
    console.log('📋 Fetching documents with embeddings...');
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, filename, metadata')
      .eq('status', 'completed')
      .not('metadata', 'is', null);
    
    if (docsError) {
      throw new Error(`Failed to fetch documents: ${docsError.message}`);
    }
    
    if (!documents || documents.length === 0) {
      console.log('❌ No completed documents with metadata found.');
      return;
    }
    
    console.log(`📊 Found ${documents.length} documents to reprocess:\n`);
    
    // Process each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      console.log(`📝 Processing ${i + 1}/${documents.length}: ${doc.filename}`);
      console.log(`📋 Business metadata:`, doc.metadata);
      
      // Get all embeddings for this document
      const { data: embeddings, error: embeddingsError } = await supabase
        .from('document_embeddings')
        .select('*')
        .eq('document_id', doc.id);
      
      if (embeddingsError) {
        console.error(`❌ Failed to fetch embeddings for ${doc.id}:`, embeddingsError.message);
        continue;
      }
      
      if (!embeddings || embeddings.length === 0) {
        console.log(`⚠️  No embeddings found for ${doc.filename}, skipping...`);
        continue;
      }
      
      console.log(`🔍 Found ${embeddings.length} embeddings to update in Pinecone`);
      
      // Update each embedding vector in Pinecone with business metadata
      for (const embedding of embeddings) {
        try {
          const metadata = {
            document_id: doc.id,
            chunk_index: embedding.chunk_index || 0,
            page_number: embedding.page_number || null,
            text: embedding.chunk_text,
            // Include business metadata for filtering
            ...doc.metadata
          };
          
          await indexDocumentInPinecone(embedding.vector_id, embedding.embedding, metadata);
          console.log(`   ✅ Updated vector ${embedding.vector_id} with business metadata`);
          
        } catch (pineconeError) {
          console.error(`   ❌ Failed to update vector ${embedding.vector_id}:`, pineconeError.message);
        }
      }
      
      console.log(`✅ Completed ${doc.filename}\n`);
    }
    
    console.log('🎉 Successfully reprocessed all documents with business metadata!');
    console.log('\n📋 Summary:');
    console.log(`   - Documents processed: ${documents.length}`);
    console.log(`   - Business metadata filters should now work correctly`);
    console.log('\n🧪 Next steps:');
    console.log('   1. Test the similarity search with business filters');
    console.log('   2. Verify that filtered searches now return results');
    console.log('   3. Run the validation checklist');
    
  } catch (error) {
    console.error('💥 Error during reprocessing:', error.message);
    process.exit(1);
  }
}

async function reprocessSingleDocument(documentId) {
  console.log(`🔄 Reprocessing single document: ${documentId}\n`);
  
  try {
    // Get the specific document
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, filename, metadata, status')
      .eq('id', documentId)
      .single();
    
    if (docError || !doc) {
      throw new Error(`Document ${documentId} not found: ${docError?.message}`);
    }
    
    if (doc.status !== 'completed') {
      throw new Error(`Document ${documentId} is not completed (status: ${doc.status})`);
    }
    
    if (!doc.metadata) {
      console.log('⚠️  Document has no business metadata, skipping...');
      return;
    }
    
    console.log(`📝 Document: ${doc.filename}`);
    console.log(`📋 Business metadata:`, doc.metadata);
    
    // Get all embeddings for this document
    const { data: embeddings, error: embeddingsError } = await supabase
      .from('document_embeddings')
      .select('*')
      .eq('document_id', documentId);
    
    if (embeddingsError) {
      throw new Error(`Failed to fetch embeddings: ${embeddingsError.message}`);
    }
    
    if (!embeddings || embeddings.length === 0) {
      console.log(`⚠️  No embeddings found for this document`);
      return;
    }
    
    console.log(`🔍 Found ${embeddings.length} embeddings to update in Pinecone`);
    
    // Update each embedding vector in Pinecone with business metadata
    for (const embedding of embeddings) {
      try {
        const metadata = {
          document_id: documentId,
          chunk_index: embedding.chunk_index || 0,
          page_number: embedding.page_number || null,
          text: embedding.chunk_text,
          // Include business metadata for filtering
          ...doc.metadata
        };
        
        await indexDocumentInPinecone(embedding.vector_id, embedding.embedding, metadata);
        console.log(`   ✅ Updated vector ${embedding.vector_id} with business metadata`);
        
      } catch (pineconeError) {
        console.error(`   ❌ Failed to update vector ${embedding.vector_id}:`, pineconeError.message);
      }
    }
    
    console.log(`✅ Successfully reprocessed ${doc.filename}!`);
    console.log('\n🧪 Test the similarity search with business filters to verify the fix.');
    
  } catch (error) {
    console.error('💥 Error during single document reprocessing:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const documentId = process.argv[2];
  
  if (documentId) {
    // Reprocess specific document
    console.log(`🎯 Reprocessing specific document: ${documentId}`);
    reprocessSingleDocument(documentId);
  } else {
    // Reprocess all documents
    reprocessDocumentsMetadata();
  }
}

module.exports = { reprocessDocumentsMetadata, reprocessSingleDocument };