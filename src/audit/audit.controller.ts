import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Controller('audit-logs')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get()
  async findAll(@Req() request: Request, @Query() query: QueryAuditLogsDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.auditService.findAll(scope.tenant.id, query),
      message: 'Audit logs retrieved successfully',
    };
  }
}
