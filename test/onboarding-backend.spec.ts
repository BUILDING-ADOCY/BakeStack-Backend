import { SetupStepStatus, TenantStatus, UserStatus } from '@prisma/client';
import type { Request } from 'express';

import { IdentityProvisioningService } from '../src/auth/identity-provisioning.service';
import { AuditController } from '../src/audit/audit.controller';
import { BusinessProfileController } from '../src/business-profile/business-profile.controller';
import { BusinessProfileService } from '../src/business-profile/business-profile.service';
import { LocationsController } from '../src/locations/locations.controller';
import { LocationsService } from '../src/locations/locations.service';
import { OnboardingService } from '../src/onboarding/onboarding.service';

describe('Onboarding backend foundation', () => {
  test('register provisioning creates tenant and onboarding progress', async () => {
    const createdTenant = {
      id: 'tenant-1',
      name: 'New Bakery',
      legalName: 'New Bakery',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      status: TenantStatus.ACTIVE,
    };
    const createdUser = {
      id: 'user-1',
      tenantId: createdTenant.id,
      securityUserId: 'identity-user-1',
      email: 'owner@example.com',
      displayName: 'Owner Example',
      phone: null,
      status: UserStatus.ACTIVE,
    };
    const createdProgress = {
      id: 'progress-1',
      tenantId: createdTenant.id,
      userId: createdUser.id,
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
    };

    const tx = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdTenant),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdUser),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'role-1',
          tenantId: createdTenant.id,
          name: 'Owner',
        }),
      },
      userRoleAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
      },
      onboardingProgress: {
        upsert: jest.fn().mockResolvedValue(createdProgress),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (executor: typeof tx) => unknown) => callback(tx),
      ),
    } as any;

    const service = new IdentityProvisioningService(prisma);
    const result = await service.ensureProvisionedIdentity({
      valid: true,
      session: {
        id: 'session-1',
        expiresAt: new Date().toISOString(),
        restricted: false,
        lastSeenAt: new Date().toISOString(),
      },
      user: {
        id: 'identity-user-1',
        email: 'owner@example.com',
        firstName: 'Owner',
        lastName: 'Example',
        phoneNumber: null,
        emailVerifiedAt: new Date().toISOString(),
        phoneVerifiedAt: null,
        status: 'ACTIVE',
      },
      organization: {
        id: 'org-1',
        name: 'New Bakery',
        slug: 'new-bakery',
        status: 'ACTIVE',
        primaryEmail: 'owner@example.com',
        primaryPhone: null,
        acceptedTermsAt: null,
      },
      roles: ['merchant_owner'],
      memberships: [],
    });

    expect(result.tenant.id).toBe(createdTenant.id);
    expect(result.onboardingProgress.id).toBe(createdProgress.id);
    expect(tx.tenant.create).toHaveBeenCalled();
    expect(tx.onboardingProgress.upsert).toHaveBeenCalled();
  });

  test('business profile controller is tenant scoped', async () => {
    const identityProvisioningService = {
      ensureProvisionedFromRequest: jest.fn().mockResolvedValue({
        tenant: { id: 'tenant-a' },
        user: { id: 'user-a' },
      }),
    } as any;
    const businessProfileService = {
      findOne: jest.fn().mockResolvedValue({ id: 'profile-1' }),
    } as unknown as BusinessProfileService;

    const controller = new BusinessProfileController(
      businessProfileService,
      identityProvisioningService,
    );

    await controller.findOne({} as Request);

    expect(businessProfileService.findOne).toHaveBeenCalledWith('tenant-a');
  });

  test('location creation controller ignores client tenant scope and uses session tenant', async () => {
    const identityProvisioningService = {
      ensureProvisionedFromRequest: jest.fn().mockResolvedValue({
        tenant: { id: 'tenant-a' },
        user: { id: 'user-a' },
      }),
    } as any;
    const locationsService = {
      create: jest.fn().mockResolvedValue({ id: 'location-1' }),
    } as unknown as LocationsService;

    const controller = new LocationsController(
      locationsService,
      identityProvisioningService,
    );

    await controller.create(
      { context: { correlationId: 'corr-1' } } as Request,
      {
        tenantId: 'tenant-b',
        name: 'Front Cafe',
        type: 'CAFE' as any,
        city: 'Bengaluru',
        state: 'Karnataka',
      } as any,
    );

    expect(locationsService.create).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      'corr-1',
      expect.objectContaining({
        tenantId: 'tenant-b',
      }),
    );
  });

  test('location profile update is rejected when the location is outside the tenant', async () => {
    const prisma = {
      location: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const auditService = { log: jest.fn() } as any;
    const service = new LocationsService(prisma, auditService);

    await expect(
      service.upsertProfile('tenant-a', 'location-b', 'user-a', 'corr-1', {}),
    ).rejects.toMatchObject({
      code: 'LOCATION_NOT_FOUND',
    });
  });

  test('onboarding cannot complete without business profile', async () => {
    const tx = {
      businessProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (executor: typeof tx) => unknown) => callback(tx),
      ),
    } as any;
    const service = new OnboardingService(prisma, { log: jest.fn() } as any);

    await expect(
      service.completeOnboarding('tenant-a', 'user-a', 'corr-1'),
    ).rejects.toMatchObject({
      code: 'BUSINESS_PROFILE_REQUIRED',
    });
  });

  test('onboarding cannot complete without an active primary location', async () => {
    const tx = {
      businessProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'bp-1' }),
      },
      location: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (executor: typeof tx) => unknown) => callback(tx),
      ),
    } as any;
    const service = new OnboardingService(prisma, { log: jest.fn() } as any);

    await expect(
      service.completeOnboarding('tenant-a', 'user-a', 'corr-1'),
    ).rejects.toMatchObject({
      code: 'PRIMARY_LOCATION_REQUIRED',
    });
  });

  test('onboarding can complete when compliance is skipped', async () => {
    const before = {
      id: 'progress-1',
      tenantId: 'tenant-a',
      userId: 'user-a',
      businessProfileStatus: SetupStepStatus.COMPLETED,
      locationSetupStatus: SetupStepStatus.COMPLETED,
      cafeProfileStatus: SetupStepStatus.COMPLETED,
      complianceStatus: SetupStepStatus.NOT_STARTED,
      productSetupStatus: SetupStepStatus.NOT_STARTED,
      inventorySetupStatus: SetupStepStatus.NOT_STARTED,
      recipeSetupStatus: SetupStepStatus.NOT_STARTED,
      supplierSetupStatus: SetupStepStatus.NOT_STARTED,
      productionSetupStatus: SetupStepStatus.NOT_STARTED,
      isCompleted: false,
      completedAt: null,
    };

    const tx = {
      businessProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'bp-1' }),
      },
      location: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'location-1',
          tenantId: 'tenant-a',
          isPrimary: true,
          isActive: true,
        }),
      },
      locationProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lp-1',
          locationId: 'location-1',
        }),
      },
      onboardingProgress: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(before),
        update: jest.fn().mockResolvedValue({
          ...before,
          complianceStatus: SetupStepStatus.SKIPPED,
          isCompleted: true,
          completedAt: new Date(),
        }),
      },
      complianceProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const prisma = {
      $transaction: jest.fn(
        async (callback: (executor: typeof tx) => unknown) => callback(tx),
      ),
    } as any;
    const service = new OnboardingService(prisma, auditService);

    const result = await service.completeOnboarding(
      'tenant-a',
      'user-a',
      'corr-1',
    );

    expect(result.isCompleted).toBe(true);
    expect(result.complianceStatus).toBe(SetupStepStatus.SKIPPED);
    expect(auditService.log).toHaveBeenCalled();
  });

  test('business profile upsert writes an audit log', async () => {
    const tx = {
      businessProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'profile-1',
          tenantId: 'tenant-a',
          businessName: 'BakeStack Demo Bakery',
          legalName: null,
          brandName: null,
          businessType: 'BAKERY_CAFE',
          businessStage: 'RUNNING',
          ownerName: null,
          ownerPhone: null,
          ownerEmail: null,
          websiteUrl: null,
          instagramUrl: null,
          description: null,
          logoUrl: null,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          defaultLanguage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      tenant: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      onboardingProgress: {
        updateMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (executor: typeof tx) => unknown) => callback(tx),
      ),
    } as any;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new BusinessProfileService(prisma, auditService);

    await service.upsert('tenant-a', 'user-a', 'corr-1', {
      businessName: 'BakeStack Demo Bakery',
      businessType: 'BAKERY_CAFE' as any,
      businessStage: 'RUNNING' as any,
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        actorId: 'user-a',
        action: 'BUSINESS_PROFILE_CREATED',
      }),
      tx,
    );
  });

  test('audit logs controller scopes tenant from session without requiring tenantId query', async () => {
    const identityProvisioningService = {
      ensureProvisionedFromRequest: jest.fn().mockResolvedValue({
        tenant: { id: 'tenant-a' },
      }),
    } as any;
    const auditService = {
      findAll: jest.fn().mockResolvedValue([{ id: 'audit-1' }]),
    } as any;

    const controller = new AuditController(
      auditService,
      identityProvisioningService,
    );

    await controller.findAll({} as Request, {});

    expect(auditService.findAll).toHaveBeenCalledWith('tenant-a', {});
  });
});
