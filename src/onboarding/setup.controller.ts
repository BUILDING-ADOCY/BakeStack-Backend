import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { OnboardingService } from './onboarding.service';

@Controller('setup')
export class SetupController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get('summary')
  async getSummary(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.onboardingService.getSetupSummary(
        scope.tenant.id,
        scope.user.id,
      ),
      message: 'Setup summary retrieved successfully',
    };
  }
}
