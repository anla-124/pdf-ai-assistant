#!/usr/bin/env node

/**
 * Business Metadata Testing Script
 * 
 * This script helps test the business metadata filtering functionality
 * by making direct API calls to the similarity search endpoint.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000'

// Sample test scenarios
const testScenarios = [
  {
    name: 'Law Firm Filter - STB',
    filters: {
      law_firm: ['STB'],
      min_score: 0.7,
      page_range: { use_entire_document: true }
    },
    topK: 20
  },
  {
    name: 'Fund Manager Filter - Blackstone',
    filters: {
      fund_manager: ['Blackstone'],
      min_score: 0.7,
      page_range: { use_entire_document: true }
    },
    topK: 20
  },
  {
    name: 'Multiple Filters - STB + Blackstone',
    filters: {
      law_firm: ['STB'],
      fund_manager: ['Blackstone'],
      min_score: 0.7,
      page_range: { use_entire_document: true }
    },
    topK: 20
  },
  {
    name: 'All Business Filters',
    filters: {
      law_firm: ['STB'],
      fund_manager: ['Blackstone'],
      fund_admin: ['Standish'],
      jurisdiction: ['Delaware'],
      min_score: 0.7,
      page_range: { use_entire_document: true }
    },
    topK: 20
  },
  {
    name: 'No Filters (All Documents)',
    filters: {
      min_score: 0.7,
      page_range: { use_entire_document: true }
    },
    topK: 20
  }
]

async function testSimilaritySearch(documentId, scenario) {
  console.log(`\\n🧪 Testing: ${scenario.name}`)
  console.log(`📋 Filters:`, JSON.stringify(scenario.filters, null, 2))
  
  try {
    const response = await fetch(`${API_BASE}/api/documents/${documentId}/similar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authorization header if needed
        // 'Authorization': 'Bearer your-token-here'
      },
      body: JSON.stringify(scenario)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const results = await response.json()
    
    console.log(`✅ Success: Found ${results.length} similar documents`)
    
    if (results.length > 0) {
      console.log(`📊 Results summary:`)
      results.forEach((result, index) => {
        const metadata = result.document.metadata || {}
        console.log(`  ${index + 1}. "${result.document.title}" (${Math.round(result.score * 100)}% similar)`)
        console.log(`     📋 Law Firm: ${metadata.law_firm || 'N/A'}`)
        console.log(`     💼 Fund Manager: ${metadata.fund_manager || 'N/A'}`)
        console.log(`     🏢 Fund Admin: ${metadata.fund_admin || 'N/A'}`)
        console.log(`     🌍 Jurisdiction: ${metadata.jurisdiction || 'N/A'}`)
      })
    }
    
    return { success: true, count: results.length, results }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function runAllTests(documentId) {
  console.log(`🚀 Starting Business Metadata Tests for Document: ${documentId}`)
  console.log(`🌐 API Base URL: ${API_BASE}`)
  
  const results = {}
  
  for (const scenario of testScenarios) {
    const result = await testSimilaritySearch(documentId, scenario)
    results[scenario.name] = result
    
    // Add delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log(`\\n📈 Test Summary:`)
  console.log(`=================`)
  
  let passed = 0
  let failed = 0
  
  for (const [name, result] of Object.entries(results)) {
    if (result.success) {
      console.log(`✅ ${name}: ${result.count} results`)
      passed++
    } else {
      console.log(`❌ ${name}: ${result.error}`)
      failed++
    }
  }
  
  console.log(`\\n🎯 Total: ${passed} passed, ${failed} failed`)
  
  if (failed === 0) {
    console.log(`🎉 All tests passed! Business metadata filtering is working correctly.`)
  } else {
    console.log(`⚠️  Some tests failed. Check the API implementation and try again.`)
  }
}

// Command line usage
const documentId = process.argv[2]

if (!documentId) {
  console.log(`Usage: node scripts/test-business-metadata.js <document-id>`)
  console.log(`Example: node scripts/test-business-metadata.js abc-123-def`)
  console.log(`\\nThis script will test business metadata filtering with various scenarios.`)
  console.log(`Make sure your development server is running on ${API_BASE}`)
  process.exit(1)
}

// Run the tests
runAllTests(documentId).catch(error => {
  console.error(`Fatal error:`, error)
  process.exit(1)
})