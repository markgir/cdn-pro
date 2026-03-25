import { Controller, Post, Get, Body, Query, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ImagesService } from './images.service';
import { Public } from '../auth/public.decorator';

@ApiTags('Image Tools')
@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Public()
  @Get('placeholder')
  @ApiOperation({ summary: 'Generate SVG placeholder image' })
  @ApiQuery({ name: 'width', required: false, type: Number, example: 800 })
  @ApiQuery({ name: 'height', required: false, type: Number, example: 600 })
  @ApiQuery({ name: 'bg', required: false, type: String, example: '#cccccc' })
  @ApiQuery({ name: 'text', required: false, type: String, example: '#666666' })
  @ApiResponse({ status: 200, description: 'SVG image', content: { 'image/svg+xml': {} } })
  generatePlaceholder(
    @Query('width') width?: string,
    @Query('height') height?: string,
    @Query('bg') bgColor?: string,
    @Query('text') textColor?: string,
    @Res() res?: Response,
  ) {
    const w = parseInt(width || '800');
    const h = parseInt(height || '600');
    const bg = bgColor || '#cccccc';
    const text = textColor || '#666666';

    const svg = this.imagesService.generatePlaceholderSVG(w, h, bg, text);

    res!.setHeader('Content-Type', 'image/svg+xml');
    res!.setHeader('Cache-Control', 'public, max-age=31536000');
    res!.status(HttpStatus.OK).send(svg);
  }
}
