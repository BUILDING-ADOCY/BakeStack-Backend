import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { MarketsService } from './markets.service';

@Public()
@Controller('metadata')
export class MetadataController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get('markets')
  findMarkets() {
    return {
      data: this.marketsService.findAll(),
      message: 'Markets retrieved successfully',
    };
  }
}
