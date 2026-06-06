import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { requireLocationCurrency } from '../common/prisma/location-money';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import {
  majorToMinor,
  rateTimesQtyToMinor,
  sumMinor,
} from '../common/utils/money.util';
import { RecipesService } from '../recipes/recipes.service';
import { CloseDailyCloseDto } from './dto/close-daily-close.dto';
import { CreateDailyClosePreviewDto } from './dto/create-daily-close-preview.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly recipesService: RecipesService,
  ) {}

  async generateDailyClosePreview(dto: CreateDailyClosePreviewDto) {
    const { start, end } = this.dayRange(dto.businessDate);
    const [salesEntries, wasteEvents, currencyCode] = await Promise.all([
      this.prisma.salesEntry.findMany({
        where: {
          tenantId: dto.tenantId,
          locationId: dto.locationId,
          businessDate: { gte: start, lt: end },
        },
      }),
      this.prisma.wasteEvent.findMany({
        where: {
          tenantId: dto.tenantId,
          locationId: dto.locationId,
          createdAt: { gte: start, lt: end },
        },
      }),
      requireLocationCurrency(this.prisma, dto),
    ]);

    // Revenue is the sum of captured per-SKU sales; the manual salesTotal is a
    // fallback only for stores that have not captured per-SKU sales yet.
    const salesTotal =
      salesEntries.length > 0
        ? sumMinor(salesEntries.map((entry) => entry.lineRevenue))
        : majorToMinor(dto.salesTotal ?? 0);
    // COGS = units sold × the SKU's active-recipe unit cost (location-aware).
    const cogsTotal = await this.computeSoldCogs(
      dto.tenantId,
      dto.locationId,
      salesEntries,
    );
    const wasteTotal = sumMinor(wasteEvents.map((event) => event.costImpact));
    const labourCost = majorToMinor(dto.labourCost ?? 0);
    const grossProfit = salesTotal - cogsTotal - wasteTotal;
    const netEstimate = grossProfit - labourCost;

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
      currencyCode,
    };
  }

  /** COGS for the day = Σ (units sold × active-recipe cost per yield unit). */
  private async computeSoldCogs(
    tenantId: string,
    locationId: string,
    salesEntries: Array<{ productVariantId: string; units: Prisma.Decimal }>,
  ): Promise<number> {
    if (!salesEntries.length) {
      return 0;
    }

    const unitsByVariant = new Map<string, Prisma.Decimal>();
    for (const entry of salesEntries) {
      unitsByVariant.set(
        entry.productVariantId,
        (unitsByVariant.get(entry.productVariantId) ?? decimal(0)).add(
          entry.units,
        ),
      );
    }

    const recipes = await this.prisma.recipe.findMany({
      where: {
        tenantId,
        productVariantId: { in: [...unitsByVariant.keys()] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, productVariantId: true },
    });
    const recipeByVariant = new Map(
      recipes.map((recipe) => [recipe.productVariantId, recipe.id]),
    );

    let cogs = 0;
    for (const [productVariantId, units] of unitsByVariant) {
      const recipeId = recipeByVariant.get(productVariantId);
      if (!recipeId) {
        // No active recipe → unit cost unknown; excluded rather than guessed.
        continue;
      }
      const costing = await this.recipesService.calculateRecipeCost(
        tenantId,
        recipeId,
        locationId,
      );
      cogs += rateTimesQtyToMinor(costing.costPerYieldUnit, units);
    }

    return cogs;
  }

  async getTenantSummaryByCurrency(tenantId: string) {
    const buckets = await this.prisma.dailyClose.groupBy({
      by: ['currencyCode'],
      where: { tenantId, status: 'CLOSED' },
      _sum: {
        salesTotal: true,
        cogsTotal: true,
        wasteTotal: true,
        grossProfit: true,
        labourCost: true,
        netEstimate: true,
      },
      _count: { _all: true },
    });

    return buckets.map((bucket) => ({
      currencyCode: bucket.currencyCode ?? 'UNSPECIFIED',
      closedDays: bucket._count._all,
      ...bucket._sum,
    }));
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
