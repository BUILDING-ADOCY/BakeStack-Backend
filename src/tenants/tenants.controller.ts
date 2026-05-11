import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get()
  async findAll(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.tenantsService.findAll(scope.tenant.id),
      message: 'Tenants retrieved successfully',
    };
  }

  @Post()
  async create(@Req() request: Request, @Body() dto: CreateTenantDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.tenantsService.create(scope.tenant.id, dto),
      message: 'Tenant created successfully',
    };
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.tenantsService.findOne(scope.tenant.id, id),
      message: 'Tenant retrieved successfully',
    };
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.tenantsService.update(scope.tenant.id, id, dto),
      message: 'Tenant updated successfully',
    };
  }
}
