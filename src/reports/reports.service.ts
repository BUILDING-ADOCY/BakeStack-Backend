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

  /**
   * Per-SKU reconciliation for one business date: produced (production output)
   * vs sold (sales entries) vs wasted (finished-good waste), with revenue, COGS
   * and profit (all money in minor units) so the dashboard can rank the most
   * profitable products by (sell − unit cost) × units sold.
   */
  async reconcileByDate(
    tenantId: string,
    locationId: string,
    businessDate: string,
  ) {
    const { start, end } = this.dayRange(businessDate);
    const [salesEntries, outputs, wasteEvents, variants, currencyCode] =
      await Promise.all([
        this.prisma.salesEntry.findMany({
          where: { tenantId, locationId, businessDate: { gte: start, lt: end } },
        }),
        this.prisma.productionOutput.findMany({
          where: {
            tenantId,
            createdAt: { gte: start, lt: end },
            productionBatch: { locationId },
          },
          include: {
            productionBatch: {
              select: { recipe: { select: { productVariantId: true } } },
            },
          },
        }),
        this.prisma.wasteEvent.findMany({
          where: {
            tenantId,
            locationId,
            createdAt: { gte: start, lt: end },
            voidedAt: null,
          },
        }),
        this.prisma.productVariant.findMany({
          where: { tenantId, deletedAt: null },
          include: { product: { select: { name: true } } },
        }),
        requireLocationCurrency(this.prisma, { tenantId, locationId }),
      ]);

    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const variantByFinishedGood = new Map(
      variants
        .filter((variant) => variant.inventoryItemId)
        .map((variant) => [variant.inventoryItemId as string, variant]),
    );

    interface Tally {
      producedUnits: Prisma.Decimal;
      soldUnits: Prisma.Decimal;
      wastedUnits: Prisma.Decimal;
      revenue: number;
    }
    const tallies = new Map<string, Tally>();
    const ensure = (variantId: string): Tally => {
      let tally = tallies.get(variantId);
      if (!tally) {
        tally = {
          producedUnits: decimal(0),
          soldUnits: decimal(0),
          wastedUnits: decimal(0),
          revenue: 0,
        };
        tallies.set(variantId, tally);
      }
      return tally;
    };

    for (const sale of salesEntries) {
      const tally = ensure(sale.productVariantId);
      tally.soldUnits = tally.soldUnits.add(sale.units);
      tally.revenue += sale.lineRevenue;
    }
    for (const output of outputs) {
      const variantId = output.productionBatch?.recipe?.productVariantId;
      if (variantId) {
        const tally = ensure(variantId);
        tally.producedUnits = tally.producedUnits.add(output.outputQty);
      }
    }
    for (const waste of wasteEvents) {
      const variant = variantByFinishedGood.get(waste.inventoryItemId);
      if (variant) {
        const tally = ensure(variant.id);
        tally.wastedUnits = tally.wastedUnits.add(waste.quantity);
      }
    }

    const activeRecipes = await this.prisma.recipe.findMany({
      where: {
        tenantId,
        productVariantId: { in: [...tallies.keys()] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, productVariantId: true },
    });
    const recipeByVariant = new Map(
      activeRecipes.map((recipe) => [recipe.productVariantId, recipe.id]),
    );

    const skus = [];
    for (const [variantId, tally] of tallies) {
      const variant = variantById.get(variantId);
      const recipeId = recipeByVariant.get(variantId);
      let unitCost: number | null = null;
      let cogs: number | null = null;
      let costIncomplete = true;
      if (recipeId) {
        const costing = await this.recipesService.calculateRecipeCost(
          tenantId,
          recipeId,
          locationId,
        );
        costIncomplete = costing.costIncomplete;
        unitCost = majorToMinor(costing.costPerYieldUnit);
        cogs = rateTimesQtyToMinor(costing.costPerYieldUnit, tally.soldUnits);
      }
      skus.push({
        productVariantId: variantId,
        sku: variant?.sku ?? null,
        productName: variant?.product?.name ?? null,
        variantName: variant?.name ?? null,
        producedUnits: tally.producedUnits.toNumber(),
        soldUnits: tally.soldUnits.toNumber(),
        wastedUnits: tally.wastedUnits.toNumber(),
        revenue: tally.revenue,
        unitCost,
        cogs,
        profit: cogs === null ? null : tally.revenue - cogs,
        costIncomplete,
      });
    }

    skus.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));

    return {
      tenantId,
      locationId,
      businessDate: start,
      currencyCode,
      skus,
      totals: {
        producedUnits: skus.reduce((sum, sku) => sum + sku.producedUnits, 0),
        soldUnits: skus.reduce((sum, sku) => sum + sku.soldUnits, 0),
        wastedUnits: skus.reduce((sum, sku) => sum + sku.wastedUnits, 0),
        revenue: sumMinor(skus.map((sku) => sku.revenue)),
        cogs: sumMinor(skus.map((sku) => sku.cogs ?? 0)),
        profit: sumMinor(skus.map((sku) => sku.profit ?? 0)),
      },
    };
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
