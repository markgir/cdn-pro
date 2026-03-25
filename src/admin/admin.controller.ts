import { Controller, Get, Post, Query, Body, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

@ApiTags('Admin & Analytics')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get overall statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getStats() {
    const [totalOrigins, activeOrigins, totalRequests, cacheStats] = await Promise.all([
      this.prisma.origin.count(),
      this.prisma.origin.count({ where: { active: true } }),
      this.prisma.request_log.count(),
      this.cacheService.getStats(),
    ]);

    // Cache hit rate (last 1000 requests)
    const recentRequests = await this.prisma.request_log.findMany({
      take: 1000,
      orderBy: { timestamp: 'desc' },
      select: { cache_status: true },
    });

    const hits = recentRequests.filter(r => r.cache_status === 'HIT').length;
    const total = recentRequests.length;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00';

    return {
      origins: {
        total: totalOrigins,
        active: activeOrigins,
        inactive: totalOrigins - activeOrigins,
      },
      requests: {
        total: totalRequests,
        recent: total,
      },
      cache: {
        hitRate: `${hitRate}%`,
        hits,
        total,
        ...cacheStats,
      },
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
      },
    };
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get request logs' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'HIT' })
  @ApiResponse({ status: 200, description: 'Logs retrieved' })
  async getLogs(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    const where = status ? { cache_status: status } : {};

    return this.prisma.request_log.findMany({
      where,
      take: Math.min(limit, 1000),
      orderBy: { timestamp: 'desc' },
      include: {
        origin: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  @Post('cache/purge')
  @ApiOperation({ summary: 'Purge cache by key or prefix' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string', example: '1::/path/to/asset.jpg' },
        prefix: { type: 'string', example: '1::' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Cache purged' })
  async purgeCache(@Body() body: { key?: string; prefix?: string }) {
    if (body.key) {
      const success = await this.cacheService.purge(body.key);
      return { message: success ? 'Key purged successfully' : 'Key not found', success };
    }

    if (body.prefix) {
      const count = await this.cacheService.purgeByPrefix(body.prefix);
      return { message: `Purged ${count} entries`, count };
    }

    return { message: 'No key or prefix provided', success: false };
  }

  @Post('cache/flush')
  @ApiOperation({ summary: 'Flush entire cache' })
  @ApiResponse({ status: 200, description: 'Cache flushed' })
  async flushCache() {
    await this.cacheService.flush();
    return { message: 'Cache flushed successfully' };
  }
}
