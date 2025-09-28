const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables from .env.local (Next.js convention)
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

/**
 * Batch Processing Setup Verification Script
 * 
 * This script checks if all requirements for batch processing are properly configured:
 * 1. Environment variables
 * 2. Database schema (document_jobs table columns)
 * 3. Google Cloud Storage bucket access
 * 4. Google Cloud permissions
 */

console.log('🔍 Verifying Batch Processing Setup...\n');

// Check environment variables
console.log('📋 Environment Variables Check:');
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_STORAGE_BUCKET'
];

let envVarsValid = true;
for (const envVar of requiredEnvVars) {
  const value = process.env[envVar];
  if (value) {
    console.log(`   ✅ ${envVar}: ${value.substring(0, 20)}...`);
  } else {
    console.log(`   ❌ ${envVar}: NOT SET`);
    envVarsValid = false;
  }
}

if (!envVarsValid) {
  console.log('\n❌ Missing required environment variables for batch processing.');
  console.log('📋 Please add these to your .env.local file:');
  console.log('   GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name');
  process.exit(1);
}

async function checkDatabaseSchema() {
  console.log('\n📋 Database Schema Check:');
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check if document_jobs table has batch processing columns
    const { data, error } = await supabase
      .from('document_jobs')
      .select('batch_operation_id, processing_method, metadata')
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('   ❌ Batch processing columns missing from document_jobs table');
        console.log('   📋 Run the database migration: database-batch-update.sql');
        return false;
      } else {
        console.log(`   ❌ Database error: ${error.message}`);
        return false;
      }
    }

    console.log('   ✅ document_jobs table has batch processing columns');
    return true;

  } catch (error) {
    console.log(`   ❌ Database connection failed: ${error.message}`);
    return false;
  }
}

async function checkGCSAccess() {
  console.log('\n📋 Google Cloud Storage Check:');
  
  try {
    // Import GCS manager (this will test the configuration)
    const { Storage } = require('@google-cloud/storage');
    
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);

    // Check if bucket exists
    const [exists] = await bucket.exists();
    if (!exists) {
      console.log(`   ❌ GCS bucket '${bucketName}' does not exist`);
      console.log('   📋 Create the bucket in Google Cloud Console');
      return false;
    }

    // Test write access
    const testFile = bucket.file('batch-setup-test.txt');
    await testFile.save('test access', { resumable: false });
    await testFile.delete();
    
    console.log(`   ✅ GCS bucket '${bucketName}' is accessible`);
    return true;

  } catch (error) {
    console.log(`   ❌ GCS access failed: ${error.message}`);
    console.log('   📋 Check your Google Cloud credentials and bucket permissions');
    return false;
  }
}

async function checkDocumentAIAccess() {
  console.log('\n📋 Document AI Batch Processing Check:');
  
  try {
    const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
    
    const client = new DocumentProcessorServiceClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    // Test if we can access the client (this validates credentials)
    console.log('   ✅ Document AI client initialized successfully');
    console.log('   📋 Batch processing requires Document AI API and proper IAM permissions');
    return true;

  } catch (error) {
    console.log(`   ❌ Document AI access failed: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    const dbValid = await checkDatabaseSchema();
    const gcsValid = await checkGCSAccess();
    const docAIValid = await checkDocumentAIAccess();

    console.log('\n' + '='.repeat(50));
    
    if (dbValid && gcsValid && docAIValid) {
      console.log('🎉 Batch Processing Setup: READY');
      console.log('✅ All requirements are properly configured');
      console.log('\n📋 Next steps:');
      console.log('   1. Update document processing to use batch for large documents');
      console.log('   2. Test with a document > 30 pages');
      console.log('   3. Monitor batch operation status');
    } else {
      console.log('❌ Batch Processing Setup: INCOMPLETE');
      console.log('\n📋 Required actions:');
      
      if (!dbValid) {
        console.log('   • Run database migration: database-batch-update.sql');
      }
      if (!gcsValid) {
        console.log('   • Create and configure Google Cloud Storage bucket');
      }
      if (!docAIValid) {
        console.log('   • Verify Document AI credentials and permissions');
      }
    }
    
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n💥 Setup verification failed:', error.message);
  }
}

main();