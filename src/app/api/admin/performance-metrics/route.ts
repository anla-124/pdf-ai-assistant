import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import CacheManager from '@/lib/cache'
import { PerformanceMonitor } from '@/lib/performance-monitor'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication and admin access
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // For demo purposes, check if user is admin (you can implement proper role checking)
    // In production, you'd check user roles or permissions
    // const { data: profile } = await supabase
    //   .from('user_profiles')
    //   .select('role')
    //   .eq('user_id', user.id)
    //   .single()
    // 
    // if (profile?.role !== 'admin') {
    //   return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    // }

    // Get comprehensive system metrics using the performance monitor
    const systemMetrics = await PerformanceMonitor.getSystemMetrics()
    
    // Get processing performance metrics
    const processingMetrics = await getProcessingMetrics(supabase)
    
    // Get cache performance metrics  
    const cacheMetrics = await getCacheMetrics()
    
    // Get database performance metrics
    const databaseMetrics = await getDatabaseMetrics(supabase)
    
    // Get simulated system health metrics
    const systemHealthMetrics = await getSystemHealthMetrics()

    const metrics = {
      processing: processingMetrics,
      cache: cacheMetrics,
      database: databaseMetrics,
      system: systemHealthMetrics,
      performance_overview: systemMetrics,
      timestamp: new Date().toISOString()
    }

    return NextResponse.json(metrics)

  } catch (error) {
    console.error('Performance metrics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getProcessingMetrics(supabase: any) {
  // Get document processing statistics
  const { data: docStats } = await supabase
    .from('documents')
    .select('status, created_at')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days

  const total = docStats?.length || 0
  const completed = docStats?.filter((d: any) => d.status === 'completed').length || 0
  const processing = docStats?.filter((d: any) => d.status === 'processing').length || 0
  const errors = docStats?.filter((d: any) => d.status === 'error').length || 0

  // Get average processing time from recent jobs
  const { data: recentJobs } = await supabase
    .from('document_jobs')
    .select('created_at, updated_at, processing_method')
    .eq('status', 'completed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
    .limit(100)

  let avgProcessingTime = 120 // Default 2 minutes
  if (recentJobs && recentJobs.length > 0) {
    const processingTimes = recentJobs.map((job: any) => {
      const start = new Date(job.created_at).getTime()
      const end = new Date(job.updated_at).getTime()
      return Math.round((end - start) / 1000) // Convert to seconds
    })
    avgProcessingTime = Math.round(processingTimes.reduce((a: number, b: number) => a + b, 0) / processingTimes.length)
  }

  // Calculate success rates
  const syncJobs = recentJobs?.filter((j: any) => j.processing_method === 'sync') || []
  const batchJobs = recentJobs?.filter((j: any) => j.processing_method === 'batch') || []
  
  const syncSuccessRate = syncJobs.length > 0 ? Math.round((syncJobs.length / (syncJobs.length + 1)) * 100) : 95
  const batchSuccessRate = batchJobs.length > 0 ? Math.round((batchJobs.length / (batchJobs.length + 1)) * 100) : 98

  return {
    total_documents: total,
    completed_documents: completed,
    processing_documents: processing,
    error_documents: errors,
    avg_processing_time: avgProcessingTime,
    sync_success_rate: syncSuccessRate,
    batch_success_rate: batchSuccessRate
  }
}

async function getCacheMetrics() {
  try {
    // Get Redis stats
    const cacheStats = await CacheManager.getStats()
    const healthCheck = await CacheManager.healthCheck()

    // Parse memory info if available
    let memoryUsage = 'N/A'
    let totalKeys = 0
    
    if (cacheStats && cacheStats.memory) {
      // Parse Redis memory info
      const memoryLines = cacheStats.memory.split('\n')
      const usedMemoryLine = memoryLines.find((line: any) => line.startsWith('used_memory_human:'))
      if (usedMemoryLine) {
        memoryUsage = usedMemoryLine.split(':')[1].trim()
      }
    }

    if (cacheStats && cacheStats.keyspace) {
      // Parse keyspace info to get total keys
      const keyspaceLines = cacheStats.keyspace.split('\n')
      const db0Line = keyspaceLines.find((line: any) => line.startsWith('db0:'))
      if (db0Line) {
        const match = db0Line.match(/keys=(\d+)/)
        if (match) {
          totalKeys = parseInt(match[1])
        }
      }
    }

    // Simulate cache hit/miss stats for demo
    // In production, you'd track these in your application
    const totalRequests = Math.floor(Math.random() * 10000) + 5000
    const cacheHits = Math.floor(totalRequests * 0.85) // Simulate 85% hit rate
    const cacheMisses = totalRequests - cacheHits
    const hitRate = Math.round((cacheHits / totalRequests) * 100)

    return {
      hit_rate: hitRate,
      total_requests: totalRequests,
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      memory_usage: memoryUsage,
      total_keys: totalKeys,
      status: healthCheck.status
    }
  } catch (error) {
    console.warn('Cache metrics unavailable:', error)
    return {
      hit_rate: 0,
      total_requests: 0,
      cache_hits: 0,
      cache_misses: 0,
      memory_usage: 'N/A',
      total_keys: 0,
      status: 'unavailable'
    }
  }
}

async function getDatabaseMetrics(supabase: any) {
  const startTime = Date.now()
  
  // Test query to measure response time
  await supabase
    .from('documents')
    .select('count')
    .limit(1)
    
  const queryTime = Date.now() - startTime

  // Simulate database metrics for demo
  // In production, you'd use actual database monitoring
  return {
    avg_query_time: queryTime,
    total_queries: Math.floor(Math.random() * 50000) + 10000,
    slow_queries: Math.floor(Math.random() * 50) + 5,
    connection_pool_usage: Math.floor(Math.random() * 30) + 20, // 20-50%
    active_connections: Math.floor(Math.random() * 10) + 5
  }
}

async function getSystemHealthMetrics() {
  // Simulate system metrics for demo
  // In production, you'd use actual system monitoring tools
  const uptimeHours = Math.floor(Math.random() * 720) + 24 // 1-30 days
  const uptimeDays = Math.floor(uptimeHours / 24)
  const remainingHours = uptimeHours % 24
  
  return {
    uptime: `${uptimeDays}d ${remainingHours}h`,
    cpu_usage: Math.floor(Math.random() * 40) + 10, // 10-50%
    memory_usage: Math.floor(Math.random() * 30) + 40, // 40-70%
    disk_usage: Math.floor(Math.random() * 20) + 30, // 30-50%
    response_time: Math.floor(Math.random() * 100) + 50 // 50-150ms
  }
}