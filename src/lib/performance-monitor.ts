import { createServiceClient } from '@/lib/supabase/server'
import CacheManager from '@/lib/cache'

export interface PerformanceMetrics {
  query_time: number
  cache_hit_rate: number
  total_documents: number
  processing_queue_size: number
  avg_processing_time: number
  system_health: 'healthy' | 'degraded' | 'unhealthy'
}

export class PerformanceMonitor {
  private static metrics: PerformanceMetrics[] = []
  private static readonly MAX_METRICS = 100 // Keep last 100 measurements

  /**
   * Record a performance measurement
   */
  static async recordMetric(type: string, value: number, metadata?: any) {
    try {
      const timestamp = new Date().toISOString()
      const metric = {
        type,
        value,
        timestamp,
        metadata: metadata || {}
      }

      // Store in cache for real-time monitoring
      await CacheManager.setUserStats(`performance:${type}:${timestamp}`, metric)
      
      console.log(`📊 Performance metric recorded: ${type} = ${value}`)
    } catch (error) {
      console.warn('Failed to record performance metric:', error)
    }
  }

  /**
   * Measure database query performance
   */
  static async measureDatabasePerformance() {
    const supabase = createServiceClient()
    const startTime = Date.now()
    
    try {
      // Test query - get document count
      const { count, error } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
      
      const queryTime = Date.now() - startTime
      
      if (error) {
        throw error
      }

      await this.recordMetric('db_query_time', queryTime, {
        query_type: 'document_count',
        result_count: count
      })

      return {
        query_time: queryTime,
        document_count: count || 0,
        status: 'healthy'
      }
    } catch (error) {
      await this.recordMetric('db_error', 1, {
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return {
        query_time: Date.now() - startTime,
        document_count: 0,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Measure cache performance
   */
  static async measureCachePerformance() {
    const startTime = Date.now()
    
    try {
      // Test cache health
      const healthCheck = await CacheManager.healthCheck()
      const cacheTime = Date.now() - startTime

      await this.recordMetric('cache_response_time', cacheTime, {
        status: healthCheck.status
      })

      // Get cache statistics
      const stats = await CacheManager.getStats()
      
      return {
        response_time: cacheTime,
        status: healthCheck.status,
        stats: stats
      }
    } catch (error) {
      await this.recordMetric('cache_error', 1, {
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return {
        response_time: Date.now() - startTime,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Measure processing pipeline performance
   */
  static async measureProcessingPerformance() {
    const supabase = createServiceClient()
    
    try {
      // Get processing queue size
      const { count: queueSize } = await supabase
        .from('document_jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'processing'])

      // Get recent processing times
      const { data: recentJobs } = await supabase
        .from('document_jobs')
        .select('created_at, updated_at, processing_method')
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .limit(50)

      let avgProcessingTime = 0
      if (recentJobs && recentJobs.length > 0) {
        const processingTimes = recentJobs.map(job => {
          const start = new Date(job.created_at).getTime()
          const end = new Date(job.updated_at).getTime()
          return (end - start) / 1000 // Convert to seconds
        })
        avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      }

      await this.recordMetric('processing_queue_size', queueSize || 0)
      await this.recordMetric('avg_processing_time', avgProcessingTime)

      return {
        queue_size: queueSize || 0,
        avg_processing_time: Math.round(avgProcessingTime),
        recent_jobs_count: recentJobs?.length || 0
      }
    } catch (error) {
      await this.recordMetric('processing_error', 1, {
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return {
        queue_size: 0,
        avg_processing_time: 0,
        recent_jobs_count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get comprehensive system performance metrics
   */
  static async getSystemMetrics(): Promise<PerformanceMetrics> {
    console.log('📊 Collecting system performance metrics...')
    
    const [dbMetrics, cacheMetrics, processingMetrics] = await Promise.all([
      this.measureDatabasePerformance(),
      this.measureCachePerformance(),
      this.measureProcessingPerformance()
    ])

    // Calculate cache hit rate (simulated for now)
    const cacheHitRate = cacheMetrics.status === 'healthy' ? 85 : 0

    // Determine overall system health
    let systemHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    
    if (dbMetrics.status === 'unhealthy' || cacheMetrics.status === 'unhealthy') {
      systemHealth = 'unhealthy'
    } else if (dbMetrics.query_time > 1000 || cacheMetrics.response_time > 100) {
      systemHealth = 'degraded'
    }

    const metrics: PerformanceMetrics = {
      query_time: dbMetrics.query_time,
      cache_hit_rate: cacheHitRate,
      total_documents: dbMetrics.document_count,
      processing_queue_size: processingMetrics.queue_size,
      avg_processing_time: processingMetrics.avg_processing_time,
      system_health: systemHealth
    }

    // Store current metrics
    this.metrics.push(metrics)
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift() // Remove oldest metric
    }

    // Cache the latest metrics
    await CacheManager.setUserStats('system:latest_metrics', metrics)

    console.log(`📊 System health: ${systemHealth}`)
    console.log(`⚡ DB query time: ${dbMetrics.query_time}ms`)
    console.log(`🔥 Cache status: ${cacheMetrics.status}`)
    console.log(`📋 Processing queue: ${processingMetrics.queue_size} jobs`)

    return metrics
  }

  /**
   * Get performance trends over time
   */
  static getMetricsTrend(type: keyof PerformanceMetrics, windowSize: number = 10) {
    const recentMetrics = this.metrics.slice(-windowSize)
    if (recentMetrics.length === 0) return null

    const values = recentMetrics.map(m => m[type] as number)
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)

    return {
      current: values[values.length - 1],
      average: Math.round(avg * 100) / 100,
      min,
      max,
      trend: values.length > 1 ? 
        (values[values.length - 1] > values[values.length - 2] ? 'up' : 'down') : 'stable'
    }
  }

  /**
   * Start continuous monitoring
   */
  static startMonitoring(intervalMs: number = 60000) {
    console.log(`🔄 Starting performance monitoring (${intervalMs}ms interval)`)
    
    const interval = setInterval(async () => {
      try {
        await this.getSystemMetrics()
      } catch (error) {
        console.error('Performance monitoring error:', error)
      }
    }, intervalMs)

    // Return cleanup function
    return () => {
      clearInterval(interval)
      console.log('🛑 Performance monitoring stopped')
    }
  }
}

/**
 * Middleware to measure API endpoint performance
 */
export function withPerformanceMonitoring<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  name: string
) {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now()
    
    try {
      const result = await fn(...args)
      const duration = Date.now() - startTime
      
      await PerformanceMonitor.recordMetric(`api_${name}_duration`, duration, {
        success: true
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      
      await PerformanceMonitor.recordMetric(`api_${name}_duration`, duration, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      throw error
    }
  }
}