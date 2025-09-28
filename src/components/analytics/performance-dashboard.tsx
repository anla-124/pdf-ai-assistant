'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ActivityIcon, 
  TrendingUpIcon, 
  ClockIcon, 
  DatabaseIcon,
  ServerIcon,
  ZapIcon,
  ChartLineIcon,
  UsersIcon
} from 'lucide-react'

interface PerformanceMetrics {
  processing: {
    total_documents: number
    completed_documents: number
    processing_documents: number
    error_documents: number
    avg_processing_time: number
    sync_success_rate: number
    batch_success_rate: number
  }
  cache: {
    hit_rate: number
    total_requests: number
    cache_hits: number
    cache_misses: number
    memory_usage: string
    total_keys: number
  }
  database: {
    avg_query_time: number
    total_queries: number
    slow_queries: number
    connection_pool_usage: number
    active_connections: number
  }
  system: {
    uptime: string
    cpu_usage: number
    memory_usage: number
    disk_usage: number
    response_time: number
  }
}

interface UsageAnalytics {
  daily_stats: {
    date: string
    documents_processed: number
    search_requests: number
    active_users: number
  }[]
  popular_features: {
    feature: string
    usage_count: number
    percentage: number
  }[]
  user_activity: {
    total_users: number
    active_users_today: number
    active_users_week: number
    avg_documents_per_user: number
  }
}

export default function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMetrics()
    fetchAnalytics()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchMetrics()
      fetchAnalytics()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/admin/performance-metrics')
      if (!response.ok) throw new Error('Failed to fetch metrics')
      const data = await response.json()
      setMetrics(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/admin/usage-analytics')
      if (!response.ok) throw new Error('Failed to fetch analytics')
      const data = await response.json()
      setAnalytics(data)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading performance metrics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 bg-red-500 rounded-full"></div>
            <p className="text-red-800">Error loading metrics: {error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Performance & Analytics</h2>
          <p className="text-muted-foreground">
            Monitor system performance, cache efficiency, and user activity
          </p>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <ActivityIcon className="h-3 w-3 mr-1" />
          System Healthy
        </Badge>
      </div>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="analytics">Usage Analytics</TabsTrigger>
          <TabsTrigger value="system">System Health</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          {metrics && (
            <>
              {/* Processing Performance */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
                    <ChartLineIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.processing.total_documents}</div>
                    <p className="text-xs text-muted-foreground">
                      {metrics.processing.completed_documents} completed
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
                    <ClockIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.processing.avg_processing_time}s</div>
                    <p className="text-xs text-muted-foreground">
                      Per document
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Sync Success Rate</CardTitle>
                    <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.processing.sync_success_rate}%</div>
                    <Progress value={metrics.processing.sync_success_rate} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
                    <ZapIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.cache.hit_rate}%</div>
                    <Progress value={metrics.cache.hit_rate} className="mt-2" />
                  </CardContent>
                </Card>
              </div>

              {/* Cache Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Cache Performance</CardTitle>
                  <CardDescription>Redis cache efficiency and usage statistics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Hit Rate</span>
                        <span className="text-sm text-muted-foreground">{metrics.cache.hit_rate}%</span>
                      </div>
                      <Progress value={metrics.cache.hit_rate} />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Requests</span>
                        <span className="text-sm text-muted-foreground">{metrics.cache.total_requests}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {metrics.cache.cache_hits} hits, {metrics.cache.cache_misses} misses
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Memory Usage</span>
                        <span className="text-sm text-muted-foreground">{metrics.cache.memory_usage}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {metrics.cache.total_keys} cached keys
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Database Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Database Performance</CardTitle>
                  <CardDescription>Query performance and connection pool metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Avg Query Time</span>
                        <span className="text-sm text-muted-foreground">{metrics.database.avg_query_time}ms</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Queries</span>
                        <span className="text-sm text-muted-foreground">{metrics.database.total_queries}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Slow Queries</span>
                        <span className="text-sm text-muted-foreground">{metrics.database.slow_queries}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Connection Pool</span>
                          <span className="text-sm text-muted-foreground">
                            {metrics.database.connection_pool_usage}%
                          </span>
                        </div>
                        <Progress value={metrics.database.connection_pool_usage} />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Active Connections</span>
                        <span className="text-sm text-muted-foreground">
                          {metrics.database.active_connections}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {analytics && (
            <>
              {/* User Activity Overview */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                    <UsersIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.user_activity.total_users}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Today</CardTitle>
                    <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.user_activity.active_users_today}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active This Week</CardTitle>
                    <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.user_activity.active_users_week}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Docs/User</CardTitle>
                    <ChartLineIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.user_activity.avg_documents_per_user}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Popular Features */}
              <Card>
                <CardHeader>
                  <CardTitle>Popular Features</CardTitle>
                  <CardDescription>Most used features and their usage rates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analytics.popular_features.map((feature, index) => (
                      <div key={index} className="flex items-center space-x-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{feature.feature}</span>
                            <span className="text-sm text-muted-foreground">
                              {feature.usage_count} uses ({feature.percentage}%)
                            </span>
                          </div>
                          <Progress value={feature.percentage} className="mt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          {metrics && (
            <>
              {/* System Health */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                    <ServerIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.system.uptime}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Response Time</CardTitle>
                    <ZapIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.system.response_time}ms</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                    <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.system.cpu_usage}%</div>
                    <Progress value={metrics.system.cpu_usage} className="mt-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                    <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metrics.system.memory_usage}%</div>
                    <Progress value={metrics.system.memory_usage} className="mt-2" />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}