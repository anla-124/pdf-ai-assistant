const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const documentId = '53c2273a-5bcd-441c-a2f8-34c45a4f2320';

async function checkDocumentJobs() {
  console.log('🔍 Checking document_jobs table...\n');
  
  // Check if document_jobs record exists
  const { data: jobs, error: jobsError } = await supabase
    .from('document_jobs')
    .select('*')
    .eq('document_id', documentId);
    
  if (jobsError) {
    console.log('❌ Error querying document_jobs:', jobsError.message);
    return;
  }
  
  console.log(`📋 Found ${jobs.length} job records for document ${documentId}`);
  
  if (jobs.length > 0) {
    jobs.forEach((job, index) => {
      console.log(`\n📄 Job ${index + 1}:`);
      console.log(`   Document ID: ${job.document_id}`);
      console.log(`   Batch Operation ID: ${job.batch_operation_id || 'Not set'}`);
      console.log(`   Processing Method: ${job.processing_method || 'Not set'}`);
      console.log(`   Metadata: ${job.metadata ? JSON.stringify(job.metadata, null, 2) : 'None'}`);
      console.log(`   Created: ${job.created_at}`);
      console.log(`   Updated: ${job.updated_at}`);
    });
  } else {
    console.log('❌ No job records found - this explains why batch status monitoring is not working!');
    console.log('\n🔧 Creating missing document_jobs record...');
    
    // Create the missing record
    const { error: insertError } = await supabase
      .from('document_jobs')
      .insert({
        document_id: documentId,
        batch_operation_id: '12901451959259614896',
        processing_method: 'batch',
        metadata: {
          operationId: '12901451959259614896',
          status: 'completed',
          inputUri: `gs://anduin-pdf-ai-batch-processing/batch-processing/input/${documentId}/`,
          outputUri: `gs://anduin-pdf-ai-batch-processing/batch-processing/output/${documentId}/`,
          processorType: 'form_parser'
        }
      });
      
    if (insertError) {
      console.log('❌ Failed to create document_jobs record:', insertError.message);
    } else {
      console.log('✅ Successfully created document_jobs record');
    }
  }
  
  // Also check document status
  console.log('\n📋 Checking document status...');
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id, status, page_count, extracted_text')
    .eq('id', documentId)
    .single();
    
  if (docError) {
    console.log('❌ Error querying document:', docError.message);
  } else {
    console.log(`📄 Document status: ${doc.status}`);
    console.log(`📊 Page count: ${doc.page_count}`);
    console.log(`📝 Extracted text: ${doc.extracted_text ? `${Math.round(doc.extracted_text.length / 1024)}KB` : 'None'}`);
  }
}

checkDocumentJobs();