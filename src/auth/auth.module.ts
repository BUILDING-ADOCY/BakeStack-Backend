import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityProvisioningService } from './identity-provisioning.service';
import { MeController } from './me.controller';
import { SecurityAuthClient } from './security-auth.client';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, SecurityAuthClient, IdentityProvisioningService],
  exports: [AuthService, SecurityAuthClient, IdentityProvisioningService],
})
export class AuthModule {}
