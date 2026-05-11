import { Injectable } from '@nestjs/common';
import { Prisma, SetupStepStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpsertBusinessProfileDto } from './dto/upsert-business-profile.dto';

const serializeJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class BusinessProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findOne(tenantId: string) {
    return this.prisma.businessProfile.findUnique({
      where: { tenantId },
    });
  }

  async upsert(
    tenantId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpsertBusinessProfileDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.businessProfile.findUnique({
        where: { tenantId },
      });

      const data: Prisma.BusinessProfileUncheckedUpdateInput = {
        businessName: dto.businessName,
        legalName: dto.legalName,
        brandName: dto.brandName,
        businessType: dto.businessType,
        businessStage: dto.businessStage,
        ownerName: dto.ownerName,
        ownerPhone: dto.ownerPhone,
        ownerEmail: dto.ownerEmail,
        websiteUrl: dto.websiteUrl,
        instagramUrl: dto.instagramUrl,
        description: dto.description,
        logoUrl: dto.logoUrl,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        currency: dto.currency ?? 'INR',
        defaultLanguage: dto.defaultLanguage,
      };
      const createData: Prisma.BusinessProfileUncheckedCreateInput = {
        tenantId,
        businessName: dto.businessName,
        legalName: dto.legalName,
        brandName: dto.brandName,
        businessType: dto.businessType,
        businessStage: dto.businessStage,
        ownerName: dto.ownerName,
        ownerPhone: dto.ownerPhone,
        ownerEmail: dto.ownerEmail,
        websiteUrl: dto.websiteUrl,
        instagramUrl: dto.instagramUrl,
        description: dto.description,
        logoUrl: dto.logoUrl,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        currency: dto.currency ?? 'INR',
        defaultLanguage: dto.defaultLanguage,
      };

      const profile = existing
        ? await tx.businessProfile.update({
            where: { tenantId },
            data,
          })
        : await tx.businessProfile.create({
            data: createData,
          });

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: profile.businessName,
          legalName: profile.legalName,
          timezone: profile.timezone,
          currency: profile.currency,
        },
      });

      await tx.onboardingProgress.updateMany({
        where: {
          tenantId,
          userId: actorId,
        },
        data: {
          businessProfileStatus: SetupStepStatus.COMPLETED,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: existing
            ? 'BUSINESS_PROFILE_UPDATED'
            : 'BUSINESS_PROFILE_CREATED',
          entityType: 'BusinessProfile',
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
}
