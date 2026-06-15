import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { WastageController } from './wastage.controller';
import { WastageService } from './wastage.service';

@Module({
  imports: [AuditModule, AuthModule, IdempotencyModule],
  controllers: [WastageController],
  providers: [WastageService],
  exports: [WastageService],
})
export class WastageModule {}
