import Redis from 'ioredis'

// Initialize Redis with environment detection
let redis: Redis

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Production: Use Upstash Redis for Vercel
  console.log('🚀 Using Upstash Redis for caching')
  redis = new Redis(process.env.UPSTASH_REDIS_REST_URL, {
    enableReadyCheck: false,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    showFriendlyErrorStack: true,
  })
} else {
  // Development: Use local Redis
  console.log('🔧 Using local Redis for caching')
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    showFriendlyErrorStack: true,
  })
}

// Cache key prefixes
const CACHE_KEYS = {
  DOCUMENT: 'doc:',
  EMBEDDINGS: 'emb:',
  SEARCH_RESULTS: 'search:',
  USER_STATS: 'stats:',
  PROCESSING_STATUS: 'status:',
  SIMILAR_DOCS: 'similar:',
  DASHBOARD_DATA: 'dashboard:',
} as const

// Cache TTL (Time To Live) configurations
const CACHE_TTL = {
  DOCUMENT: 60 * 15, // 15 minutes
  EMBEDDINGS: 60 * 60 * 24, // 24 hours
  SEARCH_RESULTS: 60 * 10, // 10 minutes
  USER_STATS: 60 * 5, // 5 minutes
  PROCESSING_STATUS: 30, // 30 seconds
  SIMILAR_DOCS: 60 * 30, // 30 minutes
  DASHBOARD_DATA: 60 * 2, // 2 minutes
} as const

export class CacheManager {
  
