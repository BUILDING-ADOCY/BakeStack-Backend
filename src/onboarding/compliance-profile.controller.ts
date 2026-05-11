import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { UpsertComplianceProfileDto } from './dto/upsert-compliance-profile.dto';
import { OnboardingService } from './onboarding.service';

@Controller('compliance-profile')
export class ComplianceProfileController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get()
  async getProfile(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.onboardingService.getComplianceProfile(scope.tenant.id),
      message: 'Compliance profile retrieved successfully',
    };
  }

  @Post()
  async createProfile(
    @Req() request: Request,
    @Body() dto: UpsertComplianceProfileDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.onboardingService.upsertComplianceProfile(
        scope.tenant.id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Compliance profile saved successfully',
    };
  }

  @Patch()
  async updateProfile(
    @Req() request: Request,
    @Body() dto: UpsertComplianceProfileDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.onboardingService.upsertComplianceProfile(
        scope.tenant.id,
        scope.user.id,
        request.context?.correlationId,
        dto,
      ),
      message: 'Compliance profile updated successfully',
    };
  }
}
