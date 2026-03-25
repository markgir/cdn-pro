import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import fetch from 'node-fetch';

export interface CreateOriginDto {
  name: string;
  origin_url: string;
  type?: string;
  cdn_hostname?: string;
  cache_ttl?: number;
  active?: boolean;
}

export interface UpdateOriginDto {
  name?: string;
  origin_url?: string;
  type?: string;
  cdn_hostname?: string;
  cache_ttl?: number;
  active?: boolean;
}

@Injectable()
export class OriginsService {
  private readonly logger = new Logger(OriginsService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  async findAll() {
    return this.prisma.origin.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: number) {
    const origin = await this.prisma.origin.findUnique({ where: { id } });
    if (!origin) {
      throw new NotFoundException(`Origin with ID ${id} not found`);
    }
    return origin;
  }

  async findByName(name: string) {
    return this.prisma.origin.findUnique({ where: { name } });
  }

  async create(data: CreateOriginDto) {
    // Validate origin URL
    this.validateOriginUrl(data.origin_url);

    // Check if name already exists
    const existing = await this.findByName(data.name);
    if (existing) {
      throw new BadRequestException(`Origin with name "${data.name}" already exists`);
    }

    return this.prisma.origin.create({
      data: {
        name: data.name,
        origin_url: data.origin_url,
        type: data.type || 'generic',
        cdn_hostname: data.cdn_hostname,
        cache_ttl: data.cache_ttl || 3600,
        active: data.active !== undefined ? data.active : true,
      },
    });
  }

  async update(id: number, data: UpdateOriginDto) {
    await this.findOne(id); // Ensure exists

    if (data.origin_url) {
      this.validateOriginUrl(data.origin_url);
    }

    return this.prisma.origin.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    await this.findOne(id); // Ensure exists

    // Purge all cache entries for this origin
    await this.cacheService.purgeByPrefix(`${id}::`);

    await this.prisma.origin.delete({ where: { id } });
    
    return { message: `Origin ${id} deleted successfully` };
  }

  async testOrigin(id: number): Promise<{ success: boolean; statusCode?: number; message?: string; latency?: number }> {
    const origin = await this.findOne(id);

    const startTime = Date.now();
    try {
      const response = await fetch(origin.origin_url, {
        method: 'HEAD',
        timeout: 5000,
      });
      const latency = Date.now() - startTime;

      return {
        success: response.ok,
        statusCode: response.status,
        message: response.ok ? 'Origin is reachable' : `Origin returned ${response.status}`,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
        latency,
      };
    }
  }

  async purgeCacheForOrigin(id: number): Promise<number> {
    await this.findOne(id); // Ensure exists
    const count = await this.cacheService.purgeByPrefix(`${id}::`);
    this.logger.log(`Purged ${count} cache entries for origin ${id}`);
    return count;
  }

  private validateOriginUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // Must be HTTP or HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('Origin URL must use HTTP or HTTPS protocol');
      }

      // Block private IP ranges (SSRF protection)
      const hostname = parsed.hostname;
      const privateRanges = [
        /^127\./,        // 127.0.0.0/8
        /^10\./,         // 10.0.0.0/8
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
        /^192\.168\./,   // 192.168.0.0/16
        /^localhost$/i,
        /^0\.0\.0\.0$/,
      ];

      if (privateRanges.some(pattern => pattern.test(hostname))) {
        throw new BadRequestException('Private IP addresses and localhost are not allowed (SSRF protection)');
      }

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Invalid origin URL: ${error.message}`);
    }
  }
}
