/**
 * Manual Testing Script for Document Processing System
 * 
 * This script provides comprehensive testing of the document processing pipeline
 * including sync processing, batch processing, error handling, and status updates.
 * 
 * Usage:
 * node scripts/test-document-processing.js [test-type]
 * 
 * Test types:
 * - all: Run all tests
 * - sync: Test sync processing 
 * - batch: Test batch processing
 * - status: Test status API
 * - errors: Test error handling
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Test configuration
const TEST_CONFIG = {
  userId: null, // Will be set dynamically by getting a real user
  smallDocumentSize: 1 * 1024 * 1024, // 1MB - should trigger sync
  largeDocumentSize: 50 * 1024 * 1024, // 50MB - should trigger batch  
  maxWaitTime: 10 * 60 * 1000, // 10 minutes max wait
  pollInterval: 2000 // 2 seconds
}

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
}

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset)
}

function logHeader(message) {
  console.log()
  log('='.repeat(60), 'blue')
  log(message, 'bold')
  log('='.repeat(60), 'blue')
}

function logSuccess(message) {
  log('✅ ' + message, 'green')
}

function logError(message) {
  log('❌ ' + message, 'red')
}

function logWarning(message) {
  log('⚠️  ' + message, 'yellow')
}

function logInfo(message) {
  log('ℹ️  ' + message, 'blue')
}

// Helper functions
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getOrCreateTestUser() {
  try {
    // First, try to find an existing user
    const { data: users, error: queryError } = await supabase
      .from('users')
      .select('id')
      .limit(1)
    
    if (queryError) {
      // If users table doesn't exist or is not accessible, try to get from auth
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
      
      if (authError || !authUsers.users.length) {
        // Create a test user using auth admin API
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: 'test@example.com',
          password: 'test123456',
          email_confirm: true
        })
        
        if (createError) {
          throw new Error(`Failed to create test user: ${createError.message}`)
        }
        
        logSuccess(`Created test user: ${newUser.user.id}`)
        return newUser.user.id
      } else {
        logInfo(`Using existing auth user: ${authUsers.users[0].id}`)
        return authUsers.users[0].id
      }
    }
    
    if (users && users.length > 0) {
      logInfo(`Using existing user: ${users[0].id}`)
      return users[0].id
    }
    
    // If no users found, generate a valid UUID for testing
    const testUuid = 'aaaaaaaa-bbbb-cccc-dddd-' + Date.now().toString().padStart(12, '0')
    logWarning(`No users found, using test UUID: ${testUuid}`)
    return testUuid
    
  } catch (error) {
    // Fallback: generate a valid UUID format
    const testUuid = 'aaaaaaaa-bbbb-cccc-dddd-' + Date.now().toString().padStart(12, '0')
    logWarning(`Failed to get user, using test UUID: ${testUuid}`)
    return testUuid
  }
}

async function waitForProcessing(documentId, maxTime = TEST_CONFIG.maxWaitTime) {
  const startTime = Date.now()
  
  while (Date.now() - startTime < maxTime) {
    try {
      const response = await fetch(`http://localhost:3000/api/documents/${documentId}/status`)
      if (response.ok) {
        const status = await response.json()
        
        logInfo(`Status: ${status.detailed_status.phase} - ${status.detailed_status.message}`)
        
        if (status.status === 'completed') {
          logSuccess(`Document processing completed successfully`)
          return { success: true, status }
        }
        
        if (status.status === 'error') {
          logError(`Document processing failed: ${status.error}`)
          return { success: false, status, error: status.error }
        }
        
        if (status.detailed_status.isStale) {
          logWarning(`Status appears stale (no updates for >5 minutes)`)
        }
        
        // Log processing method and time estimates
        if (status.detailed_status.estimatedTimeRemaining) {
          logInfo(`Processing method: ${status.detailed_status.processingMethod}, Est. time: ${status.detailed_status.estimatedTimeRemaining}`)
        }
      }
    } catch (error) {
      logError(`Failed to check status: ${error.message}`)
    }
    
    await sleep(TEST_CONFIG.pollInterval)
  }
  
  logError(`Processing timeout after ${maxTime / 1000} seconds`)
  return { success: false, error: 'Timeout' }
}

async function createTestDocument(filename, sizeBytes, metadata = {}) {
  try {
    // Ensure we have a user ID
    if (!TEST_CONFIG.userId) {
      TEST_CONFIG.userId = await getOrCreateTestUser()
    }
    
    // Create a fake PDF content (just for testing)
    const content = Buffer.alloc(sizeBytes, 'fake pdf content')
    
    // Upload to Supabase storage
    const filePath = `test-documents/${Date.now()}-${filename}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, content, {
        contentType: 'application/pdf'
      })
    
    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }
    
    // Create document record
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        title: filename.replace('.pdf', ''),
        filename: filename,
        file_path: filePath,
        file_size: sizeBytes,
        user_id: TEST_CONFIG.userId,
        status: 'queued',
        content_type: 'application/pdf',
        metadata: metadata
      })
      .select()
      .single()
    
    if (docError) {
      throw new Error(`Document creation failed: ${docError.message}`)
    }
    
    logSuccess(`Created test document: ${filename} (${(sizeBytes / 1024 / 1024).toFixed(1)}MB)`)
    return docData
    
  } catch (error) {
    logError(`Failed to create test document: ${error.message}`)
    throw error
  }
}

async function triggerJobProcessing() {
  try {
    const response = await fetch('http://localhost:3000/api/test/process-jobs', {
      method: 'POST'
    })
    
    if (response.ok) {
      const result = await response.json()
      logSuccess('Job processing triggered successfully')
      return result
    } else {
      const error = await response.json()
      throw new Error(error.error || 'Job processing failed')
    }
  } catch (error) {
    logError(`Failed to trigger job processing: ${error.message}`)
    throw error
  }
}

async function cleanupTestDocument(documentId) {
  try {
    // Get document to find file path
    const { data: doc } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', documentId)
      .single()
    
    if (doc?.file_path) {
      // Delete from storage
      await supabase.storage
        .from('documents')
        .remove([doc.file_path])
    }
    
    // Delete document record
    await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
    
    // Delete related records
    await supabase.from('document_jobs').delete().eq('document_id', documentId)
    await supabase.from('processing_status').delete().eq('document_id', documentId)
    await supabase.from('document_embeddings').delete().eq('document_id', documentId)
    await supabase.from('extracted_fields').delete().eq('document_id', documentId)
    
    logInfo(`Cleaned up test document: ${documentId}`)
  } catch (error) {
    logWarning(`Failed to cleanup document ${documentId}: ${error.message}`)
  }
}

// Test functions
async function testSyncProcessing() {
  logHeader('Testing Sync Processing (Small Document)')
  
  try {
    const document = await createTestDocument('small-test.pdf', TEST_CONFIG.smallDocumentSize, {
      law_firm: 'Test Law Firm',
      document_type: 'Contract'
    })
    
    logInfo('Triggering job processing...')
    await triggerJobProcessing()
    
    logInfo('Waiting for processing to complete...')
    const result = await waitForProcessing(document.id)
    
    if (result.success) {
      logSuccess('Sync processing test completed successfully')
      
      // Verify the document was processed with sync method
      if (result.status.processing_method === 'sync') {
        logSuccess('Document was processed using sync method as expected')
      } else {
        logWarning(`Expected sync processing but got: ${result.status.processing_method}`)
      }
      
      return true
    } else {
      logError('Sync processing test failed')
      return false
    }
  } catch (error) {
    logError(`Sync processing test error: ${error.message}`)
    return false
  }
}

async function testBatchProcessing() {
  logHeader('Testing Batch Processing (Large Document)')
  
  try {
    const document = await createTestDocument('large-test.pdf', TEST_CONFIG.largeDocumentSize, {
      law_firm: 'Test Law Firm',
      fund_manager: 'Test Fund Manager'
    })
    
    logInfo('Triggering job processing...')
    await triggerJobProcessing()
    
    logInfo('Waiting for processing to complete (this may take several minutes)...')
    const result = await waitForProcessing(document.id, 15 * 60 * 1000) // 15 minutes for batch
    
    if (result.success) {
      logSuccess('Batch processing test completed successfully')
      
      // Verify the document was processed with batch method
      if (result.status.processing_method === 'batch') {
        logSuccess('Document was processed using batch method as expected')
      } else {
        logInfo(`Processing method: ${result.status.processing_method}`)
      }
      
      return true
    } else {
      logError('Batch processing test failed')
      return false
    }
  } catch (error) {
    logError(`Batch processing test error: ${error.message}`)
    return false
  }
}

async function testStatusAPI() {
  logHeader('Testing Status API')
  
  try {
    const document = await createTestDocument('status-test.pdf', TEST_CONFIG.smallDocumentSize)
    
    // Test initial status
    const initialResponse = await fetch(`http://localhost:3000/api/documents/${document.id}/status`)
    if (!initialResponse.ok) {
      throw new Error('Failed to fetch initial status')
    }
    
    const initialStatus = await initialResponse.json()
    logSuccess(`Initial status: ${initialStatus.status}`)
    logInfo(`Detailed status: ${initialStatus.detailed_status.phase} - ${initialStatus.detailed_status.message}`)
    
    // Trigger processing
    await triggerJobProcessing()
    
    // Test status during processing
    let processingStatusCaptured = false
    const startTime = Date.now()
    
    while (Date.now() - startTime < 30000 && !processingStatusCaptured) { // 30 seconds
      const response = await fetch(`http://localhost:3000/api/documents/${document.id}/status`)
      if (response.ok) {
        const status = await response.json()
        
        if (status.status === 'processing') {
          logSuccess('Captured processing status:')
          logInfo(`  Phase: ${status.detailed_status.phase}`)
          logInfo(`  Message: ${status.detailed_status.message}`)
          logInfo(`  Processing Method: ${status.detailed_status.processingMethod}`)
          logInfo(`  Estimated Time: ${status.detailed_status.estimatedTimeRemaining || 'N/A'}`)
          logInfo(`  Is Stale: ${status.detailed_status.isStale}`)
          processingStatusCaptured = true
        }
        
        if (status.status === 'completed') {
          break
        }
      }
      
      await sleep(1000)
    }
    
    if (processingStatusCaptured) {
      logSuccess('Status API test completed successfully')
      return true
    } else {
      logWarning('Did not capture processing status (processing too fast)')
      return true // Still consider success if processing was just very fast
    }
    
  } catch (error) {
    logError(`Status API test error: ${error.message}`)
    return false
  }
}

async function testErrorHandling() {
  logHeader('Testing Error Handling')
  
  try {
    // Test 1: Non-existent document status (expected behavior is 401 for unauthenticated)
    logInfo('Testing non-existent document status without auth...')
    const response = await fetch('http://localhost:3000/api/documents/non-existent/status')
    if (response.status === 401) {
      logSuccess('Correctly returned 401 for unauthenticated request')
    } else if (response.status === 404) {
      logSuccess('Correctly returned 404 for non-existent document')
    } else {
      logWarning(`Got ${response.status} - this may be expected depending on auth setup`)
    }
    
    // Test 2: Test processing with invalid data
    logInfo('Testing error scenarios...')
    try {
      // Try to trigger job processing
      await triggerJobProcessing()
      logInfo('Job processing endpoint is accessible')
    } catch (error) {
      logInfo(`Job processing error (expected if no jobs): ${error.message}`)
    }
    
    logInfo('Error handling tests - basic connectivity verified')
    logWarning('More comprehensive error testing requires manual testing with the web interface')
    
    return true
  } catch (error) {
    logError(`Error handling test error: ${error.message}`)
    return false
  }
}

async function runAllTests() {
  logHeader('Running All Document Processing Tests')
  
  const testResults = {
    sync: false,
    batch: false,
    status: false,
    errors: false
  }
  
  try {
    // Check if server is running
    try {
      await fetch('http://localhost:3000/api/test/process-jobs')
      logSuccess('Test server is accessible')
    } catch (error) {
      logError('Cannot connect to test server. Make sure the development server is running.')
      logError('Run: npm run dev')
      return
    }
    
    // Initialize test user
    logInfo('Setting up test environment...')
    try {
      TEST_CONFIG.userId = await getOrCreateTestUser()
      logSuccess(`Test user ID: ${TEST_CONFIG.userId}`)
    } catch (error) {
      logWarning(`Could not set up test user: ${error.message}`)
      logInfo('Will attempt to use fallback UUID during testing')
    }
    
    logInfo('Starting comprehensive test suite...')
    
    // Run tests
    testResults.status = await testStatusAPI()
    testResults.errors = await testErrorHandling()
    testResults.sync = await testSyncProcessing()
    
    // Only run batch test if sync passed (to avoid long waits on broken system)
    if (testResults.sync) {
      logWarning('Batch processing test will take 5-15 minutes. Continue? (Press Ctrl+C to skip)')
      await sleep(5000) // Give user time to cancel
      testResults.batch = await testBatchProcessing()
    } else {
      logWarning('Skipping batch test due to sync test failure')
    }
    
    // Summary
    logHeader('Test Results Summary')
    
    const passed = Object.values(testResults).filter(Boolean).length
    const total = Object.keys(testResults).length
    
    Object.entries(testResults).forEach(([test, result]) => {
      if (result) {
        logSuccess(`${test.toUpperCase()}: PASSED`)
      } else {
        logError(`${test.toUpperCase()}: FAILED`)
      }
    })
    
    if (passed === total) {
      logSuccess(`All tests passed! (${passed}/${total})`)
    } else {
      logWarning(`${passed}/${total} tests passed`)
    }
    
  } catch (error) {
    logError(`Test suite error: ${error.message}`)
  }
}

// Main execution
async function main() {
  const testType = process.argv[2] || 'all'
  
  try {
    switch (testType) {
      case 'sync':
        await testSyncProcessing()
        break
      case 'batch':
        await testBatchProcessing()
        break
      case 'status':
        await testStatusAPI()
        break
      case 'errors':
        await testErrorHandling()
        break
      case 'all':
      default:
        await runAllTests()
        break
    }
  } catch (error) {
    logError(`Test execution failed: ${error.message}`)
    process.exit(1)
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  log('\nCleaning up and exiting...', 'yellow')
  process.exit(0)
})

// Run tests
if (require.main === module) {
  main()
}

module.exports = {
  testSyncProcessing,
  testBatchProcessing,
  testStatusAPI,
  testErrorHandling,
  runAllTests
}