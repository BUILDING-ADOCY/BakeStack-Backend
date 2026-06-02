import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import {
  ReportsController,
  TenantReportsController,
} from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuditModule],
  controllers: [ReportsController, TenantReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
