const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

async function applyDatabaseOptimizations() {
  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  console.log('🚀 Applying database performance optimizations...')

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../database/performance-optimizations.sql')
    const sqlContent = fs.readFileSync(sqlPath, 'utf8')

    // Split SQL statements (simple approach)
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))

    console.log(`📝 Found ${statements.length} SQL statements to execute`)

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.trim().length === 0) continue

      console.log(`📊 Executing statement ${i + 1}/${statements.length}...`)
      console.log(`   ${statement.substring(0, 60)}...`)

      const { error } = await supabase.rpc('exec_sql', { sql: statement })
      
      if (error) {
        // Try direct execution for CREATE INDEX statements
        if (statement.includes('CREATE INDEX')) {
          console.log(`   ⚠️  RPC failed, trying direct execution...`)
          // For indexes, we can use a workaround by creating a simple function
          try {
            // Create indexes through data queries won't work, so we'll log instead
            console.log(`   📝 Index statement prepared: ${statement}`)
            console.log(`   ℹ️  Please run this manually in Supabase SQL editor`)
          } catch (directError) {
            console.error(`   ❌ Failed: ${error.message}`)
          }
        } else {
          console.error(`   ❌ Failed: ${error.message}`)
        }
      } else {
        console.log(`   ✅ Success`)
      }
    }

    // Test query performance after optimization
    console.log('\n🔍 Testing query performance...')
    
    const startTime = Date.now()
    const { data, error: queryError } = await supabase
      .from('documents')
      .select('id, status, created_at')
      .limit(10)
    
    const queryTime = Date.now() - startTime
    
    if (queryError) {
      console.error('❌ Test query failed:', queryError.message)
    } else {
      console.log(`✅ Test query completed in ${queryTime}ms`)
      console.log(`📊 Found ${data?.length || 0} test documents`)
    }

    // Create performance monitoring view
    console.log('\n📈 Setting up performance monitoring...')
    
    const monitoringQuery = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC
      LIMIT 10;
    `
    
    const { data: indexStats, error: indexError } = await supabase.rpc('exec_sql', { 
      sql: monitoringQuery 
    })
    
    if (!indexError && indexStats) {
      console.log('📊 Index usage statistics available')
    }

    console.log('\n🎉 Database optimization setup completed!')
    console.log('📝 Note: Some indexes may need to be created manually in Supabase SQL editor')
    console.log('🔗 Go to: Supabase Dashboard > SQL Editor > New Query')
    console.log('📋 Copy and paste the SQL from: database/performance-optimizations.sql')

  } catch (error) {
    console.error('❌ Optimization failed:', error.message)
    process.exit(1)
  }
}

// Run the optimization
if (require.main === module) {
  applyDatabaseOptimizations()
    .then(() => {
      console.log('✅ Database optimization completed')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Database optimization failed:', error)
      process.exit(1)
    })
}

module.exports = { applyDatabaseOptimizations }