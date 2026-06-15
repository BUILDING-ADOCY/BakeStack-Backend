import { Injectable, Logger } from '@nestjs/common';
import { InventoryMovementType, Prisma, WasteReasonCode } from '@prisma/client';
import { createHash } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import * as inventoryLedger from '../common/prisma/inventory-ledger';
import { requireInventoryItemMoneySettings } from '../common/prisma/location-money';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { minorToMajor, rateTimesQtyToMinor } from '../common/utils/money.util';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { BulkCreateWasteEventsDto } from './dto/bulk-create-waste-events.dto';
import { CreateWasteEventDto } from './dto/create-waste-event.dto';
import {
  QueryWastageDto,
  WastageInsightsDto,
  WastageLeaderboardDto,
  WastageRangeDto,
  WastageTrendDto,
} from './dto/query-wastage.dto';
import { VoidWasteEventDto } from './dto/void-waste-event.dto';
import type { WastageInsight } from './wastage.types';

type WastageExecutor = Prisma.TransactionClient | PrismaService;

const wasteInclude = {
  inventoryItem: true,
  location: true,
  lot: true,
  productionBatch: true,
  recordedBy: true,
  voidedBy: true,
} satisfies Prisma.WasteEventInclude;

@Injectable()
export class WastageService {
  private readonly logger = new Logger(WastageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async recordWasteEvent(
    tenantId: string,
    actorId: string | null,
    dto: CreateWasteEventDto,
  ) {
    try {
      if (dto.idempotencyKey) {
        const existing = await this.idempotencyService.findExisting(
          tenantId,
          '/wastage',
          'POST',
          dto.idempotencyKey,
        );

        if (existing?.responseHash) {
          return this.getById(tenantId, existing.responseHash);
        }
      }

      const result = await this.prisma.$transaction(async (tx) => {
        if (dto.idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              tenantId,
              key: dto.idempotencyKey,
              route: '/wastage',
              method: 'POST',
              requestHash: this.hashPayload(dto),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }

        const event = await this.recordWasteEventInTransaction(
          tx,
          tenantId,
          actorId,
          dto,
        );

        if (dto.idempotencyKey) {
          await tx.idempotencyKey.update({
            where: {
              tenantId_key_route_method: {
                tenantId,
                key: dto.idempotencyKey,
                route: '/wastage',
                method: 'POST',
              },
            },
            data: {
              responseHash: event.id,
              statusCode: 201,
            },
          });
        }

        return event;
      });

      this.logger.log(
        `Recorded waste event ${result.id} for tenant ${tenantId}`,
      );
      return result;
    } catch (error) {
      if (error instanceof DomainException) {
        this.logger.warn(
          `Rejected waste event for tenant ${tenantId}: ${error.code}`,
        );
      } else if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.idempotencyKey
      ) {
        const existing = await this.idempotencyService.findExisting(
          tenantId,
          '/wastage',
          'POST',
          dto.idempotencyKey,
        );

        if (existing?.responseHash) {
          return this.getById(tenantId, existing.responseHash);
        }
      } else {
        this.logger.error(
          `Failed to record waste event for tenant ${tenantId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }

      throw error;
    }
  }

  async bulkRecordWasteEvents(
    tenantId: string,
    actorId: string | null,
    dto: BulkCreateWasteEventsDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const created = [];

      for (const event of dto.events) {
        created.push(
          await this.recordWasteEventInTransaction(
            tx,
            tenantId,
            actorId,
            event,
          ),
        );
      }

      this.logger.log(
        `Recorded ${created.length} bulk waste events for tenant ${tenantId}`,
      );
      return { created };
    });
  }

  async voidWasteEvent(
    tenantId: string,
    actorId: string | null,
    id: string,
    dto: VoidWasteEventDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.wasteEvent.findFirst({
        where: { tenantId, id },
      });

      if (!event) {
        throw new DomainException(
          'WASTAGE_NOT_FOUND',
          'Waste event not found',
          404,
        );
      }

      if (event.voidedAt) {
        throw new DomainException(
          'WASTAGE_ALREADY_VOIDED',
          'Waste event has already been voided',
          409,
        );
      }

      const unitCost = event.quantity.greaterThan(0)
        ? decimal(minorToMajor(event.costImpact)).div(event.quantity)
        : decimal(0);

      await inventoryLedger.applyInventoryDelta(tx, {
        tenantId,
        locationId: event.locationId,
        inventoryItemId: event.inventoryItemId,
        lotId: event.lotId,
        quantityDelta: event.quantity,
        unitCost,
        movementType: InventoryMovementType.WASTAGE,
        referenceType: 'WasteEventVoid',
        referenceId: event.id,
        reason: dto.reason,
        createdById: actorId,
      });

      const updated = await tx.wasteEvent.update({
        where: { id: event.id },
        data: {
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: dto.reason,
        },
        include: wasteInclude,
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'wastage.voided',
          entityType: 'WasteEvent',
          entityId: event.id,
          beforeJson: event as unknown as Prisma.InputJsonValue,
          afterJson: updated as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      this.logger.log(`Voided waste event ${event.id} for tenant ${tenantId}`);
      return updated;
    });
  }

  async list(tenantId: string, query: QueryWastageDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const where = this.buildWasteWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.wasteEvent.findMany({
        where,
        include: {
          inventoryItem: true,
          location: true,
          recordedBy: true,
          lot: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wasteEvent.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async getById(tenantId: string, id: string) {
    const event = await this.prisma.wasteEvent.findFirst({
      where: { tenantId, id },
      include: wasteInclude,
    });

    if (!event) {
      throw new DomainException(
        'WASTAGE_NOT_FOUND',
        'Waste event not found',
        404,
      );
    }

    return event;
  }

  async getSummary(tenantId: string, query: WastageRangeDto) {
    const range = this.parseRange(query.from, query.to);
    const priorRange = this.priorRange(range.from, range.to);
    const where = this.activeRangeWhere(tenantId, query.locationId, range);
    const priorWhere = this.activeRangeWhere(
      tenantId,
      query.locationId,
      priorRange,
    );

    const [aggregate, priorAggregate, byReason, topItems] = await Promise.all([
      this.prisma.wasteEvent.aggregate({
        where,
        _sum: { costImpact: true, quantity: true },
        _count: { _all: true },
      }),
      this.prisma.wasteEvent.aggregate({
        where: priorWhere,
        _sum: { costImpact: true },
      }),
      this.prisma.wasteEvent.groupBy({
        by: ['reasonCode'],
        where,
        _sum: { costImpact: true },
        _count: { _all: true },
      }),
      this.topItems(tenantId, where, 5),
    ]);

    const totalCost = decimal(aggregate._sum.costImpact ?? 0);
    const priorCost = decimal(priorAggregate._sum.costImpact ?? 0);

    return {
      totalCost: totalCost.toString(),
      totalQuantity: (aggregate._sum.quantity ?? decimal(0)).toString(),
      eventCount: aggregate._count._all,
      comparisonToPriorPeriod: {
        totalCost: priorCost.toString(),
        percentChange: this.percentChange(totalCost, priorCost),
      },
      byReasonCode: byReason.map((row) => ({
        reasonCode: row.reasonCode,
        totalCost: (row._sum.costImpact ?? decimal(0)).toString(),
        eventCount: row._count._all,
      })),
      topItems,
    };
  }

  async getTrend(tenantId: string, query: WastageTrendDto) {
    const range = this.parseRange(query.from, query.to);
    const bucket = query.bucket ?? 'day';
    const rows = await this.prisma.wasteEvent.findMany({
      where: this.activeRangeWhere(tenantId, query.locationId, range),
      select: {
        createdAt: true,
        costImpact: true,
        quantity: true,
      },
    });
    const buckets = this.buildBuckets(range.from, range.to, bucket);

    for (const row of rows) {
      const key = this.bucketKey(row.createdAt, bucket);
      const target = buckets.get(key);
      if (!target) continue;
      target.totalCost = target.totalCost.add(row.costImpact);
      target.totalQuantity = target.totalQuantity.add(row.quantity);
      target.eventCount += 1;
    }

    return Array.from(buckets.values()).map((row) => ({
      date: row.date,
      totalCost: row.totalCost.toString(),
      totalQuantity: row.totalQuantity.toString(),
      eventCount: row.eventCount,
    }));
  }

  async getLeaderboard(tenantId: string, query: WastageLeaderboardDto) {
    const range = this.parseRange(query.from, query.to);
    return this.topItems(
      tenantId,
      this.activeRangeWhere(tenantId, query.locationId, range),
      query.limit ?? 10,
    );
  }

  async getByReason(tenantId: string, query: WastageRangeDto) {
    const range = this.parseRange(query.from, query.to);
    const priorRange = this.priorRange(range.from, range.to);
    const [current, prior] = await Promise.all([
      this.prisma.wasteEvent.groupBy({
        by: ['reasonCode'],
        where: this.activeRangeWhere(tenantId, query.locationId, range),
        _sum: { costImpact: true },
        _count: { _all: true },
      }),
      this.prisma.wasteEvent.groupBy({
        by: ['reasonCode'],
        where: this.activeRangeWhere(tenantId, query.locationId, priorRange),
        _sum: { costImpact: true },
      }),
    ]);
    const currentByReason = new Map(
      current.map((row) => [row.reasonCode, row]),
    );
    const priorByReason = new Map(prior.map((row) => [row.reasonCode, row]));

    return Object.values(WasteReasonCode).map((reasonCode) => {
      const row = currentByReason.get(reasonCode);
      const priorRow = priorByReason.get(reasonCode);
      const totalCost = decimal(row?._sum.costImpact ?? 0);
      const priorCost = decimal(priorRow?._sum.costImpact ?? 0);
      return {
        reasonCode,
        totalCost: totalCost.toString(),
        eventCount: row?._count._all ?? 0,
        percentChangeVsPriorPeriod: this.percentChange(totalCost, priorCost),
      };
    });
  }

  async getBranchComparison(tenantId: string, query: WastageRangeDto) {
    const range = this.parseRange(query.from, query.to);
    const [locations, wasteByLocation, outputByLocation] = await Promise.all([
      this.prisma.location.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.wasteEvent.groupBy({
        by: ['locationId', 'reasonCode'],
        where: this.activeRangeWhere(tenantId, undefined, range),
        _sum: { costImpact: true },
        _count: { _all: true },
      }),
      this.prisma.productionOutput.findMany({
        where: {
          tenantId,
          createdAt: {
            gte: range.from,
            lte: range.to,
          },
        },
        select: {
          totalCost: true,
          productionBatch: {
            select: { locationId: true },
          },
        },
      }),
    ]);
    const wasteTotals = new Map<
      string,
      {
        totalCost: Prisma.Decimal;
        eventCount: number;
        reasons: Map<string, Prisma.Decimal>;
      }
    >();

    for (const row of wasteByLocation) {
      const current = wasteTotals.get(row.locationId) ?? {
        totalCost: decimal(0),
        eventCount: 0,
        reasons: new Map<string, Prisma.Decimal>(),
      };
      const rowCost = row._sum.costImpact ?? decimal(0);
      current.totalCost = current.totalCost.add(rowCost);
      current.eventCount += row._count._all;
      current.reasons.set(
        row.reasonCode,
        (current.reasons.get(row.reasonCode) ?? decimal(0)).add(rowCost),
      );
      wasteTotals.set(row.locationId, current);
    }

    const outputTotals = new Map<string, Prisma.Decimal>();
    for (const output of outputByLocation) {
      const locationId = output.productionBatch.locationId;
      outputTotals.set(
        locationId,
        (outputTotals.get(locationId) ?? decimal(0)).add(output.totalCost),
      );
    }

    return locations.map((location) => {
      const waste = wasteTotals.get(location.id);
      const productionCost = outputTotals.get(location.id) ?? decimal(0);
      const topReason = waste
        ? (Array.from(waste.reasons.entries()).sort((a, b) =>
            b[1].cmp(a[1]),
          )[0]?.[0] ?? null)
        : null;

      return {
        locationId: location.id,
        locationName: location.name,
        totalCost: (waste?.totalCost ?? decimal(0)).toString(),
        wastagePercentOfProduction: productionCost.greaterThan(0)
          ? Number(
              waste?.totalCost.div(productionCost).mul(100).toFixed(2) ?? 0,
            )
          : null,
        topReason,
        eventCount: waste?.eventCount ?? 0,
      };
    });
  }

  async getInsights(tenantId: string, query: WastageInsightsDto) {
    const days = query.days ?? 14;
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);
    const midpoint = new Date(
      from.getTime() + (to.getTime() - from.getTime()) / 2,
    );
    const range = { from, to };
    const where = this.activeRangeWhere(tenantId, query.locationId, range);

    const [total, byReason, byItem, byLocation, locations] = await Promise.all([
      this.prisma.wasteEvent.aggregate({
        where,
        _sum: { costImpact: true },
        _count: { _all: true },
      }),
      this.prisma.wasteEvent.groupBy({
        by: ['reasonCode'],
        where,
        _sum: { costImpact: true },
        _count: { _all: true },
      }),
      this.prisma.wasteEvent.groupBy({
        by: ['inventoryItemId'],
        where,
        _sum: { costImpact: true },
      }),
      this.prisma.wasteEvent.groupBy({
        by: ['locationId'],
        where: this.activeRangeWhere(tenantId, undefined, range),
        _sum: { costImpact: true },
      }),
      this.prisma.location.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    const totalCost = decimal(total._sum.costImpact ?? 0);
    if (totalCost.lessThanOrEqualTo(0)) return [];

    const insights: WastageInsight[] = [];
    const reasonCost = (reasonCode: WasteReasonCode) =>
      decimal(
        byReason.find((row) => row.reasonCode === reasonCode)?._sum
          .costImpact ?? 0,
      );
    const reasonCount = (reasonCode: WasteReasonCode) =>
      byReason.find((row) => row.reasonCode === reasonCode)?._count._all ?? 0;

    const overproductionShare = reasonCost(WasteReasonCode.OVERPRODUCTION).div(
      totalCost,
    );
    if (overproductionShare.greaterThan(0.25)) {
      insights.push({
        type: 'OVERPRODUCTION_HIGH',
        severity: 'high',
        title: 'Overproduction waste is high',
        message: `${this.percent(overproductionShare)} of waste cost came from overproduction.`,
        action: 'Review production plan accuracy',
        metadata: { share: Number(overproductionShare.toFixed(4)) },
      });
    }

    const expiryShare = reasonCost(WasteReasonCode.EXPIRED).div(totalCost);
    if (expiryShare.greaterThan(0.2)) {
      insights.push({
        type: 'EXPIRY_HIGH',
        severity: 'high',
        title: 'Expiry waste is high',
        message: `${this.percent(expiryShare)} of waste cost came from expired stock.`,
        action: 'Tighten FEFO discipline; consider smaller batch sizes',
        metadata: { share: Number(expiryShare.toFixed(4)) },
      });
    }

    const [firstHalf, lastHalf] = await Promise.all([
      this.prisma.wasteEvent.aggregate({
        where: {
          ...where,
          createdAt: { gte: from, lt: midpoint },
        },
        _sum: { costImpact: true },
      }),
      this.prisma.wasteEvent.aggregate({
        where: {
          ...where,
          createdAt: { gte: midpoint, lte: to },
        },
        _sum: { costImpact: true },
      }),
    ]);
    const firstHalfCost = decimal(firstHalf._sum.costImpact ?? 0);
    const lastHalfCost = decimal(lastHalf._sum.costImpact ?? 0);
    if (
      firstHalfCost.greaterThan(0) &&
      lastHalfCost.greaterThan(firstHalfCost.mul(1.15))
    ) {
      const increase = lastHalfCost
        .sub(firstHalfCost)
        .div(firstHalfCost)
        .mul(100);
      insights.push({
        type: 'TRENDING_UP',
        severity: 'medium',
        title: 'Waste cost is trending up',
        message: `Waste cost rose ${increase.toFixed(2)}% in the second half of the window.`,
        action: 'Review recent batches and receiving quality',
        metadata: { percentIncrease: Number(increase.toFixed(2)) },
      });
    }

    const itemLeak = byItem
      .map((row) => ({
        inventoryItemId: row.inventoryItemId,
        totalCost: decimal(row._sum.costImpact ?? 0),
      }))
      .find((row) => row.totalCost.div(totalCost).greaterThan(0.25));
    if (itemLeak) {
      const item = await this.prisma.inventoryItem.findFirst({
        where: { tenantId, id: itemLeak.inventoryItemId },
        select: { name: true },
      });
      const share = itemLeak.totalCost.div(totalCost);
      insights.push({
        type: 'ITEM_LEAK',
        severity: 'high',
        title: 'One item is driving waste',
        message: `${item?.name ?? 'An item'} accounts for ${this.percent(share)} of waste cost.`,
        action:
          'Inspect storage, shelf life, and production usage for this item',
        metadata: {
          inventoryItemId: itemLeak.inventoryItemId,
          name: item?.name ?? null,
          share: Number(share.toFixed(4)),
        },
      });
    }

    if (locations.length > 1 && byLocation.length > 1) {
      const costs = byLocation
        .map((row) => decimal(row._sum.costImpact ?? 0))
        .sort((a, b) => a.cmp(b));
      const median = costs[Math.floor(costs.length / 2)];
      const outlier = byLocation.find((row) =>
        decimal(row._sum.costImpact ?? 0).greaterThan(median.mul(2)),
      );
      if (outlier && median.greaterThan(0)) {
        const cost = decimal(outlier._sum.costImpact ?? 0);
        insights.push({
          type: 'BRANCH_OUTLIER',
          severity: 'medium',
          title: 'One branch is an outlier',
          message:
            'A location is producing more than twice the median waste cost.',
          action: 'Compare branch prep, storage, and closing routines',
          metadata: {
            locationId: outlier.locationId,
            multiplier: Number(cost.div(median).toFixed(2)),
          },
        });
      }
    }

    const staffErrorCount = reasonCount(WasteReasonCode.STAFF_ERROR);
    if (staffErrorCount > 5) {
      insights.push({
        type: 'STAFF_ERROR_CLUSTER',
        severity: 'low',
        title: 'Staff error cluster detected',
        message: `${staffErrorCount} staff-error events were recorded in this window.`,
        action: 'Investigate training or process gap',
        metadata: { eventCount: staffErrorCount },
      });
    }

    const severityRank = { high: 0, medium: 1, low: 2 };
    return insights.sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity],
    );
  }

  private async recordWasteEventInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string | null,
    dto: CreateWasteEventDto,
  ) {
    const quantity = decimal(dto.quantity);
    const basis = await this.resolveCostBasis(tx, tenantId, dto, quantity);
    const costImpact = rateTimesQtyToMinor(basis.unitCost, quantity);

    const event = await tx.wasteEvent.create({
      data: {
        tenantId,
        locationId: dto.locationId,
        inventoryItemId: dto.inventoryItemId,
        lotId: basis.ledgerLotId,
        productionBatchId: dto.productionBatchId,
        quantity,
        uom: dto.uom,
        reasonCode: dto.reasonCode,
        notes: dto.notes,
        costImpact,
        currencyCode: basis.currencyCode,
        recordedById: actorId,
      },
    });

    await inventoryLedger.applyInventoryDelta(tx, {
      tenantId,
      locationId: dto.locationId,
      inventoryItemId: dto.inventoryItemId,
      lotId: basis.ledgerLotId,
      quantityDelta: quantity.negated(),
      unitCost: basis.unitCost,
      currencyCode: basis.currencyCode,
      movementType: InventoryMovementType.WASTAGE,
      referenceType: 'WasteEvent',
      referenceId: event.id,
      reason: dto.reasonCode,
      createdById: actorId,
    });

    const created = await tx.wasteEvent.findUniqueOrThrow({
      where: { id: event.id },
      include: wasteInclude,
    });

    await this.auditService.log(
      {
        tenantId,
        actorId,
        action: 'wastage.recorded',
        entityType: 'WasteEvent',
        entityId: event.id,
        afterJson: created as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return created;
  }

  private async resolveCostBasis(
    executor: WastageExecutor,
    tenantId: string,
    dto: CreateWasteEventDto,
    quantity: Prisma.Decimal,
  ) {
    const [{ currencyCode, settings }, location, item] = await Promise.all([
      requireInventoryItemMoneySettings(executor, {
        tenantId,
        locationId: dto.locationId,
        inventoryItemIds: [dto.inventoryItemId],
      }),
      executor.location.findFirst({
        where: {
          tenantId,
          id: dto.locationId,
          isActive: true,
        },
      }),
      executor.inventoryItem.findFirst({
        where: {
          tenantId,
          id: dto.inventoryItemId,
          deletedAt: null,
        },
      }),
    ]);
    const locationSetting = settings.get(dto.inventoryItemId)!;

    if (!location || !item) {
      throw new DomainException(
        'WASTAGE_TENANT_MISMATCH',
        'Location or inventory item was not found for this tenant',
        404,
      );
    }

    if (dto.productionBatchId) {
      const batch = await executor.productionBatch.findFirst({
        where: {
          tenantId,
          id: dto.productionBatchId,
          locationId: dto.locationId,
        },
      });
      if (!batch) {
        throw new DomainException(
          'WASTAGE_TENANT_MISMATCH',
          'Production batch was not found for this tenant and location',
          404,
        );
      }
    }

    const balances = await executor.inventoryBalance.findMany({
      where: {
        tenantId,
        locationId: dto.locationId,
        inventoryItemId: dto.inventoryItemId,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (balances.length === 0) {
      throw new DomainException(
        'WASTAGE_NO_STOCK_BASIS',
        'No inventory balance exists for this item at this location to establish a cost basis',
        400,
      );
    }

    const totalAvailable = balances.reduce(
      (sum, balance) => sum.add(balance.availableQty),
      decimal(0),
    );

    if (totalAvailable.lessThan(quantity)) {
      throw new DomainException(
        'WASTAGE_INSUFFICIENT_STOCK',
        'There is not enough available stock to record this waste event',
        400,
      );
    }

    if (dto.lotId) {
      const lot = await executor.inventoryLot.findFirst({
        where: {
          tenantId,
          id: dto.lotId,
          inventoryItemId: dto.inventoryItemId,
        },
      });
      if (!lot) {
        throw new DomainException(
          'WASTAGE_LOT_MISMATCH',
          'The selected lot does not belong to this inventory item',
          400,
        );
      }

      const lotBalance = balances.find((balance) => balance.lotId === lot.id);
      if (!lotBalance || lotBalance.availableQty.lessThan(quantity)) {
        throw new DomainException(
          'WASTAGE_INSUFFICIENT_STOCK',
          'There is not enough available stock in the selected lot',
          400,
        );
      }

      return {
        unitCost: await this.resolveLotUnitCost(
          executor,
          tenantId,
          lot.id,
          locationSetting.unitCost!,
        ),
        currencyCode,
        ledgerLotId: lot.id,
      };
    }

    const ledgerBalance =
      balances.find(
        (balance) =>
          balance.lotId === null &&
          balance.availableQty.greaterThanOrEqualTo(quantity),
      ) ??
      balances
        .filter((balance) =>
          balance.availableQty.greaterThanOrEqualTo(quantity),
        )
        .sort((left, right) => right.availableQty.cmp(left.availableQty))[0];

    if (!ledgerBalance) {
      throw new DomainException(
        'WASTAGE_INSUFFICIENT_STOCK',
        'Select a lot because the available stock is split across multiple lots',
        400,
      );
    }

    return {
      unitCost: locationSetting.unitCost!,
      currencyCode,
      ledgerLotId: ledgerBalance.lotId,
    };
  }

  private async resolveLotUnitCost(
    executor: WastageExecutor,
    tenantId: string,
    lotId: string,
    fallback: Prisma.Decimal,
  ) {
    const movements = await executor.inventoryMovement.findMany({
      where: {
        tenantId,
        lotId,
        quantity: { gt: decimal(0) },
      },
      select: {
        quantity: true,
        totalCost: true,
      },
    });
    const quantity = movements.reduce(
      (sum, movement) => sum.add(movement.quantity),
      decimal(0),
    );
    const totalCost = movements.reduce(
      (sum, movement) => sum.add(movement.totalCost),
      decimal(0),
    );

    return quantity.greaterThan(0) ? totalCost.div(quantity) : fallback;
  }

  private buildWasteWhere(tenantId: string, query: QueryWastageDto) {
    const where: Prisma.WasteEventWhereInput = {
      tenantId,
      locationId: query.locationId,
      reasonCode: query.reasonCode,
      inventoryItemId: query.inventoryItemId,
    };

    if (!query.includeVoided) {
      where.voidedAt = null;
    }

    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    return where;
  }

  private activeRangeWhere(
    tenantId: string,
    locationId: string | undefined,
    range: { from: Date; to: Date },
  ): Prisma.WasteEventWhereInput {
    return {
      tenantId,
      locationId,
      voidedAt: null,
      createdAt: {
        gte: range.from,
        lte: range.to,
      },
    };
  }

  private async topItems(
    tenantId: string,
    where: Prisma.WasteEventWhereInput,
    limit: number,
  ) {
    const groups = await this.prisma.wasteEvent.groupBy({
      by: ['inventoryItemId', 'uom'],
      where,
      _sum: { costImpact: true, quantity: true },
      _count: { _all: true },
      orderBy: { _sum: { costImpact: 'desc' } },
      take: limit,
    });
    const totalCost = groups.reduce(
      (sum, row) => sum.add(row._sum.costImpact ?? decimal(0)),
      decimal(0),
    );
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        tenantId,
        id: { in: groups.map((row) => row.inventoryItemId) },
      },
      select: { id: true, name: true },
    });
    const names = new Map(items.map((item) => [item.id, item.name]));

    return groups.map((row) => {
      const cost = decimal(row._sum.costImpact ?? 0);
      return {
        inventoryItemId: row.inventoryItemId,
        name: names.get(row.inventoryItemId) ?? 'Unknown item',
        totalCost: cost.toString(),
        totalQuantity: (row._sum.quantity ?? decimal(0)).toString(),
        uom: row.uom,
        eventCount: row._count._all,
        percentOfTotal: totalCost.greaterThan(0)
          ? Number(cost.div(totalCost).mul(100).toFixed(2))
          : 0,
      };
    });
  }

  private parseRange(from: string, to: string) {
    const parsedFrom = new Date(from);
    const parsedTo = new Date(to);

    if (
      Number.isNaN(parsedFrom.getTime()) ||
      Number.isNaN(parsedTo.getTime())
    ) {
      throw new DomainException(
        'WASTAGE_INVALID_DATE_RANGE',
        'A valid date range is required',
        400,
      );
    }

    if (parsedFrom > parsedTo) {
      throw new DomainException(
        'WASTAGE_INVALID_DATE_RANGE',
        'The start date must be before the end date',
        400,
      );
    }

    return { from: parsedFrom, to: parsedTo };
  }

  private priorRange(from: Date, to: Date) {
    const lengthMs = to.getTime() - from.getTime();
    return {
      from: new Date(from.getTime() - lengthMs),
      to: new Date(from.getTime()),
    };
  }

  private buildBuckets(from: Date, to: Date, bucket: 'day' | 'week') {
    const buckets = new Map<
      string,
      {
        date: string;
        totalCost: Prisma.Decimal;
        totalQuantity: Prisma.Decimal;
        eventCount: number;
      }
    >();
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= to) {
      const key = this.bucketKey(cursor, bucket);
      if (!buckets.has(key)) {
        buckets.set(key, {
          date: key,
          totalCost: decimal(0),
          totalQuantity: decimal(0),
          eventCount: 0,
        });
      }
      cursor.setDate(cursor.getDate() + (bucket === 'week' ? 7 : 1));
    }

    return buckets;
  }

  private bucketKey(date: Date, bucket: 'day' | 'week') {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    if (bucket === 'week') {
      copy.setDate(copy.getDate() - copy.getDay());
    }
    return copy.toISOString().slice(0, 10);
  }

  private percentChange(current: Prisma.Decimal, prior: Prisma.Decimal) {
    if (prior.equals(0)) {
      return current.equals(0) ? 0 : 100;
    }
    return Number(current.sub(prior).div(prior).mul(100).toFixed(2));
  }

  private percent(value: Prisma.Decimal) {
    return `${value.mul(100).toFixed(0)}%`;
  }

  private hashPayload(payload: unknown) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
