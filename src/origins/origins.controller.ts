import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { OriginsService, type CreateOriginDto, type UpdateOriginDto } from './origins.service';

@ApiTags('Origins Management')
@ApiBearerAuth()
@Controller('origins')
export class OriginsController {
  constructor(private readonly originsService: OriginsService) {}

  @Get()
  @ApiOperation({ summary: 'List all origins' })
  @ApiResponse({ status: 200, description: 'List of origins' })
  async findAll() {
    return this.originsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get origin by ID' })
  @ApiResponse({ status: 200, description: 'Origin found' })
  @ApiResponse({ status: 404, description: 'Origin not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.originsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new origin' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'origin_url'],
      properties: {
        name: { type: 'string', example: 'my-shop' },
        origin_url: { type: 'string', example: 'https://shop.example.com' },
        type: { type: 'string', enum: ['woocommerce', 'prestashop', 'generic'], example: 'woocommerce' },
        cdn_hostname: { type: 'string', example: 'cdn.example.com' },
        cache_ttl: { type: 'number', example: 3600 },
        active: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Origin created' })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  async create(@Body() data: CreateOriginDto) {
    return this.originsService.create(data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update origin' })
  @ApiResponse({ status: 200, description: 'Origin updated' })
  @ApiResponse({ status: 404, description: 'Origin not found' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateOriginDto) {
    return this.originsService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete origin and purge its cache' })
  @ApiResponse({ status: 200, description: 'Origin deleted' })
  @ApiResponse({ status: 404, description: 'Origin not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.originsService.remove(id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test origin connectivity' })
  @ApiResponse({ status: 200, description: 'Test result' })
  async test(@Param('id', ParseIntPipe) id: number) {
    return this.originsService.testOrigin(id);
  }

  @Post(':id/purge-cache')
  @ApiOperation({ summary: 'Purge all cache for this origin' })
  @ApiResponse({ status: 200, description: 'Cache purged' })
  async purgeCache(@Param('id', ParseIntPipe) id: number) {
    const count = await this.originsService.purgeCacheForOrigin(id);
    return { message: `Purged ${count} cache entries`, count };
  }
}
