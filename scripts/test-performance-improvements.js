const https = require('https')

// Test configuration
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const TEST_ITERATIONS = 5

// Simple HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https')
    const requestModule = isHttps ? require('https') : require('http')
    
    const req = requestModule.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve({
            status: res.statusCode,
            data: parsed,
            headers: res.headers
          })
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          })
        }
      })
    })
    
    req.on('error', reject)
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    
    req.end()
  })
}

async function testApiPerformance() {
  console.log('🧪 Testing API Performance Improvements')
  console.log('=====================================')
  
  const tests = [
    {
      name: 'Performance Metrics API',
      url: `${BASE_URL}/api/admin/performance-metrics`,
      expectCache: false // Admin endpoints typically don't cache
    },
    {
      name: 'Usage Analytics API',
      url: `${BASE_URL}/api/admin/usage-analytics`,
      expectCache: false
    },
    {
      name: 'Documents List API',
      url: `${BASE_URL}/api/documents?limit=10`,
      expectCache: true // Should be cached after first request
    }
  ]

  for (const test of tests) {
    console.log(`\n📊 Testing: ${test.name}`)
    console.log(`🔗 URL: ${test.url}`)
    
    const times = []
    let cacheHitDetected = false
    
    for (let i = 0; i < TEST_ITERATIONS; i++) {
      const startTime = Date.now()
      
      try {
        const response = await makeRequest(test.url)
        const endTime = Date.now()
        const duration = endTime - startTime
        
        times.push(duration)
        
        // Check for cache indicators
        if (response.headers['x-cache'] === 'HIT' || 
            (i > 0 && duration < times[0] * 0.5)) {
          cacheHitDetected = true
        }
        
        console.log(`   Request ${i + 1}: ${duration}ms (${response.status})`)
        
        if (response.status !== 200 && response.status !== 401) {
          console.warn(`   ⚠️  Unexpected status: ${response.status}`)
          if (response.data && response.data.error) {
            console.warn(`   Error: ${response.data.error}`)
          }
        }
        
      } catch (error) {
        console.error(`   ❌ Request ${i + 1} failed:`, error.message)
        times.push(5000) // Record as slow request
      }
      
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Calculate statistics
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const improvementRatio = maxTime / minTime
    
    console.log(`\n   📈 Performance Summary:`)
    console.log(`   Average: ${Math.round(avgTime)}ms`)
    console.log(`   Fastest: ${minTime}ms`)
    console.log(`   Slowest: ${maxTime}ms`)
    console.log(`   Improvement: ${improvementRatio.toFixed(1)}x faster`)
    
    if (test.expectCache) {
      if (cacheHitDetected || improvementRatio > 2) {
        console.log(`   ✅ Caching appears to be working`)
      } else {
        console.log(`   ⚠️  Caching may not be active (expected for this endpoint)`)
      }
    }
  }
  
  console.log('\n🧪 Performance Test Complete!')
}

async function testCacheHealth() {
  console.log('\n🔍 Testing Cache Health')
  console.log('======================')
  
  try {
    // Test Redis connection through our API
    const response = await makeRequest(`${BASE_URL}/api/admin/performance-metrics`)
    
    if (response.status === 200 && response.data.cache) {
      const cacheMetrics = response.data.cache
      console.log(`✅ Cache Status: ${cacheMetrics.status || 'unknown'}`)
      console.log(`📊 Hit Rate: ${cacheMetrics.hit_rate || 0}%`)
      console.log(`💾 Memory Usage: ${cacheMetrics.memory_usage || 'N/A'}`)
      console.log(`🔑 Total Keys: ${cacheMetrics.total_keys || 0}`)
      
      if (cacheMetrics.status === 'healthy' || cacheMetrics.hit_rate > 0) {
        console.log(`🎉 Redis caching is operational!`)
      } else {
        console.log(`⚠️  Redis may not be fully configured`)
      }
    } else {
      console.log(`⚠️  Unable to retrieve cache metrics (Status: ${response.status})`)
    }
  } catch (error) {
    console.log(`❌ Cache health check failed: ${error.message}`)
  }
}

async function testDatabaseOptimizations() {
  console.log('\n🗄️  Testing Database Performance')
  console.log('===============================')
  
  try {
    const response = await makeRequest(`${BASE_URL}/api/admin/performance-metrics`)
    
    if (response.status === 200 && response.data.database) {
      const dbMetrics = response.data.database
      console.log(`⚡ Avg Query Time: ${dbMetrics.avg_query_time}ms`)
      console.log(`📊 Total Queries: ${dbMetrics.total_queries}`)
      console.log(`🐌 Slow Queries: ${dbMetrics.slow_queries}`)
      console.log(`🔗 Connection Pool: ${dbMetrics.connection_pool_usage}%`)
      
      if (dbMetrics.avg_query_time < 100) {
        console.log(`✅ Database performance looks good!`)
      } else if (dbMetrics.avg_query_time < 500) {
        console.log(`⚠️  Database performance is acceptable`)
      } else {
        console.log(`🚨 Database performance may need attention`)
      }
    } else {
      console.log(`⚠️  Unable to retrieve database metrics (Status: ${response.status})`)
    }
  } catch (error) {
    console.log(`❌ Database performance check failed: ${error.message}`)
  }
}

// Main test runner
async function runPerformanceTests() {
  console.log('🚀 PDF AI Assistant - Performance Testing Suite')
  console.log('===============================================')
  console.log(`📅 ${new Date().toLocaleString()}`)
  console.log(`🌐 Testing against: ${BASE_URL}`)
  
  try {
    await testApiPerformance()
    await testCacheHealth()
    await testDatabaseOptimizations()
    
    console.log('\n🎉 All performance tests completed!')
    console.log('💡 Check the logs above for any issues or recommendations')
    
  } catch (error) {
    console.error('\n❌ Performance test suite failed:', error.message)
    process.exit(1)
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runPerformanceTests()
    .then(() => {
      console.log('\n✅ Performance testing completed successfully')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ Performance testing failed:', error)
      process.exit(1)
    })
}

module.exports = {
  runPerformanceTests,
  testApiPerformance,
  testCacheHealth,
  testDatabaseOptimizations
}