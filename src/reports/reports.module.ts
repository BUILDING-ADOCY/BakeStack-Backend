import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecipesModule } from '../recipes/recipes.module';
import {
  ReportsController,
  TenantReportsController,
} from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuditModule, RecipesModule],
  controllers: [ReportsController, TenantReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
