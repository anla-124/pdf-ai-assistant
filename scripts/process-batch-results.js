const { Storage } = require('@google-cloud/storage');
const { createClient } = require('@supabase/supabase-js');
// Import these directly since we're running from scripts directory
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔄 Processing Completed Batch Results...\n');

async function processBatchResults() {
  const documentId = '53c2273a-5bcd-441c-a2f8-34c45a4f2320'; // From the bucket path
  const operationId = '12901451959259614896'; // From your logs
  
  console.log(`📋 Processing document: ${documentId}`);
  console.log(`🔄 Operation ID: ${operationId}`);
  
  try {
    // Initialize Google Cloud Storage
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);
    
    // Download and process all batch result files
    const outputPrefix = `batch-processing/output/${documentId}/${operationId}/0/`;
    console.log(`📥 Looking for output files with prefix: ${outputPrefix}`);
    
    const [files] = await bucket.getFiles({ prefix: outputPrefix });
    const jsonFiles = files.filter(file => file.name.endsWith('.json'));
    
    console.log(`✅ Found ${jsonFiles.length} result files`);
    
    if (jsonFiles.length === 0) {
      throw new Error('No JSON result files found');
    }
    
    // Download and combine all results
    let allPages = [];
    let extractedText = '';
    let extractedFields = { fields: [], tables: [], checkboxes: [] };
    
    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];
      console.log(`📄 Processing file ${i + 1}/${jsonFiles.length}: ${file.name}`);
      
      const [contents] = await file.download();
      const batchResult = JSON.parse(contents.toString());
      
      console.log(`   📝 File structure: ${Object.keys(batchResult).join(', ')}`);
      
      // Batch results have text/pages/entities at the top level, not under 'document'
      
      // Extract text
      if (batchResult.text) {
        const textLength = batchResult.text.length;
        extractedText += batchResult.text + '\n';
        console.log(`   ✅ Extracted ${Math.round(textLength / 1024)}KB text from this file`);
      } else {
        console.log(`   ⚠️  No text field found`);
      }
      
      // Extract pages
      if (batchResult.pages) {
        const pageCount = batchResult.pages.length;
        allPages.push(...batchResult.pages);
        console.log(`   ✅ Found ${pageCount} pages in this file`);
      } else {
        console.log(`   ⚠️  No pages field found`);
      }
      
      // Extract entities
      if (batchResult.entities) {
        batchResult.entities.forEach(entity => {
          if (entity.type && entity.mentionText) {
            extractedFields.fields.push({
              name: entity.type,
              value: entity.mentionText,
              type: getFieldType(entity.type),
              confidence: entity.confidence || 0,
              pageNumber: getPageNumber(entity.pageAnchor),
              boundingBox: getBoundingBox(entity.pageAnchor),
            });
          }
        });
      }
    }
    
    const pageCount = allPages.length;
    console.log(`📊 Combined results: ${pageCount} pages, ${Math.round(extractedText.length / 1024)}KB text`);
    
    // Update document in Supabase
    const updateData = {
      extracted_text: extractedText,
      extracted_fields: extractedFields,
      page_count: pageCount,
      status: 'processing', // Keep processing until embeddings are complete
    };
    
    const { error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }
    
    console.log('✅ Document updated in Supabase');
    
    // Store individual extracted fields
    if (extractedFields.fields && extractedFields.fields.length > 0) {
      const fieldsToInsert = extractedFields.fields.map(field => ({
        document_id: documentId,
        field_name: field.name || 'Unknown',
        field_value: field.value || '',
        field_type: field.type || 'text',
        confidence: field.confidence || 0,
        page_number: field.pageNumber || null,
        bounding_box: field.boundingBox || null,
      }));

      const { error: fieldsError } = await supabase
        .from('extracted_fields')
        .insert(fieldsToInsert);
        
      if (fieldsError) {
        console.warn('Warning: Failed to store extracted fields:', fieldsError.message);
      } else {
        console.log(`✅ Stored ${fieldsToInsert.length} extracted fields`);
      }
    }
    
    // Generate embeddings and index in Pinecone
    console.log('🧠 Generating embeddings...');
    console.log('⏰ Note: Embedding generation will be handled by the main app. Skipping for now...');
    
    // Mark document as ready for embedding generation
    const { error: completionError } = await supabase
      .from('documents')
      .update({ 
        status: 'processing'
      })
      .eq('id', documentId);
      
    if (completionError) {
      throw new Error(`Failed to mark document as completed: ${completionError.message}`);
    }
    
    // Update processing status
    const { error: statusError } = await supabase
      .from('processing_status')
      .insert({
        document_id: documentId,
        status: 'processing',
        progress: 80,
        message: 'Batch processing completed. Ready for embedding generation.',
      });
      
    if (statusError) {
      console.warn('Warning: Failed to update processing status:', statusError.message);
    }
    
    console.log('\n🎉 Batch processing completed successfully!');
    console.log(`📋 Document ${documentId} text extracted and ready for embedding generation`);
    console.log(`📋 Next: Use the app's "Process Queued Jobs" to generate embeddings and complete processing`);
    
  } catch (error) {
    console.error('❌ Error processing batch results:', error.message);
    
    // Update document status to error
    await supabase
      .from('documents')
      .update({
        status: 'error',
        processing_error: error.message
      })
      .eq('id', documentId);
  }
}

