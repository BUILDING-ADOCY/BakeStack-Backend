import { Injectable } from '@nestjs/common';
import {
  SetupStepStatus,
  TenantStatus,
  UserStatus,
  type OnboardingProgress,
  type Tenant,
  type User,
} from '@prisma/client';
import type { Request } from 'express';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import type { SecuritySessionValidationResponse } from './auth.types';

export type ProvisionedIdentity = {
  tenant: Tenant;
  user: User;
  onboardingProgress: OnboardingProgress;
};

@Injectable()
export class IdentityProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureProvisionedFromRequest(
    request: Request,
  ): Promise<ProvisionedIdentity> {
    if (request.provisionedIdentity) {
      return request.provisionedIdentity;
    }

    const identity = request.identity;

    if (!identity?.valid || !identity.user || !identity.organization) {
      throw new DomainException(
        'AUTHENTICATION_REQUIRED',
        'An authenticated session is required.',
        401,
      );
    }

    const provisioned = await this.ensureProvisionedIdentity(identity);
    request.provisionedIdentity = provisioned;
    return provisioned;
  }

  async ensureProvisionedIdentity(
    identity: SecuritySessionValidationResponse,
  ): Promise<ProvisionedIdentity> {
    if (!identity.valid || !identity.user || !identity.organization) {
      throw new DomainException(
        'AUTHENTICATION_REQUIRED',
        'An authenticated session is required.',
        401,
      );
    }

    const identityUser = identity.user;
    const identityOrganization = identity.organization;

    return this.prisma.$transaction(async (tx) => {
      const tenant =
        (await tx.tenant.findUnique({
          where: {
            securityOrganizationId: identityOrganization.id,
          },
        })) ??
        (await tx.tenant.create({
          data: {
            name: identityOrganization.name,
            legalName: identityOrganization.name,
            securityOrganizationId: identityOrganization.id,
            timezone: 'Asia/Kolkata',
            currency: 'INR',
            status: TenantStatus.ACTIVE,
          },
        }));

      const displayName = this.buildDisplayName(identity);

      const user =
        (await tx.user.findFirst({
          where: {
            tenantId: tenant.id,
            OR: [
              { securityUserId: identityUser.id },
              { email: identityUser.email },
            ],
          },
        })) ??
        (await tx.user.create({
          data: {
            tenantId: tenant.id,
            securityUserId: identityUser.id,
            email: identityUser.email,
            displayName,
            phone: identityUser.phoneNumber ?? undefined,
            status: UserStatus.ACTIVE,
          },
        }));

      const syncedUser =
        user.securityUserId === identityUser.id &&
        user.email === identityUser.email &&
        user.displayName === displayName &&
        user.phone === (identityUser.phoneNumber ?? null) &&
        user.status === UserStatus.ACTIVE
          ? user
          : await tx.user.update({
              where: { id: user.id },
              data: {
                securityUserId: identityUser.id,
                email: identityUser.email,
                displayName,
                phone: identityUser.phoneNumber ?? undefined,
                status: UserStatus.ACTIVE,
              },
            });

      const ownerRole =
        (await tx.role.findFirst({
          where: {
            tenantId: tenant.id,
            name: 'Owner',
          },
        })) ??
        (await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: 'Owner',
            description:
              'Default owner role provisioned from authenticated setup.',
            policyJson: { permissions: ['*'] },
          },
        }));

      const existingAssignment = await tx.userRoleAssignment.findFirst({
        where: {
          tenantId: tenant.id,
          userId: syncedUser.id,
          roleId: ownerRole.id,
          locationId: null,
        },
      });

      if (!existingAssignment) {
        await tx.userRoleAssignment.create({
          data: {
            tenantId: tenant.id,
            userId: syncedUser.id,
            roleId: ownerRole.id,
            effectiveFrom: new Date(),
          },
        });
      }

      const onboardingProgress = await tx.onboardingProgress.upsert({
        where: {
          tenantId_userId: {
            tenantId: tenant.id,
            userId: syncedUser.id,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          userId: syncedUser.id,
          businessProfileStatus: SetupStepStatus.NOT_STARTED,
          locationSetupStatus: SetupStepStatus.NOT_STARTED,
          cafeProfileStatus: SetupStepStatus.NOT_STARTED,
          complianceStatus: SetupStepStatus.NOT_STARTED,
          productSetupStatus: SetupStepStatus.NOT_STARTED,
          inventorySetupStatus: SetupStepStatus.NOT_STARTED,
          recipeSetupStatus: SetupStepStatus.NOT_STARTED,
          supplierSetupStatus: SetupStepStatus.NOT_STARTED,
          productionSetupStatus: SetupStepStatus.NOT_STARTED,
          isCompleted: false,
        },
      });

      return {
        tenant,
        user: syncedUser,
        onboardingProgress,
      };
    });
  }

  private buildDisplayName(identity: SecuritySessionValidationResponse) {
    const firstName = identity.user?.firstName?.trim();
    const lastName = identity.user?.lastName?.trim();

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) {
      return fullName;
    }

    return identity.user?.email.split('@')[0] ?? 'BakeStack Owner';
  }
}
