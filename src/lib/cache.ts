import Redis from 'ioredis'
import { Redis as UpstashRedis } from '@upstash/redis'

// Initialize Redis with environment detection
let redis: Redis | UpstashRedis

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Production: Use Upstash Redis for Vercel
  console.log('🚀 Using Upstash Redis for caching')
  redis = new UpstashRedis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
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
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached
      }
      return null
    } catch (error) {
      console.warn('Cache get error:', error)
      return null
    }
  }

  static async setDocument(documentId: string, document: any, customTTL?: number) {
    try {
      const key = `${CACHE_KEYS.DOCUMENT}${documentId}`
      const value = JSON.stringify(document)
      const ttl = customTTL || CACHE_TTL.DOCUMENT
      
      // Handle different Redis clients
      if ('setex' in redis) {
        // ioredis
        await (redis as Redis).setex(key, ttl, value)
      } else {
        // Upstash Redis
        await (redis as UpstashRedis).set(key, value, { ex: ttl })
      }
    } catch (error) {
      console.warn('Cache set error:', error)
    }
  }


  // Embeddings caching (for expensive similarity searches)
  static async getEmbeddings(documentId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.EMBEDDINGS}${documentId}`)
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached
      }
      return null
    } catch (error) {
      console.warn('Cache get embeddings error:', error)
      return null
    }
  }

  static async setEmbeddings(documentId: string, embeddings: any[]) {
    try {
      const key = `${CACHE_KEYS.EMBEDDINGS}${documentId}`
      const value = JSON.stringify(embeddings)
      
      if ('setex' in redis) {
        await (redis as Redis).setex(key, CACHE_TTL.EMBEDDINGS, value)
      } else {
        await (redis as UpstashRedis).set(key, value, { ex: CACHE_TTL.EMBEDDINGS })
      }
    } catch (error) {
      console.warn('Cache set embeddings error:', error)
    }
  }

  // Search results caching
  static async getSearchResults(searchHash: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.SEARCH_RESULTS}${searchHash}`)
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached
      }
      return null
    } catch (error) {
      console.warn('Cache get search error:', error)
      return null
    }
  }

  static async setSearchResults(searchHash: string, results: any, customTTL?: number) {
    try {
      const key = `${CACHE_KEYS.SEARCH_RESULTS}${searchHash}`
      const value = JSON.stringify(results)
      const ttl = customTTL || CACHE_TTL.SEARCH_RESULTS
      
      if ('setex' in redis) {
        await (redis as Redis).setex(key, ttl, value)
      } else {
        await (redis as UpstashRedis).set(key, value, { ex: ttl })
      }
    } catch (error) {
      console.warn('Cache set search error:', error)
    }
  }

  // Processing status caching (for real-time updates)
  static async getProcessingStatus(documentId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.PROCESSING_STATUS}${documentId}`)
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached
      }
      return null
    } catch (error) {
      console.warn('Cache get status error:', error)
      return null
    }
  }

  static async setProcessingStatus(documentId: string, status: any) {
    try {
      const key = `${CACHE_KEYS.PROCESSING_STATUS}${documentId}`
      const value = JSON.stringify(status)
      
      if ('setex' in redis) {
        await (redis as Redis).setex(key, CACHE_TTL.PROCESSING_STATUS, value)
      } else {
        await (redis as UpstashRedis).set(key, value, { ex: CACHE_TTL.PROCESSING_STATUS })
      }
    } catch (error) {
      console.warn('Cache set status error:', error)
    }
  }

  // User dashboard data caching
  static async getDashboardData(userId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.DASHBOARD_DATA}${userId}`)
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached
      }
      return null
    } catch (error) {
      console.warn('Cache get dashboard error:', error)
      return null
    }
  }

  static async setDashboardData(userId: string, data: any) {
    try {
      const key = `${CACHE_KEYS.DASHBOARD_DATA}${userId}`
      const value = JSON.stringify(data)
      
      if ('setex' in redis) {
        await (redis as Redis).setex(key, CACHE_TTL.DASHBOARD_DATA, value)
      } else {
        await (redis as UpstashRedis).set(key, value, { ex: CACHE_TTL.DASHBOARD_DATA })
      }
    } catch (error) {
      console.warn('Cache set dashboard error:', error)
    }
  }


  // Similar documents caching
  static async getSimilarDocuments(documentId: string, filtersHash: string) {
    try {
      const key = `${CACHE_KEYS.SIMILAR_DOCS}${documentId}:${filtersHash}`
      console.log(`🔍 Cache GET attempt: ${key}`)
      
      const cached = await redis.get(key)
      
      if (cached) {
        console.log(`✅ Cache HIT: ${key}`)
        return typeof cached === 'string' ? JSON.parse(cached) : cached
      } else {
        console.log(`❌ Cache MISS: ${key}`)
        return null
      }
    } catch (error) {
      console.warn('Cache get similar docs error:', error)
      return null
    }
  }

  static async setSimilarDocuments(documentId: string, filtersHash: string, results: any) {
    try {
      const key = `${CACHE_KEYS.SIMILAR_DOCS}${documentId}:${filtersHash}`
      const value = JSON.stringify(results)
      
      console.log(`💾 Cache SET attempt: ${key}`)
      
      // Handle different Redis clients
      if ('setex' in redis) {
        // ioredis
        await (redis as Redis).setex(key, CACHE_TTL.SIMILAR_DOCS, value)
      } else {
        // Upstash Redis
        await (redis as UpstashRedis).set(key, value, { ex: CACHE_TTL.SIMILAR_DOCS })
      }
      
      console.log(`✅ Cache SET success: ${key}`)
    } catch (error) {
      console.warn('Cache set similar docs error:', error)
    }
  }

  // User statistics caching
  static async getUserStats(userId: string) {
    try {
      const cached = await redis.get(`${CACHE_KEYS.USER_STATS}${userId}`)
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached
      }
      return null
    } catch (error) {
      console.warn('Cache get user stats error:', error)
      return null
    }
  }

  static async setUserStats(userId: string, stats: any) {
    try {
      const key = `${CACHE_KEYS.USER_STATS}${userId}`
      const value = JSON.stringify(stats)
      
      if ('setex' in redis) {
        await (redis as Redis).setex(key, CACHE_TTL.USER_STATS, value)
      } else {
        await (redis as UpstashRedis).set(key, value, { ex: CACHE_TTL.USER_STATS })
      }
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
      return values.map(value => {
        if (value) {
          return typeof value === 'string' ? JSON.parse(value) : value
        }
        return null
      })
    } catch (error) {
      console.warn('Cache mget error:', error)
      return new Array(keys.length).fill(null)
    }
  }

  static async setMultiple(keyValuePairs: Array<{key: string, value: any, ttl?: number}>) {
    try {
      if ('pipeline' in redis) {
        // ioredis
        const pipeline = (redis as Redis).pipeline()
        keyValuePairs.forEach(({ key, value, ttl }) => {
          pipeline.setex(key, ttl || 300, JSON.stringify(value))
        })
        await pipeline.exec()
      } else {
        // Upstash Redis - set individually
        for (const { key, value, ttl } of keyValuePairs) {
          await (redis as UpstashRedis).set(key, JSON.stringify(value), { ex: ttl || 300 })
        }
      }
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
      if ('info' in redis) {
        const info = await (redis as Redis).info('memory')
        const keyspace = await (redis as Redis).info('keyspace')
        return {
          memory: info,
          keyspace: keyspace,
          timestamp: new Date().toISOString()
        }
      } else {
        // Upstash Redis doesn't support info command
        return {
          memory: 'N/A (Upstash Redis)',
          keyspace: 'N/A (Upstash Redis)',
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      console.warn('Cache stats error:', error)
      return null
    }
  }

  // Graceful cleanup
  static async disconnect() {
    try {
      if ('disconnect' in redis) {
        await (redis as Redis).disconnect()
      }
      // Upstash Redis doesn't need explicit disconnect
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