import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'CDN Manager API',
      version: '2.0.0',
      description: 'Modern self-hosted CDN for e-commerce',
      documentation: '/api-docs',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        auth: '/auth/login',
        origins: '/origins',
        proxy: '/cdn/:originName/*',
        admin: '/admin/stats',
      },
    };
  }
}