  // Document caching
  static async getDocument(documentId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.DOCUMENT}${documentId}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Cache get error:', error)
      return null
    }
  }

  static async setDocument(documentId: string, document: any, customTTL?: number) {
    try {
      await redis.setex(
        `${CACHE_KEYS.DOCUMENT}${documentId}`,
        customTTL || CACHE_TTL.DOCUMENT,
        JSON.stringify(document)
      )
    } catch (error) {
      console.warn('Cache set error:', error)
    }
  }


  // Embeddings caching (for expensive similarity searches)
  static async getEmbeddings(documentId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.EMBEDDINGS}${documentId}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Cache get embeddings error:', error)
      return null
    }
  }

  static async setEmbeddings(documentId: string, embeddings: any[]) {
    try {
      await redis.setex(
        `${CACHE_KEYS.EMBEDDINGS}${documentId}`,
        CACHE_TTL.EMBEDDINGS,
        JSON.stringify(embeddings)
      )
    } catch (error) {
      console.warn('Cache set embeddings error:', error)
    }
  }

  // Search results caching
  static async getSearchResults(searchHash: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.SEARCH_RESULTS}${searchHash}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Cache get search error:', error)
      return null
    }
  }

  static async setSearchResults(searchHash: string, results: any, customTTL?: number) {
    try {
      await redis.setex(
        `${CACHE_KEYS.SEARCH_RESULTS}${searchHash}`,
        customTTL || CACHE_TTL.SEARCH_RESULTS,
        JSON.stringify(results)
      )
    } catch (error) {
      console.warn('Cache set search error:', error)
    }
  }

  // Processing status caching (for real-time updates)
  static async getProcessingStatus(documentId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.PROCESSING_STATUS}${documentId}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Cache get status error:', error)
      return null
    }
  }

  static async setProcessingStatus(documentId: string, status: any) {
    try {
      await redis.setex(
        `${CACHE_KEYS.PROCESSING_STATUS}${documentId}`,
        CACHE_TTL.PROCESSING_STATUS,
        JSON.stringify(status)
      )
    } catch (error) {
      console.warn('Cache set status error:', error)
    }
  }

  // User dashboard data caching
  static async getDashboardData(userId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.DASHBOARD_DATA}${userId}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Cache get dashboard error:', error)
      return null
    }
  }

  static async setDashboardData(userId: string, data: any) {
    try {
      await redis.setex(
        `${CACHE_KEYS.DASHBOARD_DATA}${userId}`,
        CACHE_TTL.DASHBOARD_DATA,
        JSON.stringify(data)
      )
    } catch (error) {
      console.warn('Cache set dashboard error:', error)
    }
  }


  // Similar documents caching
  static async getSimilarDocuments(documentId: string, filtersHash: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.SIMILAR_DOCS}${documentId}:${filtersHash}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Cache get similar docs error:', error)
      return null
    }
  }

  static async setSimilarDocuments(documentId: string, filtersHash: string, results: any) {
    try {
      await redis.setex(
        `${CACHE_KEYS.SIMILAR_DOCS}${documentId}:${filtersHash}`,
        CACHE_TTL.SIMILAR_DOCS,
        JSON.stringify(results)
      )
    } catch (error) {
      console.warn('Cache set similar docs error:', error)
    }
  }

  // User statistics caching
  static async getUserStats(userId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.USER_STATS}${userId}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Cache get user stats error:', error)
      return null
    }
  }

  static async setUserStats(userId: string, stats: any) {
    try {
      await redis.setex(
        `${CACHE_KEYS.USER_STATS}${userId}`,
        CACHE_TTL.USER_STATS,
        JSON.stringify(stats)
      )
    } catch (error) {
      console.warn('Cache set user stats error:', error)
    }
  }

  // Utility methods
  static async invalidatePattern(pattern: string) {
    try {
      const keys = await redis.keys(pattern)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } catch (error) {
      console.warn('Cache pattern invalidation error:', error)
    }
  }

  static async invalidateUser(userId: string) {
    try {
      await this.invalidatePattern(`${CACHE_KEYS.USER_STATS}${userId}`)
      await this.invalidatePattern(`${CACHE_KEYS.DASHBOARD_DATA}${userId}`)
    } catch (error) {
      console.warn('Cache user invalidation error:', error)
    }
  }

  static async invalidateDocument(documentId: string) {
    try {
      await this.invalidatePattern(`${CACHE_KEYS.DOCUMENT}${documentId}`)
      await this.invalidatePattern(`${CACHE_KEYS.PROCESSING_STATUS}${documentId}`)
      await this.invalidatePattern(`${CACHE_KEYS.EMBEDDINGS}${documentId}*`)
    } catch (error) {
      console.warn('Cache document invalidation error:', error)
    }
  }

  static async invalidateDashboardData(userId: string) {
    try {
      await this.invalidatePattern(`${CACHE_KEYS.DASHBOARD_DATA}${userId}`)
    } catch (error) {
      console.warn('Cache dashboard invalidation error:', error)
    }
  }

  static async getMultiple(keys: string[]) {
    try {
      const values = await redis.mget(...keys)
      return values.map(value => value ? JSON.parse(value) : null)
    } catch (error) {
      console.warn('Cache mget error:', error)
      return new Array(keys.length).fill(null)
    }
  }

  static async setMultiple(keyValuePairs: Array<{key: string, value: any, ttl?: number}>) {
    try {
      const pipeline = redis.pipeline()
      
      keyValuePairs.forEach(({ key, value, ttl }) => {
        pipeline.setex(key, ttl || 300, JSON.stringify(value))
      })
      
      await pipeline.exec()
    } catch (error) {
      console.warn('Cache mset error:', error)
    }
  }

  // Health check
  static async healthCheck() {
    try {
      await redis.ping()
      return { status: 'healthy', timestamp: new Date().toISOString() }
    } catch (error) {
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error', timestamp: new Date().toISOString() }
    }
  }

  // Cache statistics
  static async getStats() {
    try {
      const info = await redis.info('memory')
      const keyspace = await redis.info('keyspace')
      
      return {
        memory: info,
        keyspace: keyspace,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.warn('Cache stats error:', error)
      return null
    }
  }

  // Graceful cleanup
  static async disconnect() {
    try {
      await redis.disconnect()
    } catch (error) {
      console.warn('Cache disconnect error:', error)
    }
  }
}

// Create hash for cache keys
export function createCacheHash(data: any): string {
  const crypto = require('crypto')
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
}

// Cache warming utilities
export async function warmDocumentCache(documentIds: string[]) {
  // This would be called after document processing completes
  // to pre-populate cache with frequently accessed documents
  console.log(`Warming cache for ${documentIds.length} documents`)
  // Implementation would fetch and cache these documents
}

export default CacheManager