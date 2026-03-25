import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Security: Helmet with custom CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // CORS: Enable for all origins (can be customized)
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Compression
  app.use(
    compression({
      threshold: 1024,
      level: 6,
      filter: (req, res) => {
        const contentType = res.getHeader('content-type') as string;
        if (contentType?.startsWith('image/')) {
          return false; // Don't compress images
        }
        return compression.filter(req, res);
      },
    }),
  );

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('CDN Manager API')
    .setDescription(`
## Modern CDN Manager for E-commerce

A high-performance, self-hosted CDN solution designed for WooCommerce and PrestaShop stores.

### Features
- ✅ Reverse proxy with intelligent caching (Redis + Memory)
- ✅ Image optimization (WebP/AVIF conversion, resizing, compression)
- ✅ JWT authentication with role-based access control
- ✅ Prometheus metrics for monitoring
- ✅ Rate limiting and SSRF protection
- ✅ Comprehensive logging and analytics

### Getting Started
1. **Login**: POST /auth/login with your credentials to get a JWT token
2. **Create Origin**: POST /origins to add your e-commerce store
3. **Access Assets**: GET /cdn/{originName}/{path} to proxy and cache assets
4. **Monitor**: Check /metrics for Prometheus metrics, /health for health status

### Authentication
Most endpoints require a JWT token. Include it in the Authorization header:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`
    `)
    .setVersion('2.0.0')
    .addBearerAuth()
    .addTag('Authentication', 'JWT-based authentication endpoints')
    .addTag('Origins Management', 'Manage CDN origin servers')
    .addTag('CDN Proxy', 'Reverse proxy endpoints for asset delivery')
    .addTag('Image Tools', 'Image optimization and placeholder generation')
    .addTag('Admin & Analytics', 'Statistics, logs, and cache management')
    .addTag('Observability', 'Health checks and metrics')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  // Custom CSS for professional look
  const customCss = `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { font-size: 2.5rem; color: #1a202c; }
    .swagger-ui .info { margin: 30px 0; }
    .swagger-ui .info .description { font-size: 1rem; line-height: 1.6; color: #4a5568; }
    .swagger-ui .opblock-tag { font-size: 1.3rem; color: #2d3748; border-bottom: 2px solid #e2e8f0; }
    .swagger-ui .opblock { border-radius: 8px; margin-bottom: 15px; }
    .swagger-ui .btn.authorize { background-color: #4299e1; border-color: #4299e1; }
    .swagger-ui .scheme-container { background: #f7fafc; padding: 20px; border-radius: 8px; }
    body { background: #ffffff; }
  `;

  SwaggerModule.setup('api-docs', app, document, {
    customCss,
    customSiteTitle: 'CDN Manager API',
    customfavIcon: 'https://cdn-icons-png.flaticon.com/512/1304/1304061.png',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  // Prevent caching of Swagger docs
  app.use('/api-docs', (req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  const port = process.env.CDN_PORT || 3000;
  await app.listen(port);

  logger.log(`✅ CDN Manager v2.0 is running on http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api-docs`);
  logger.log(`💡 Health Check: http://localhost:${port}/health`);
  logger.log(`📈 Metrics: http://localhost:${port}/metrics`);
}

bootstrap();