// Embedding generation will be handled by the main app after this script completes

// Helper functions
function getFieldType(entityType) {
  const type = entityType.toLowerCase();
  if (type.includes('date') || type.includes('time')) return 'date';
  if (type.includes('number') || type.includes('amount') || type.includes('price')) return 'number';
  if (type.includes('checkbox') || type.includes('bool')) return 'checkbox';
  return 'text';
}

function getPageNumber(pageAnchor) {
  if (pageAnchor?.pageRefs?.[0]?.page) {
    return parseInt(pageAnchor.pageRefs[0].page) + 1;
  }
  return null;
}

function getBoundingBox(pageAnchor) {
  if (pageAnchor?.pageRefs?.[0]?.boundingPoly?.normalizedVertices) {
    const vertices = pageAnchor.pageRefs[0].boundingPoly.normalizedVertices;
    if (vertices.length >= 2) {
      return {
        x: vertices[0].x || 0,
        y: vertices[0].y || 0,
        width: (vertices[2]?.x || 1) - (vertices[0].x || 0),
        height: (vertices[2]?.y || 1) - (vertices[0].y || 0),
      };
    }
  }
  return null;
}

function extractTextByPages(pages, fullText) {
  const pagesText = [];
  
  if (pages && pages.length > 0) {
    for (const page of pages) {
      const pageNumber = page.pageNumber || 1;
      
      // Extract text for this specific page using text anchors
      let pageText = '';
      
      if (page.paragraphs) {
        for (const paragraph of page.paragraphs) {
          if (paragraph.layout?.textAnchor) {
            const paragraphText = getTextFromTextAnchor(fullText, paragraph.layout.textAnchor);
            if (paragraphText) {
              pageText += paragraphText + '\n';
            }
          }
        }
      }
      
      // Fallback: if no paragraphs, try to extract from lines
      if (!pageText && page.lines) {
        for (const line of page.lines) {
          if (line.layout?.textAnchor) {
            const lineText = getTextFromTextAnchor(fullText, line.layout.textAnchor);
            if (lineText) {
              pageText += lineText + '\n';
            }
          }
        }
      }
      
      if (pageText.trim()) {
        pagesText.push({
          text: pageText.trim(),
          pageNumber: pageNumber
        });
      }
    }
  }
  
  // Fallback: if no pages structure, treat entire text as page 1
  if (pagesText.length === 0 && fullText) {
    pagesText.push({
      text: fullText,
      pageNumber: 1
    });
  }
  
  return pagesText;
}

function getTextFromTextAnchor(documentText, textAnchor) {
  if (!textAnchor?.textSegments?.[0]) return null;
  
  const segment = textAnchor.textSegments[0];
  const startIndex = parseInt(segment.startIndex || '0');
  const endIndex = parseInt(segment.endIndex || documentText.length.toString());
  
  return documentText.substring(startIndex, endIndex);
}

function splitTextIntoPagedChunks(pagesText, chunkSize, overlap = 200) {
  const pagedChunks = [];
  let globalChunkIndex = 0;
  
  for (const pageInfo of pagesText) {
    const pageChunks = splitTextIntoChunks(pageInfo.text, chunkSize, overlap);
    
    for (const chunkText of pageChunks) {
      pagedChunks.push({
        text: chunkText,
        chunkIndex: globalChunkIndex,
        pageNumber: pageInfo.pageNumber
      });
      globalChunkIndex++;
    }
  }
  
  return pagedChunks;
}

function splitTextIntoChunks(text, chunkSize, overlap = 200) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    // Try to break at a sentence or word boundary
    if (end < text.length) {
      const lastSentence = text.lastIndexOf('.', end);
      const lastWord = text.lastIndexOf(' ', end);
      
      if (lastSentence > start + chunkSize * 0.5) {
        end = lastSentence + 1;
      } else if (lastWord > start + chunkSize * 0.5) {
        end = lastWord;
      }
    }
    
    chunks.push(text.substring(start, end));
    start = Math.max(start + chunkSize - overlap, end);
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

processBatchResults();