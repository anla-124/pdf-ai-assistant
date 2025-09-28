const { Storage } = require('@google-cloud/storage');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

console.log('🔍 Checking Batch Processing Status...\n');

async function checkGCSBucket() {
  console.log('📦 Checking GCS Bucket Contents:');
  
  try {
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);

    console.log(`   Bucket: gs://${bucketName}`);
    
    // List all files in the bucket
    const [files] = await bucket.getFiles();
    
    if (files.length === 0) {
      console.log('   ❌ Bucket is empty - no files found');
      return;
    }
    
    console.log(`   ✅ Found ${files.length} files:`);
    files.forEach(file => {
      console.log(`      📄 ${file.name} (${Math.round(file.metadata.size / 1024)}KB)`);
    });
    
    // Check for batch operation output folders
    const outputFolders = files.filter(file => file.name.includes('/') && file.name.includes('output'));
    if (outputFolders.length > 0) {
      console.log('\n   📋 Batch Output Folders Found:');
      outputFolders.forEach(file => {
        console.log(`      📁 ${file.name}`);
      });
    }
    
  } catch (error) {
    console.log(`   ❌ Error accessing bucket: ${error.message}`);
  }
}

async function checkBatchOperation() {
  console.log('\n🔄 Checking Batch Operation Status:');
  
  try {
    const client = new DocumentProcessorServiceClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    // The operation ID from your logs
    const operationId = 'projects/567953929582/locations/us/operations/12901451959259614896';
    
    console.log(`   Operation: ${operationId}`);
    
    // Get operation status
    const [operation] = await client.checkBatchProcessDocumentsProgress(operationId);
    
    console.log('   Status Details:');
    console.log(`      Done: ${operation.done}`);
    console.log(`      Name: ${operation.name}`);
    
    if (operation.metadata) {
      console.log('      Metadata:');
      console.log(`         State: ${operation.metadata.state}`);
      console.log(`         State Message: ${operation.metadata.stateMessage || 'None'}`);
      
      if (operation.metadata.individualProcessStatuses) {
        console.log('         Individual Process Statuses:');
        operation.metadata.individualProcessStatuses.forEach((status, index) => {
          console.log(`            ${index + 1}. Status: ${status.status}, Input: ${status.inputGcsSource}`);
          if (status.outputGcsDestination) {
            console.log(`               Output: ${status.outputGcsDestination}`);
          }
          if (status.humanReviewStatus) {
            console.log(`               Human Review: ${status.humanReviewStatus.state}`);
          }
        });
      }
    }
    
    if (operation.error) {
      console.log('   ❌ Operation Error:');
      console.log(`      Code: ${operation.error.code}`);
      console.log(`      Message: ${operation.error.message}`);
    }
    
    if (operation.response) {
      console.log('   ✅ Operation Response Available');
    }
    
  } catch (error) {
    console.log(`   ❌ Error checking operation: ${error.message}`);
    console.log(`   🔍 Error details: ${error.details || 'No additional details'}`);
  }
}

async function checkServiceAccountPermissions() {
  console.log('\n🔐 Checking Service Account Permissions:');
  
  try {
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    const bucket = storage.bucket(bucketName);

    // Test bucket access
    const [exists] = await bucket.exists();
    console.log(`   Bucket exists: ${exists}`);
    
    // Test read permissions
    try {
      const [files] = await bucket.getFiles({ maxResults: 1 });
      console.log('   ✅ Read permissions: OK');
    } catch (error) {
      console.log(`   ❌ Read permissions: ${error.message}`);
    }
    
    // Test write permissions
    try {
      const testFile = bucket.file('permission-test.txt');
      await testFile.save('test', { resumable: false });
      await testFile.delete();
      console.log('   ✅ Write permissions: OK');
    } catch (error) {
      console.log(`   ❌ Write permissions: ${error.message}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error checking permissions: ${error.message}`);
  }
}

async function main() {
  try {
    await checkGCSBucket();
    await checkBatchOperation();
    await checkServiceAccountPermissions();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎯 Recommendations:');
    console.log('   1. Check if any output files appeared in the bucket');
    console.log('   2. Review the batch operation status details above');
    console.log('   3. If stuck at 0% for >1 hour, consider canceling and retrying');
    console.log('   4. Check Google Cloud Console for more detailed logs');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('💥 Script failed:', error.message);
  }
}

main();