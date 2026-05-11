import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { BusinessProfileService } from './business-profile.service';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto';

@Controller('business-profile')
export class BusinessProfileController {
  constructor(
    private readonly businessProfileService: BusinessProfileService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get()
  async findOne(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.businessProfileService.findOne(scope.tenant.id),
      message: 'Business profile retrieved successfully',
    };
  }

  @Post()
  async create(@Req() request: Request, @Body() dto: UpsertBusinessProfileDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.businessProfileService.upsert(
        scope.tenant.id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Business profile saved successfully',
    };
  }

  @Patch()
  async update(@Req() request: Request, @Body() dto: UpsertBusinessProfileDto) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.businessProfileService.upsert(
        scope.tenant.id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Business profile updated successfully',
    };
  }
}
