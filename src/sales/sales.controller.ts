import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { resolveTenantId } from '../common/utils/resolve-tenant-id';
import { BulkCreateSalesEntriesDto } from './dto/bulk-create-sales-entries.dto';
import { CreateSalesEntryDto } from './dto/create-sales-entry.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Post()
  async create(@Req() request: Request, @Body() dto: CreateSalesEntryDto) {
    const identity =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );
    return {
      data: await this.salesService.upsertEntry(
        resolveTenantId(request),
        identity.user.id,
        dto,
      ),
      message: 'Sales entry captured successfully',
    };
  }

  @Post('bulk')
  async bulkCreate(
    @Req() request: Request,
    @Body() dto: BulkCreateSalesEntriesDto,
  ) {
    const identity =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );
    return {
      data: await this.salesService.bulkUpsert(
        resolveTenantId(request),
        identity.user.id,
        dto,
      ),
      message: 'Sales entries captured successfully',
    };
  }

  @Get()
  async list(@Req() request: Request, @Query() query: QuerySalesDto) {
    await this.identityProvisioningService.ensureProvisionedFromRequest(
      request,
    );
    return {
      data: await this.salesService.list(
        resolveTenantId(request, query.tenantId),
        query,
      ),
      message: 'Sales entries retrieved successfully',
    };
  }
}
