import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';
import fetch from 'node-fetch';
import * as http from 'http';

export interface ProxyResponse {
  body: Buffer;
  statusCode: number;
  headers: Record<string, string>;
  cacheStatus: 'HIT' | 'MISS' | 'MISS-STORED' | 'NO-ORIGIN' | 'BYPASS';
  originId?: number;
  originName?: string;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly defaultTtl: number;

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private configService: ConfigService,
  ) {
    this.defaultTtl = parseInt(this.configService.get('CACHE_DEFAULT_TTL', '3600'));
  }

  async proxyRequest(
    originName: string,
    path: string,
    method: string = 'GET',
  ): Promise<ProxyResponse> {
    // Find origin
    const origin = await this.prisma.origin.findUnique({
      where: { name: originName },
    });

    if (!origin) {
      throw new NotFoundException(`Origin "${originName}" not found`);
    }

    if (!origin.active) {
      throw new NotFoundException(`Origin "${originName}" is disabled`);
    }

    // Build cache key
    const cacheKey = `${origin.id}::${path}`;

    // Check cache (only for GET requests)
    if (method === 'GET') {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        return {
          body: cached.body,
          statusCode: cached.statusCode,
          headers: cached.headers,
          cacheStatus: 'HIT',
          originId: origin.id,
          originName: origin.name,
        };
      }
    }

    // Build origin URL
    const targetUrl = new URL(path, origin.origin_url).toString();

    try {
      // Fetch from origin
      const response = await fetch(targetUrl, {
        method,
        headers: {
          'User-Agent': 'CDN-Manager/2.0',
          'X-Forwarded-For': '127.0.0.1', // Will be replaced by actual client IP
        },
        timeout: 30000,
      });

      const body = await response.buffer();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      // Prepare headers
      const headers: Record<string, string> = {
        'content-type': contentType,
      };

      // Copy cache-related headers
      if (response.headers.get('cache-control')) {
        headers['cache-control'] = response.headers.get('cache-control')!;
      }
      if (response.headers.get('etag')) {
        headers['etag'] = response.headers.get('etag')!;
      }
      if (response.headers.get('last-modified')) {
        headers['last-modified'] = response.headers.get('last-modified')!;
      }

      let cacheStatus: 'MISS' | 'MISS-STORED' | 'BYPASS' = 'MISS';

      // Store in cache if successful GET request
      if (method === 'GET' && response.ok && this.isCacheable(contentType)) {
        const cacheEntry = {
          body,
          headers,
          statusCode: response.status,
          contentType,
          timestamp: Date.now(),
        };

        await this.cacheService.set(cacheKey, cacheEntry, origin.cache_ttl || this.defaultTtl);
        cacheStatus = 'MISS-STORED';

        // Store metadata in database
        await this.storeCacheMetadata(origin.id, cacheKey, path, contentType, body.length, origin.cache_ttl);
      } else {
        cacheStatus = 'BYPASS';
      }

      return {
        body,
        statusCode: response.status,
        headers,
        cacheStatus,
        originId: origin.id,
        originName: origin.name,
      };
    } catch (error) {
      this.logger.error(`Proxy request failed for ${targetUrl}: ${error.message}`);
      throw error;
    }
  }

  private isCacheable(contentType: string): boolean {
    const cacheableTypes = [
      'image/',
      'text/css',
      'text/javascript',
      'application/javascript',
      'application/x-javascript',
      'font/',
      'application/font',
    ];

    return cacheableTypes.some(type => contentType.toLowerCase().includes(type));
  }

  private async storeCacheMetadata(
    originId: number,
    cacheKey: string,
    urlPath: string,
    contentType: string,
    sizeBytes: number,
    ttl: number,
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttl * 1000);

      await this.prisma.cache_entry.upsert({
        where: { cache_key: cacheKey },
        create: {
          origin_id: originId,
          cache_key: cacheKey,
          url_path: urlPath,
          content_type: contentType,
          size_bytes: sizeBytes,
          hit_count: 0,
          expires_at: expiresAt,
        },
        update: {
          size_bytes: sizeBytes,
          expires_at: expiresAt,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to store cache metadata: ${error.message}`);
    }
  }
}
