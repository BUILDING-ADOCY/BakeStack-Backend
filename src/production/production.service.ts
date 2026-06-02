import { Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  ProductionBatchStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { applyInventoryDelta } from '../common/prisma/inventory-ledger';
import {
  requireInventoryItemMoneySettings,
  requireLocationCurrency,
} from '../common/prisma/location-money';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { RecipesService } from '../recipes/recipes.service';
import { BatchActionDto } from './dto/batch-action.dto';
import { CompleteBatchDto } from './dto/complete-batch.dto';
import { CreateProductionBatchDto } from './dto/create-production-batch.dto';
import { CreateProductionPlanDto } from './dto/create-production-plan.dto';
import { QueryProductionBatchesDto } from './dto/query-production-batches.dto';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipesService: RecipesService,
    private readonly auditService: AuditService,
  ) {}

  createProductionPlan(dto: CreateProductionPlanDto) {
    return this.prisma.productionPlan.create({
      data: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        planDate: new Date(dto.planDate),
        notes: dto.notes,
        createdById: dto.createdById,
      },
    });
  }

  listPlans(query: QueryProductionBatchesDto) {
    return this.prisma.productionPlan.findMany({
      where: {
        tenantId: query.tenantId,
        locationId: query.locationId,
      },
      include: { batches: true },
      orderBy: { planDate: 'asc' },
    });
  }

  listBatches(query: QueryProductionBatchesDto) {
    return this.prisma.productionBatch.findMany({
      where: {
        tenantId: query.tenantId,
        locationId: query.locationId,
      },
      include: {
        recipe: {
          include: {
            productVariant: true,
          },
        },
        consumptions: true,
        outputs: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBatch(tenantId: string, id: string) {
    const batch = await this.prisma.productionBatch.findFirst({
      where: { tenantId, id },
      include: {
        recipe: {
          include: {
            components: {
              include: {
                inventoryItem: true,
              },
            },
            productVariant: {
              include: {
                inventoryItem: true,
              },
            },
          },
        },
        consumptions: true,
        outputs: true,
        items: true,
      },
    });

    if (!batch) {
      throw new DomainException(
        'PRODUCTION_BATCH_NOT_FOUND',
        'Production batch not found',
        404,
      );
    }

    return batch;
  }

  async createProductionBatch(dto: CreateProductionBatchDto) {
    const recipe = await this.prisma.recipe.findFirst({
      where: {
        tenantId: dto.tenantId,
        productVariantId: dto.productVariantId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        components: {
          include: {
            inventoryItem: true,
          },
        },
        productVariant: true,
      },
    });

    if (!recipe) {
      throw new DomainException(
        'ACTIVE_RECIPE_NOT_FOUND',
        'An active recipe is required before creating a production batch',
        404,
      );
    }

    const requiredIngredients =
      await this.recipesService.calculateRequiredIngredients(
        dto.tenantId,
        recipe.id,
        dto.plannedQty,
      );
    const currencyCode = await requireLocationCurrency(this.prisma, {
      tenantId: dto.tenantId,
      locationId: dto.locationId,
    });
    const inventoryItemIds = requiredIngredients.map(
      (ingredient) => ingredient.inventoryItemId,
    );
    const locationSettings =
      await this.prisma.locationInventoryItemSetting.findMany({
        where: {
          tenantId: dto.tenantId,
          locationId: dto.locationId,
          inventoryItemId: { in: inventoryItemIds },
          isStocked: { not: false },
        },
      });
    const settings = new Map(
      locationSettings
        .filter(
          (setting) =>
            setting.unitCost && setting.currencyCode === currencyCode,
        )
        .map((setting) => [setting.inventoryItemId, setting]),
    );
    const legacyUnitCosts = new Map(
      recipe.components.map((component) => [
        component.inventoryItemId,
        component.inventoryItem.unitCost,
      ]),
    );
    const hasCompleteMoneySetup = requiredIngredients.every((ingredient) =>
      settings.has(ingredient.inventoryItemId),
    );
    const estimatedCost = hasCompleteMoneySetup
      ? requiredIngredients.reduce(
          (sum, ingredient) =>
            sum.add(
              ingredient.requiredQty.mul(
                settings.get(ingredient.inventoryItemId)!.unitCost!,
              ),
            ),
          decimal(0),
        )
      : undefined;

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatch.create({
        data: {
          tenantId: dto.tenantId,
          locationId: dto.locationId,
          productionPlanId: dto.productionPlanId,
          recipeId: recipe.id,
          batchNumber: dto.batchNumber ?? `BATCH-${Date.now()}`,
          plannedQty: decimal(dto.plannedQty),
          estimatedCost,
          currencyCode,
          createdById: dto.createdById,
          items: {
            create: {
              tenantId: dto.tenantId,
              productVariantId: dto.productVariantId,
              quantityPlanned: decimal(dto.plannedQty),
            },
          },
          consumptions: {
            create: requiredIngredients.map((ingredient) => ({
              tenantId: dto.tenantId,
              inventoryItemId: ingredient.inventoryItemId,
              requiredQty: ingredient.requiredQty,
              consumedQty: decimal(0),
              uom: ingredient.uom,
              unitCost:
                settings.get(ingredient.inventoryItemId)?.unitCost ??
                legacyUnitCosts.get(ingredient.inventoryItemId) ??
                decimal(0),
              totalCost: decimal(0),
              currencyCode,
            })),
          },
        },
        include: {
          consumptions: true,
          items: true,
        },
      });

      await this.auditService.log(
        {
          tenantId: dto.tenantId,
          actorId: dto.createdById,
          action: 'production.batch_created',
          entityType: 'ProductionBatch',
          entityId: batch.id,
          afterJson: batch as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return batch;
    });
  }

  async approveBatch(id: string, action: BatchActionDto) {
    const tenantId = this.requireActionTenantId(action.tenantId);
    const batch = await this.prisma.productionBatch.findFirst({
      where: { tenantId, id },
      include: { consumptions: true },
    });

    if (!batch) {
      throw new DomainException(
        'PRODUCTION_BATCH_NOT_FOUND',
        'Production batch not found',
        404,
      );
    }

    if (batch.status !== ProductionBatchStatus.PLANNED) {
      throw new DomainException(
        'INVALID_BATCH_STATUS',
        'Only planned batches can be approved',
        409,
      );
    }

    await requireInventoryItemMoneySettings(this.prisma, {
      tenantId,
      locationId: batch.locationId,
      inventoryItemIds: batch.consumptions.map(
        (consumption) => consumption.inventoryItemId,
      ),
    });

    return this.prisma.productionBatch.update({
      where: { id: batch.id },
      data: {
        status: 'APPROVED',
        approvedById: action.actorId,
      },
    });
  }

  async startBatch(id: string, action: BatchActionDto) {
    const tenantId = this.requireActionTenantId(action.tenantId);
    const batch = await this.prisma.productionBatch.findFirst({
      where: { tenantId, id },
      include: {
        consumptions: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!batch) {
      throw new DomainException(
        'PRODUCTION_BATCH_NOT_FOUND',
        'Production batch not found',
        404,
      );
    }

    if (batch.status !== ProductionBatchStatus.APPROVED) {
      throw new DomainException(
        'PRODUCTION_BATCH_NOT_APPROVED',
        'Production batch cannot start without approval',
        409,
      );
    }

    await requireInventoryItemMoneySettings(this.prisma, {
      tenantId,
      locationId: batch.locationId,
      inventoryItemIds: batch.consumptions.map(
        (consumption) => consumption.inventoryItemId,
      ),
    });

    await this.ensureSufficientStock(
      batch.tenantId,
      batch.locationId,
      batch.consumptions,
    );

    return this.prisma.$transaction(async (tx) => {
      for (const consumption of batch.consumptions) {
        let remaining = consumption.requiredQty;
        let allocatedLotId: string | null = null;

        const balances = await tx.inventoryBalance.findMany({
          where: {
            tenantId: batch.tenantId,
            locationId: batch.locationId,
            inventoryItemId: consumption.inventoryItemId,
            availableQty: { gt: decimal(0) },
          },
          orderBy: { createdAt: 'asc' },
        });

        for (const balance of balances) {
          if (remaining.lessThanOrEqualTo(0)) {
            break;
          }

          const quantityToConsume = Prisma.Decimal.min(
            remaining,
            balance.availableQty,
          );

          if (quantityToConsume.lessThanOrEqualTo(0)) {
            continue;
          }

          allocatedLotId ??= balance.lotId;

          await applyInventoryDelta(tx, {
            tenantId: batch.tenantId,
            locationId: batch.locationId,
            inventoryItemId: consumption.inventoryItemId,
            lotId: balance.lotId,
            quantityDelta: quantityToConsume.negated(),
            unitCost: consumption.unitCost,
            movementType: InventoryMovementType.PRODUCTION_CONSUMPTION,
            referenceType: 'ProductionBatch',
            referenceId: batch.id,
            createdById: action.actorId,
          });

          remaining = remaining.sub(quantityToConsume);
        }

        if (remaining.greaterThan(0)) {
          throw new DomainException(
            'NEGATIVE_STOCK',
            'Stock cannot go negative for this operation',
            400,
          );
        }

        await tx.productionConsumption.update({
          where: { id: consumption.id },
          data: {
            lotId: allocatedLotId,
            consumedQty: consumption.requiredQty,
            totalCost: consumption.requiredQty.mul(consumption.unitCost),
          },
        });
      }

      const startedBatch = await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });

      await this.auditService.log(
        {
          tenantId: batch.tenantId,
          actorId: action.actorId,
          action: 'production.batch_started',
          entityType: 'ProductionBatch',
          entityId: batch.id,
          afterJson: startedBatch as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return startedBatch;
    });
  }

  async completeBatch(id: string, action: CompleteBatchDto) {
    const tenantId = this.requireActionTenantId(action.tenantId);
    const batch = await this.prisma.productionBatch.findFirst({
      where: { tenantId, id },
      include: {
        recipe: {
          include: {
            productVariant: {
              include: {
                inventoryItem: true,
              },
            },
          },
        },
        consumptions: true,
        items: true,
      },
    });

    if (!batch) {
      throw new DomainException(
        'PRODUCTION_BATCH_NOT_FOUND',
        'Production batch not found',
        404,
      );
    }

    if (batch.status !== ProductionBatchStatus.IN_PROGRESS) {
      throw new DomainException(
        'INVALID_BATCH_STATUS',
        'Production batch must be in progress before completion',
        409,
      );
    }

    const outputInventoryItemId = batch.recipe.productVariant.inventoryItemId;
    if (!outputInventoryItemId) {
      throw new DomainException(
        'FINISHED_GOOD_MAPPING_MISSING',
        'Product variant must be linked to a finished goods inventory item',
        400,
      );
    }

    const outputQty = decimal(
      action.actualOutputQty ?? Number(batch.plannedQty),
    );
    const totalConsumedCost = batch.consumptions.reduce(
      (sum, consumption) => sum.add(consumption.totalCost),
      decimal(0),
    );
    const unitCost = outputQty.greaterThan(0)
      ? totalConsumedCost.div(outputQty)
      : decimal(0);

    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.create({
        data: {
          tenantId: batch.tenantId,
          inventoryItemId: outputInventoryItemId,
          supplierBatchNo: batch.batchNumber,
          receivedAt: new Date(),
        },
      });

      await applyInventoryDelta(tx, {
        tenantId: batch.tenantId,
        locationId: batch.locationId,
        inventoryItemId: outputInventoryItemId,
        lotId: lot.id,
        quantityDelta: outputQty,
        unitCost,
        movementType: InventoryMovementType.PRODUCTION_OUTPUT,
        referenceType: 'ProductionBatch',
        referenceId: batch.id,
        createdById: action.actorId,
      });

      await tx.productionOutput.create({
        data: {
          tenantId: batch.tenantId,
          productionBatchId: batch.id,
          inventoryItemId: outputInventoryItemId,
          lotId: lot.id,
          outputQty,
          uom: batch.recipe.productVariant.unit,
          unitCost,
          totalCost: totalConsumedCost,
          currencyCode: batch.currencyCode,
        },
      });

      await tx.productionBatchItem.updateMany({
        where: {
          tenantId: batch.tenantId,
          productionBatchId: batch.id,
        },
        data: {
          quantityCompleted: outputQty,
        },
      });

      const completedBatch = await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          status: 'COMPLETED',
          actualOutputQty: outputQty,
          completedAt: new Date(),
        },
      });

      await this.auditService.log(
        {
          tenantId: batch.tenantId,
          actorId: action.actorId,
          action: 'production.batch_completed',
          entityType: 'ProductionBatch',
          entityId: batch.id,
          afterJson: completedBatch as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return completedBatch;
    });
  }

  async cancelBatch(id: string, action: BatchActionDto) {
    const tenantId = this.requireActionTenantId(action.tenantId);
    const batch = await this.requireBatch(tenantId, id);

    if (
      batch.status !== ProductionBatchStatus.PLANNED &&
      batch.status !== ProductionBatchStatus.APPROVED
    ) {
      throw new DomainException(
        'INVALID_BATCH_STATUS',
        'Only planned or approved batches can be cancelled',
        409,
      );
    }

    return this.prisma.productionBatch.update({
      where: { id: batch.id },
      data: { status: 'CANCELLED' },
    });
  }

  private async requireBatch(tenantId: string, id: string) {
    const batch = await this.prisma.productionBatch.findFirst({
      where: { tenantId, id },
    });

    if (!batch) {
      throw new DomainException(
        'PRODUCTION_BATCH_NOT_FOUND',
        'Production batch not found',
        404,
      );
    }

    return batch;
  }

  private requireActionTenantId(tenantId?: string) {
    if (!tenantId) {
      throw new DomainException(
        'TENANT_SCOPE_REQUIRED',
        'Tenant scope is required for production operations',
        400,
      );
    }

    return tenantId;
  }

  private async ensureSufficientStock(
    tenantId: string,
    locationId: string,
    consumptions: Array<{
      inventoryItemId: string;
      requiredQty: Prisma.Decimal;
    }>,
  ) {
    for (const consumption of consumptions) {
      const balanceRows = await this.prisma.inventoryBalance.findMany({
        where: {
          tenantId,
          locationId,
          inventoryItemId: consumption.inventoryItemId,
        },
      });
      const availableQty = balanceRows.reduce(
        (sum, row) => sum.add(row.availableQty),
        decimal(0),
      );

      if (availableQty.lessThan(consumption.requiredQty)) {
        throw new DomainException(
          'NEGATIVE_STOCK',
          'Stock cannot go negative for this operation',
          400,
        );
      }
    }
  }
}
