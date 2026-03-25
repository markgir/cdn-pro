import { Injectable } from '@nestjs/common';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  public readonly register: Registry;
  public readonly httpRequestDuration: Histogram;
  public readonly httpRequestsTotal: Counter;
  public readonly cacheOperations: Counter;
  public readonly activeOrigins: Gauge;
  public readonly cacheSize: Gauge;

  constructor() {
    this.register = new Registry();

    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({ register: this.register, prefix: 'cdn_' });

    // HTTP request duration
    this.httpRequestDuration = new Histogram({
      name: 'cdn_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code', 'cache_status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.register],
    });

    // HTTP requests total
    this.httpRequestsTotal = new Counter({
      name: 'cdn_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'cache_status'],
      registers: [this.register],
    });

    // Cache operations
    this.cacheOperations = new Counter({
      name: 'cdn_cache_operations_total',
      help: 'Total cache operations',
      labelNames: ['operation', 'status'],
      registers: [this.register],
    });

    // Active origins
    this.activeOrigins = new Gauge({
      name: 'cdn_active_origins',
      help: 'Number of active origins',
      registers: [this.register],
    });

    // Cache size
    this.cacheSize = new Gauge({
      name: 'cdn_cache_size_bytes',
      help: 'Total cache size in bytes',
      labelNames: ['layer'],
      registers: [this.register],
    });
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}
