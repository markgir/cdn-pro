import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';

export interface ImageOptimizationOptions {
  format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
  width?: number;
  height?: number;
  quality?: number;
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly qualityWebP: number;
  private readonly qualityAVIF: number;
  private readonly qualityJPEG: number;

  constructor(private configService: ConfigService) {
    this.maxWidth = parseInt(this.configService.get('IMAGE_MAX_WIDTH', '4096'));
    this.maxHeight = parseInt(this.configService.get('IMAGE_MAX_HEIGHT', '4096'));
    this.qualityWebP = parseInt(this.configService.get('IMAGE_QUALITY_WEBP', '85'));
    this.qualityAVIF = parseInt(this.configService.get('IMAGE_QUALITY_AVIF', '80'));
    this.qualityJPEG = parseInt(this.configService.get('IMAGE_QUALITY_JPEG', '85'));
  }

  async optimizeImage(buffer: Buffer, options: ImageOptimizationOptions = {}): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      let pipeline = sharp(buffer);
      const metadata = await pipeline.metadata();

      // Resize if requested or if exceeds max dimensions
      const targetWidth = options.width || (metadata.width > this.maxWidth ? this.maxWidth : undefined);
      const targetHeight = options.height || (metadata.height > this.maxHeight ? this.maxHeight : undefined);

      if (targetWidth || targetHeight) {
        pipeline = pipeline.resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Determine output format
      let format = options.format || 'auto';
      if (format === 'auto') {
        // Default to WebP for best compatibility/quality
        format = 'webp';
      }

      // Convert and compress
      let optimized: Buffer;
      let contentType: string;

      switch (format) {
        case 'avif':
          optimized = await pipeline.avif({ quality: options.quality || this.qualityAVIF }).toBuffer();
          contentType = 'image/avif';
          break;
        case 'webp':
          optimized = await pipeline.webp({ quality: options.quality || this.qualityWebP }).toBuffer();
          contentType = 'image/webp';
          break;
        case 'jpeg':
          optimized = await pipeline.jpeg({ quality: options.quality || this.qualityJPEG, progressive: true }).toBuffer();
          contentType = 'image/jpeg';
          break;
        case 'png':
          optimized = await pipeline.png({ compressionLevel: 9 }).toBuffer();
          contentType = 'image/png';
          break;
        default:
          throw new BadRequestException(`Unsupported format: ${format}`);
      }

      const originalSize = buffer.length;
      const optimizedSize = optimized.length;
      const savings = ((1 - optimizedSize / originalSize) * 100).toFixed(2);

      this.logger.debug(`Optimized image: ${originalSize} -> ${optimizedSize} bytes (${savings}% savings)`);

      return { buffer: optimized, contentType };
    } catch (error) {
      this.logger.error(`Image optimization failed: ${error.message}`);
      throw new BadRequestException(`Failed to optimize image: ${error.message}`);
    }
  }

  generatePlaceholderSVG(width: number = 800, height: number = 600, bgColor: string = '#cccccc', textColor: string = '#666666'): string {
    const text = `${width} × ${height}`;
    
    return `<svg width="${width}" height="${height}" xmlns="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/3840px-Placeholder_view_vector.svg.png">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="${textColor}">${text}</text>
</svg>`;
  }
}
