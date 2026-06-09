import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { OptionalTenantScopeDto } from '../common/dto/optional-tenant-scope.dto';
import { DomainException } from '../common/exceptions/domain.exception';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { CloseDailyCloseDto } from './dto/close-daily-close.dto';
import { CreateDailyClosePreviewDto } from './dto/create-daily-close-preview.dto';
import { ReportsService } from './reports.service';

@Controller('daily-close')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':locationId/:businessDate')
  async getDailyClose(
    @Req() request: Request,
    @Param('locationId') locationId: string,
    @Param('businessDate') businessDate: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.reportsService.findDailyClose(
        resolveTenantId(request, query.tenantId),
        locationId,
        businessDate,
      ),
      message: 'Daily close retrieved successfully',
    };
  }

  @Get(':locationId/:businessDate/reconciliation')
  async getReconciliation(
    @Req() request: Request,
    @Param('locationId') locationId: string,
    @Param('businessDate') businessDate: string,
    @Query() query: OptionalTenantScopeDto,
  ) {
    return {
      data: await this.reportsService.reconcileByDate(
        resolveTenantId(request, query.tenantId),
        locationId,
        businessDate,
      ),
      message: 'Reconciliation retrieved successfully',
    };
  }

  @Post('preview')
  async preview(@Body() dto: CreateDailyClosePreviewDto) {
    return {
      data: await this.reportsService.generateDailyClosePreview(dto),
      message: 'Daily close preview generated successfully',
    };
  }

  @Post('close')
  async close(@Body() dto: CloseDailyCloseDto) {
    return {
      data: await this.reportsService.closeDailyClose(dto),
      message: 'Daily close completed successfully',
    };
  }
}

@Controller('reports')
export class TenantReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('tenant-summary')
  async getTenantSummary(
    @Req() request: Request,
    @Query('groupBy') groupBy?: string,
  ) {
    if (groupBy !== 'currency') {
      throw new DomainException(
        'REPORT_GROUPING_REQUIRED',
        'Tenant summary requires groupBy=currency',
        400,
      );
    }

    return {
      data: await this.reportsService.getTenantSummaryByCurrency(
        resolveTenantId(request),
      ),
      message: 'Tenant summary grouped by currency retrieved successfully',
    };
  }
}
