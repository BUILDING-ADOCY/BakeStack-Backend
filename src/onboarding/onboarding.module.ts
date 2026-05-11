import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ComplianceProfileController } from './compliance-profile.controller';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SetupController } from './setup.controller';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    OnboardingController,
    ComplianceProfileController,
    SetupController,
  ],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
