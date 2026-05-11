import { Module } from '@nestjs/common';
import { WastageService } from './wastage.service';

@Module({
  providers: [WastageService],
  exports: [WastageService],
})
export class WastageModule {}
