import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { QcController } from './qc.controller';
import { QcService } from './qc.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [QcController],
  providers: [QcService],
})
export class QcModule {}
