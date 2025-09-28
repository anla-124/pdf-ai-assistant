/**
 * Setup Validation Script
 * 
 * This script validates that all the core infrastructure is working
 * before you run manual tests.
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

// Colors for output
const colors = {
  green: '\x1b[32m✅ ',
  red: '\x1b[31m❌ ',
  yellow: '\x1b[33m⚠️  ',
  blue: '\x1b[34mℹ️  ',
  reset: '\x1b[0m'
}

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset)
}

async function validateEnvironment() {
  log('Environment Variables:', 'blue')
  
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_CLOUD_PROJECT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'PINECONE_API_KEY',
    'PINECONE_INDEX_NAME'
  ]
  
  let allPresent = true
  
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      log(`${envVar}: Set`, 'green')
    } else {
      log(`${envVar}: Missing`, 'red')
      allPresent = false
    }
  }
  
  return allPresent
}

async function validateSupabase() {
  log('\\nSupabase Connection:', 'blue')
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    // Test basic connection
    const { data, error } = await supabase
      .from('documents')
      .select('count')
      .limit(1)
    
    if (error) {
      log(`Database connection failed: ${error.message}`, 'red')
      return false
    }
    
    log('Database connection: Working', 'green')
    
    // Test auth
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1
    })
    
    if (authError) {
      log(`Auth connection failed: ${authError.message}`, 'red')
      return false
    }
    
    log('Auth connection: Working', 'green')
    log(`User count: ${authData.users.length}`, 'blue')
    
    return true
  } catch (error) {
    log(`Supabase validation failed: ${error.message}`, 'red')
    return false
  }
}

async function validateServer() {
  log('\\nDevelopment Server:', 'blue')
  
  try {
    // Test main server
    const response = await fetch('http://localhost:3000')
    if (response.ok) {
      log('Main server (http://localhost:3000): Running', 'green')
    } else {
      log('Main server: Not responding', 'red')
      return false
    }
    
    // Test API endpoints
    const testResponse = await fetch('http://localhost:3000/api/test/process-jobs')
    if (testResponse.status === 403 || testResponse.ok) {
      log('API endpoints: Accessible', 'green')
    } else {
      log('API endpoints: Issues detected', 'yellow')
    }
    
    return true
  } catch (error) {
    log('Development server not running', 'red')
    log('Run: npm run dev', 'blue')
    return false
  }
}

async function validateDocumentStructure() {
  log('\\nDocument Processing Setup:', 'blue')
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    // Check required tables exist
    const tables = ['documents', 'document_jobs', 'processing_status', 'document_embeddings']
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1)
      
      if (error) {
        log(`Table '${table}': Missing or inaccessible`, 'red')
        return false
      } else {
        log(`Table '${table}': Available`, 'green')
      }
    }
    
    // Check storage bucket
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
    
    if (bucketError) {
      log('Storage buckets: Cannot access', 'red')
      return false
    }
    
    const documentBucket = buckets.find(bucket => bucket.name === 'documents')
    if (documentBucket) {
      log('Documents storage bucket: Available', 'green')
    } else {
      log('Documents storage bucket: Missing', 'red')
      return false
    }
    
    return true
  } catch (error) {
    log(`Document structure validation failed: ${error.message}`, 'red')
    return false
  }
}

async function validateProcessingPipeline() {
  log('\\nProcessing Pipeline:', 'blue')
  
  // Check if Google Cloud credentials file exists
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credentialsPath) {
    const fs = require('fs')
    if (fs.existsSync(credentialsPath)) {
      log('Google Cloud credentials: File found', 'green')
    } else {
      log('Google Cloud credentials: File not found', 'red')
      return false
    }
  } else {
    log('Google Cloud credentials: Path not set', 'red')
    return false
  }
  
  // Note: We can't easily test Document AI and Pinecone without making actual API calls
  log('Document AI: Cannot test without processing (requires manual test)', 'yellow')
  log('Pinecone: Cannot test without processing (requires manual test)', 'yellow')
  
  return true
}

async function main() {
  console.log('\\n' + '='.repeat(60))
  console.log('🔍 PDF AI Assistant - Setup Validation')
  console.log('='.repeat(60))
  
  const results = {
    environment: await validateEnvironment(),
    supabase: await validateSupabase(),
    server: await validateServer(),
    structure: await validateDocumentStructure(),
    pipeline: await validateProcessingPipeline()
  }
  
  console.log('\\n' + '='.repeat(60))
  console.log('📊 Validation Results')
  console.log('='.repeat(60))
  
  const passed = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  
  Object.entries(results).forEach(([test, result]) => {
    const status = result ? 'PASS' : 'FAIL'
    const color = result ? 'green' : 'red'
    log(`${test.charAt(0).toUpperCase() + test.slice(1)}: ${status}`, color)
  })
  
  console.log('\\n' + '='.repeat(60))
  
  if (passed === total) {
    log(`All validations passed! (${passed}/${total})`, 'green')
    log('✨ Your system is ready for manual testing!', 'green')
    log('\\nNext steps:', 'blue')
    log('1. Follow the manual testing guide in QUICK_MANUAL_TESTS.md', 'blue')
    log('2. Upload a small PDF document through the dashboard', 'blue')
    log('3. Watch the real-time status updates', 'blue')
  } else {
    log(`${passed}/${total} validations passed`, 'yellow')
    log('🔧 Fix the failing validations before testing', 'yellow')
    
    if (!results.server) {
      log('\\n🚀 Start the development server first:', 'blue')
      log('npm run dev', 'blue')
    }
    
    if (!results.environment) {
      log('\\n⚙️  Check your .env.local file for missing variables', 'blue')
    }
  }
  
  console.log('\\n')
}

// Run validation
main().catch(error => {
  log(`Validation script failed: ${error.message}`, 'red')
  process.exit(1)
})