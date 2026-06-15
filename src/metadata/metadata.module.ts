import { Module } from '@nestjs/common';
import { MetadataController } from './metadata.controller';
import { MarketsService } from './markets.service';

@Module({
  controllers: [MetadataController],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MetadataModule {}
