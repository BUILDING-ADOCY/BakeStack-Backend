import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IdentityProvisioningService } from '../auth/identity-provisioning.service';
import { UpdateOnboardingProgressDto } from './dto/update-onboarding-progress.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly identityProvisioningService: IdentityProvisioningService,
  ) {}

  @Get('progress')
  async getProgress(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.onboardingService.getProgress(
        scope.tenant.id,
        scope.user.id,
      ),
      message: 'Onboarding progress retrieved successfully',
    };
  }

  @Patch('progress')
  async updateProgress(
    @Req() request: Request,
    @Body() dto: UpdateOnboardingProgressDto,
  ) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.onboardingService.updateProgress(
        scope.tenant.id,
        scope.user.id,
        dto,
      ),
      message: 'Onboarding progress updated successfully',
    };
  }

  @Post('complete')
  async complete(@Req() request: Request) {
    const scope =
      await this.identityProvisioningService.ensureProvisionedFromRequest(
        request,
      );

    return {
      data: await this.onboardingService.completeOnboarding(
        scope.tenant.id,
        scope.user.id,
        request.context?.correlationId,
      ),
      message: 'Onboarding completed successfully',
    };
  }
}
