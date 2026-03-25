import { Controller, Get, Req, Res, Param, Logger, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiOperation, ApiParam, ApiExcludeEndpoint } from '@nestjs/swagger';

@ApiTags('CDN Proxy')
@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private proxyService: ProxyService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Get('cdn/:originName/*')
  @ApiExcludeEndpoint()
  async proxyAsset(
    @Param('originName') originName: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const startTime = Date.now();
    
    // Extract path after /cdn/:originName/
    const path = '/' + req.params[0];
    const clientIp = req.ip || req.socket.remoteAddress;

    try {
      const proxyResult = await this.proxyService.proxyRequest(originName, path, req.method);

      // Set CDN headers
      res.setHeader('X-CDN-Cache', proxyResult.cacheStatus);
      res.setHeader('X-CDN-Origin', proxyResult.originName || originName);
      res.setHeader('X-Cache-Age', '0'); // TODO: Calculate actual age

      // Set response headers
      Object.entries(proxyResult.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      const durationMs = Date.now() - startTime;

      // Log request
      this.logRequest(
        proxyResult.originId ?? null,
        req.method,
        req.url,
        proxyResult.statusCode,
        proxyResult.cacheStatus,
        durationMs,
        proxyResult.body.length,
        clientIp,
        req.headers['user-agent'],
        req.headers['referer'],
      ).catch(err => this.logger.error(`Failed to log request: ${err.message}`));

      res.status(proxyResult.statusCode).send(proxyResult.body);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Proxy error for ${originName}${path}: ${error.message}`);

      // Log failed request
      this.logRequest(
        null,
        req.method,
        req.url,
        error.status || 500,
        'NO-ORIGIN',
        durationMs,
        0,
        clientIp,
        req.headers['user-agent'],
        req.headers['referer'],
      ).catch(() => {});

      throw new HttpException(
        error.message || 'Proxy request failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async logRequest(
    originId: number | null,
    method: string,
    url: string,
    statusCode: number,
    cacheStatus: string,
    durationMs: number,
    sizeBytes: number,
    clientIp?: string,
    userAgent?: string,
    referer?: string,
  ): Promise<void> {
    try {
      await this.prisma.request_log.create({
        data: {
          origin_id: originId,
          method,
          url,
          status_code: statusCode,
          cache_status: cacheStatus,
          duration_ms: durationMs,
          size_bytes: sizeBytes,
          client_ip: clientIp,
          user_agent: userAgent,
          referer: referer,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log request: ${error.message}`);
    }
  }
}
