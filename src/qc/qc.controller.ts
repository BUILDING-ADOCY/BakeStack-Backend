import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { CreateQcCheckDto } from './dto/create-qc-check.dto';
import { QueryQcChecksDto } from './dto/query-qc-checks.dto';
import { QcService } from './qc.service';

@Controller('qc-checks')
export class QcController {
  constructor(
    private readonly qcService: QcService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get()
  async list(@Req() request: Request, @Query() query: QueryQcChecksDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.qcService.list(scope.tenant.id, query),
      message: 'QC checks retrieved successfully',
    };
  }

  @Post()
  async create(@Req() request: Request, @Body() dto: CreateQcCheckDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.qcService.create(
        scope.tenant.id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'QC check recorded successfully',
    };
  }
}
