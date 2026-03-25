import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

interface CacheEntry {
  body: Buffer;
  headers: Record<string, string>;
  statusCode: number;
  contentType: string;
  timestamp: number;
}

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private memoryCache = new Map<string, CacheEntry>();
  private readonly maxMemoryItems: number;
  private useRedis = false;

  constructor(private configService: ConfigService) {
    this.maxMemoryItems = parseInt(this.configService.get('MEMORY_CACHE_MAX_ITEMS', '1000'));
  }

  async onModuleInit() {
    // Try to connect to Redis, fallback to memory-only if fails
    const redisHost = this.configService.get('REDIS_HOST');
    const redisPort = parseInt(this.configService.get('REDIS_PORT', '6379'));
    const redisPassword = this.configService.get('REDIS_PASSWORD');
    const redisDb = parseInt(this.configService.get('REDIS_DB', '0'));

    if (redisHost) {
      try {
        this.redis = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword || undefined,
          db: redisDb,
          retryStrategy: (times) => {
            if (times > 3) {
              this.logger.warn('Redis connection failed, falling back to memory-only cache');
              this.useRedis = false;
              return null;
            }
            return Math.min(times * 100, 3000);
          },
        });

        await this.redis.ping();
        this.useRedis = true;
        this.logger.log('✅ Redis cache connected successfully');
      } catch (error) {
        this.logger.warn(`Redis connection failed: ${error.message}. Using memory-only cache.`);
        this.useRedis = false;
      }
    } else {
      this.logger.warn('⚠️  REDIS_HOST not configured. Using memory-only cache (volatile, single-instance).');
    }
  }

  async get(key: string): Promise<CacheEntry | null> {
    // Try L1 (memory) first
    const memCached = this.memoryCache.get(key);
    if (memCached) {
      return memCached;
    }

    // Try L2 (Redis) if available
    if (this.useRedis && this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const entry = JSON.parse(cached);
          // Reconstruct Buffer from base64
          entry.body = Buffer.from(entry.body, 'base64');
          // Promote to L1
          this.setMemoryCache(key, entry);
          return entry;
        }
      } catch (error) {
        this.logger.error(`Redis GET error for key ${key}: ${error.message}`);
      }
    }

    return null;
  }

  async set(key: string, value: CacheEntry, ttl: number): Promise<void> {
    // Store in L1 (memory)
    this.setMemoryCache(key, value);

    // Store in L2 (Redis) if available
    if (this.useRedis && this.redis) {
      try {
        // Convert Buffer to base64 for JSON serialization
        const serializable = {
          ...value,
          body: value.body.toString('base64'),
        };
        await this.redis.setex(key, ttl, JSON.stringify(serializable));
      } catch (error) {
        this.logger.error(`Redis SET error for key ${key}: ${error.message}`);
      }
    }
  }

  async purge(key: string): Promise<boolean> {
    // Remove from L1
    this.memoryCache.delete(key);

    // Remove from L2
    if (this.useRedis && this.redis) {
      try {
        const deleted = await this.redis.del(key);
        return deleted > 0;
      } catch (error) {
        this.logger.error(`Redis DEL error for key ${key}: ${error.message}`);
        return false;
      }
    }

    return true;
  }

  async purgeByPrefix(prefix: string): Promise<number> {
    let count = 0;

    // Remove from L1
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    // Remove from L2
    if (this.useRedis && this.redis) {
      try {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length > 0) {
          const deleted = await this.redis.del(...keys);
          count += deleted;
        }
      } catch (error) {
        this.logger.error(`Redis purge by prefix error: ${error.message}`);
      }
    }

    return count;
  }

  async flush(): Promise<void> {
    // Clear L1
    this.memoryCache.clear();

    // Clear L2
    if (this.useRedis && this.redis) {
      try {
        await this.redis.flushdb();
      } catch (error) {
        this.logger.error(`Redis FLUSHDB error: ${error.message}`);
      }
    }
  }

  async getStats(): Promise<any> {
    const stats: any = {
      memoryCache: {
        size: this.memoryCache.size,
        maxSize: this.maxMemoryItems,
      },
    };

    if (this.useRedis && this.redis) {
      try {
        const info = await this.redis.info('stats');
        const dbsize = await this.redis.dbsize();
        stats.redis = {
          connected: true,
          keys: dbsize,
          info: info,
        };
      } catch (error) {
        stats.redis = { connected: false, error: error.message };
      }
    } else {
      stats.redis = { connected: false };
    }

    return stats;
  }

  private setMemoryCache(key: string, value: CacheEntry): void {
    // LRU eviction: if full, remove oldest
    if (this.memoryCache.size >= this.maxMemoryItems) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, value);
  }
}
