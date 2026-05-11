import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { CloseDailyCloseDto } from './dto/close-daily-close.dto';
import { CreateDailyClosePreviewDto } from './dto/create-daily-close-preview.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async generateDailyClosePreview(dto: CreateDailyClosePreviewDto) {
    const { start, end } = this.dayRange(dto.businessDate);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });
    const wasteEvents = await this.prisma.wasteEvent.findMany({
      where: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });

    const cogsTotal = movements
      .filter((movement) => movement.movementType === 'PRODUCTION_CONSUMPTION')
      .reduce((sum, movement) => sum.add(movement.totalCost.abs()), decimal(0));
    const wasteTotal = wasteEvents.reduce(
      (sum, event) => sum.add(event.costImpact),
      decimal(0),
    );
    const salesTotal = decimal(dto.salesTotal ?? 2500);
    const labourCost = decimal(dto.labourCost ?? 0);
    const grossProfit = salesTotal.sub(cogsTotal).sub(wasteTotal);
    const netEstimate = grossProfit.sub(labourCost);

    return {
      tenantId: dto.tenantId,
      locationId: dto.locationId,
      businessDate: new Date(dto.businessDate),
      status: 'DRAFT',
      salesTotal,
      cogsTotal,
      wasteTotal,
      grossProfit,
      labourCost,
      netEstimate,
    };
  }

  async findDailyClose(
    tenantId: string,
    locationId: string,
    businessDate: string,
  ) {
    const existing = await this.prisma.dailyClose.findFirst({
      where: {
        tenantId,
        locationId,
        businessDate: new Date(businessDate),
      },
    });

    if (existing) {
      return existing;
    }

    return this.generateDailyClosePreview({
      tenantId,
      locationId,
      businessDate,
    });
  }

  async closeDailyClose(dto: CloseDailyCloseDto) {
    const existing = await this.prisma.dailyClose.findFirst({
      where: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        businessDate: new Date(dto.businessDate),
      },
    });

    if (existing?.status === 'CLOSED') {
      throw new DomainException(
        'DAILY_CLOSE_ALREADY_CLOSED',
        'Daily close cannot be closed twice unless reopened',
        409,
      );
    }

    const preview = await this.generateDailyClosePreview(dto);

    return this.prisma.$transaction(async (tx) => {
      const dailyClose = existing
        ? await tx.dailyClose.update({
            where: { id: existing.id },
            data: {
              ...preview,
              status: 'CLOSED',
              closedById: dto.closedById,
              closedAt: new Date(),
            },
          })
        : await tx.dailyClose.create({
            data: {
              ...preview,
              status: 'CLOSED',
              closedById: dto.closedById,
              closedAt: new Date(),
            },
          });

      await this.auditService.log(
        {
          tenantId: dto.tenantId,
          actorId: dto.closedById,
          action: 'reports.daily_close_closed',
          entityType: 'DailyClose',
          entityId: dailyClose.id,
          afterJson: dailyClose as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return dailyClose;
    });
  }

  private dayRange(businessDate: string) {
    const start = new Date(businessDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
}
