import { Injectable } from '@nestjs/common';
import { ComplianceStatus, SetupStepStatus, type Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateOnboardingProgressDto } from './dto/update-onboarding-progress.dto';
import { UpsertComplianceProfileDto } from './dto/upsert-compliance-profile.dto';

const serializeJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getProgress(tenantId: string, userId: string) {
    return this.prisma.onboardingProgress.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
    });
  }

  async updateProgress(
    tenantId: string,
    userId: string,
    dto: UpdateOnboardingProgressDto,
  ) {
    return this.prisma.onboardingProgress.update({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      data: dto,
    });
  }

  async completeOnboarding(
    tenantId: string,
    userId: string,
    correlationId: string | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.businessProfile.findUnique({
        where: { tenantId },
      });

      if (!profile) {
        throw new DomainException(
          'BUSINESS_PROFILE_REQUIRED',
          'Business profile must be completed before onboarding can finish.',
          400,
        );
      }

      const primaryLocation = await tx.location.findFirst({
        where: {
          tenantId,
          isPrimary: true,
          isActive: true,
        },
      });

      if (!primaryLocation) {
        throw new DomainException(
          'PRIMARY_LOCATION_REQUIRED',
          'At least one active primary location is required before onboarding can finish.',
          400,
        );
      }

      const locationProfile = await tx.locationProfile.findFirst({
        where: {
          tenantId,
          locationId: primaryLocation.id,
        },
      });

      if (!locationProfile) {
        throw new DomainException(
          'LOCATION_PROFILE_REQUIRED',
          'The primary location needs a cafe or bakery operating profile before onboarding can finish.',
          400,
        );
      }

      const progress = await tx.onboardingProgress.findUniqueOrThrow({
        where: {
          tenantId_userId: {
            tenantId,
            userId,
          },
        },
      });

      const complianceProfile = await tx.complianceProfile.findFirst({
        where: {
          tenantId,
          locationId: null,
        },
      });

      const completed = await tx.onboardingProgress.update({
        where: {
          tenantId_userId: {
            tenantId,
            userId,
          },
        },
        data: {
          businessProfileStatus: SetupStepStatus.COMPLETED,
          locationSetupStatus: SetupStepStatus.COMPLETED,
          cafeProfileStatus: SetupStepStatus.COMPLETED,
          complianceStatus: complianceProfile
            ? progress.complianceStatus === SetupStepStatus.NOT_STARTED
              ? SetupStepStatus.COMPLETED
              : progress.complianceStatus
            : progress.complianceStatus === SetupStepStatus.COMPLETED
              ? SetupStepStatus.COMPLETED
              : SetupStepStatus.SKIPPED,
          isCompleted: true,
          completedAt: new Date(),
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId: userId,
          action: 'ONBOARDING_COMPLETED',
          entityType: 'OnboardingProgress',
          entityId: completed.id,
          beforeJson: serializeJson(progress),
          afterJson: serializeJson(completed),
          correlationId,
        },
        tx,
      );

      return completed;
    });
  }

  getComplianceProfile(tenantId: string) {
    return this.prisma.complianceProfile.findFirst({
      where: {
        tenantId,
        locationId: null,
      },
    });
  }

  async upsertComplianceProfile(
    tenantId: string,
    userId: string,
    correlationId: string | undefined,
    dto: UpsertComplianceProfileDto,
  ) {
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: {
          tenantId,
          id: dto.locationId,
        },
      });

      if (!location) {
        throw new DomainException(
          'LOCATION_ACCESS_DENIED',
          'The selected location does not belong to the current tenant.',
          403,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.complianceProfile.findFirst({
        where: {
          tenantId,
          locationId: dto.locationId ?? null,
        },
      });

      const hasProvidedValues = Boolean(
        dto.gstin ||
        dto.fssaiLicenseNumber ||
        dto.panNumber ||
        dto.businessRegistrationNumber,
      );
      const status = dto.status
        ? dto.status
        : hasProvidedValues
          ? ComplianceStatus.PENDING
          : ComplianceStatus.NOT_PROVIDED;
      const stepStatus = hasProvidedValues
        ? SetupStepStatus.COMPLETED
        : SetupStepStatus.SKIPPED;

      const data = {
        locationId: dto.locationId ?? null,
        gstin: dto.gstin,
        fssaiLicenseNumber: dto.fssaiLicenseNumber,
        fssaiExpiryDate: dto.fssaiExpiryDate
          ? new Date(dto.fssaiExpiryDate)
          : undefined,
        panNumber: dto.panNumber,
        businessRegistrationNumber: dto.businessRegistrationNumber,
        status,
        notes: dto.notes,
      };

      const profile = existing
        ? await tx.complianceProfile.update({
            where: { id: existing.id },
            data,
          })
        : await tx.complianceProfile.create({
            data: {
              tenantId,
              ...data,
            },
          });

      await tx.onboardingProgress.updateMany({
        where: {
          tenantId,
          userId,
        },
        data: {
          complianceStatus: stepStatus,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId: userId,
          action: existing
            ? 'COMPLIANCE_PROFILE_UPDATED'
            : 'COMPLIANCE_PROFILE_CREATED',
          entityType: 'ComplianceProfile',
          entityId: profile.id,
          beforeJson: existing ? serializeJson(existing) : undefined,
          afterJson: serializeJson(profile),
          correlationId,
        },
        tx,
      );

      return profile;
    });
  }

  async getSetupSummary(tenantId: string, userId: string) {
    const [
      tenant,
      businessProfile,
      locations,
      onboardingProgress,
      complianceProfile,
      productCount,
      inventoryCount,
      recipeCount,
      supplierCount,
      productionPlanCount,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
      }),
      this.prisma.businessProfile.findUnique({
        where: { tenantId },
      }),
      this.prisma.location.findMany({
        where: { tenantId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.onboardingProgress.findUnique({
        where: {
          tenantId_userId: {
            tenantId,
            userId,
          },
        },
      }),
      this.prisma.complianceProfile.findFirst({
        where: {
          tenantId,
          locationId: null,
        },
      }),
      this.prisma.product.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      }),
      this.prisma.inventoryItem.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      }),
      this.prisma.recipe.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      }),
      this.prisma.supplier.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      }),
      this.prisma.productionPlan.count({
        where: { tenantId },
      }),
    ]);

    const primaryLocation =
      locations.find((location) => location.isPrimary) ?? null;
    const locationProfile = primaryLocation
      ? await this.prisma.locationProfile.findFirst({
          where: {
            tenantId,
            locationId: primaryLocation.id,
          },
        })
      : null;
    const openingHours = primaryLocation
      ? await this.prisma.openingHour.findMany({
          where: {
            tenantId,
            locationId: primaryLocation.id,
          },
          orderBy: { dayOfWeek: 'asc' },
        })
      : [];

    const reminders: Array<{ code: string; message: string; path: string }> =
      [];
    if (!productCount) {
      reminders.push({
        code: 'PRODUCTS_REQUIRED',
        message: 'Add products to start planning margin and production.',
        path: '/admin/products',
      });
    }
    if (!inventoryCount) {
      reminders.push({
        code: 'INVENTORY_REQUIRED',
        message: 'Add raw materials and packaging to enable stock tracking.',
        path: '/admin/inventory',
      });
    }
    if (!recipeCount) {
      reminders.push({
        code: 'RECIPES_REQUIRED',
        message:
          'Create recipes so costing and production output can be calculated.',
        path: '/admin/recipes',
      });
    }
    if (!supplierCount) {
      reminders.push({
        code: 'SUPPLIERS_REQUIRED',
        message:
          'Add suppliers before procurement and receiving flows can start.',
        path: '/admin/suppliers',
      });
    }
    if (!productionPlanCount) {
      reminders.push({
        code: 'PRODUCTION_PLAN_REQUIRED',
        message:
          'Generate your first production plan to start execution tracking.',
        path: '/admin/production',
      });
    }
    if (
      !complianceProfile ||
      complianceProfile.status === ComplianceStatus.NOT_PROVIDED ||
      onboardingProgress?.complianceStatus === SetupStepStatus.SKIPPED
    ) {
      reminders.push({
        code: 'COMPLIANCE_INFO_MISSING',
        message:
          'Add GST, FSSAI, or registration details when they become available.',
        path: '/admin/settings/compliance',
      });
    }

    return {
      tenant,
      businessProfile,
      primaryLocation,
      locationProfile,
      openingHours,
      complianceProfile,
      onboardingProgress,
      counts: {
        productCount,
        inventoryCount,
        recipeCount,
        supplierCount,
        productionPlanCount,
      },
      reminders,
    };
  }
}
