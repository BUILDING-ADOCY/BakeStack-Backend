import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedGuard } from './authenticated.guard';
import { IdentityProvisioningService } from './identity-provisioning.service';
import { MeController } from './me.controller';
import { SecurityAuthClient } from './security-auth.client';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    AuthenticatedGuard,
    SecurityAuthClient,
    IdentityProvisioningService,
  ],
  exports: [
    AuthService,
    AuthenticatedGuard,
    SecurityAuthClient,
    IdentityProvisioningService,
  ],
})
export class AuthModule {}
