import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

@ApiTags('Observability')
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async check() {
    const health: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {},
    };

    // Check database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      health.checks.database = { status: 'up' };
    } catch (error) {
      health.checks.database = { status: 'down', error: error.message };
      health.status = 'degraded';
    }

    // Check cache
    try {
      const cacheStats = await this.cacheService.getStats();
      health.checks.cache = { status: 'up', ...cacheStats };
    } catch (error) {
      health.checks.cache = { status: 'down', error: error.message };
      health.status = 'degraded';
    }

    // Check memory
    const memUsage = process.memoryUsage();
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    health.checks.memory = {
      status: memPercent < 90 ? 'up' : 'warning',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      percent: memPercent.toFixed(2) + '%',
    };

    // Check origins
    try {
      const originsCount = await this.prisma.origin.count({ where: { active: true } });
      health.checks.origins = {
        status: originsCount > 0 ? 'up' : 'warning',
        count: originsCount,
      };
    } catch (error) {
      health.checks.origins = { status: 'down', error: error.message };
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    return { statusCode, ...health };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ready: true };
    } catch (error) {
      return { ready: false, error: error.message };
    }
  }
}
