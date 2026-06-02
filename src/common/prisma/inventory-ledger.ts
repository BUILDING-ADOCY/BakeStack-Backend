import { InventoryMovementType, Prisma } from '@prisma/client';
import { DomainException } from '../exceptions/domain.exception';
import { decimal } from '../utils/decimal.util';
import { PrismaService } from './prisma.service';

export type InventoryExecutor = Prisma.TransactionClient | PrismaService;

export interface InventoryDeltaInput {
  tenantId: string;
  locationId: string;
  inventoryItemId: string;
  lotId?: string | null;
  quantityDelta: Prisma.Decimal.Value;
  unitCost: Prisma.Decimal.Value;
  currencyCode?: string;
  movementType: InventoryMovementType;
  referenceType: string;
  referenceId?: string | null;
  reason?: string | null;
  createdById?: string | null;
  allowNegative?: boolean;
}

export const findInventoryBalance = (
  executor: InventoryExecutor,
  scope: {
    tenantId: string;
    locationId: string;
    inventoryItemId: string;
    lotId?: string | null;
  },
) =>
  executor.inventoryBalance.findFirst({
    where: {
      tenantId: scope.tenantId,
      locationId: scope.locationId,
      inventoryItemId: scope.inventoryItemId,
      lotId: scope.lotId ?? null,
    },
  });

export async function applyInventoryDelta(
  executor: InventoryExecutor,
  input: InventoryDeltaInput,
) {
  const delta = decimal(input.quantityDelta);
  const unitCost = decimal(input.unitCost);
  const [balance, location, balances] = await Promise.all([
    findInventoryBalance(executor, input),
    executor.location.findFirst({
      where: { tenantId: input.tenantId, id: input.locationId },
      select: { currencyCode: true },
    }),
    executor.inventoryBalance.findMany({
      where: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        inventoryItemId: input.inventoryItemId,
      },
      select: { onHandQty: true },
    }),
  ]);

  if (!location) {
    throw new DomainException(
      'LOCATION_NOT_FOUND',
      'Location not found for inventory movement',
      404,
    );
  }

  const currencyCode = input.currencyCode ?? location.currencyCode;
  const reservedQty = balance?.reservedQty ?? decimal(0);
  const nextOnHandQty = (balance?.onHandQty ?? decimal(0)).add(delta);
  const nextAvailableQty = nextOnHandQty.sub(reservedQty);

  if (!input.allowNegative && nextAvailableQty.lessThan(0)) {
    throw new DomainException(
      'NEGATIVE_STOCK',
      'Stock cannot go negative for this operation',
      400,
    );
  }

  const persistedBalance = balance
    ? await executor.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          onHandQty: nextOnHandQty,
          availableQty: nextAvailableQty,
        },
      })
    : await executor.inventoryBalance.create({
        data: {
          tenantId: input.tenantId,
          locationId: input.locationId,
          inventoryItemId: input.inventoryItemId,
          lotId: input.lotId ?? null,
          onHandQty: nextOnHandQty,
          reservedQty,
          availableQty: nextAvailableQty,
        },
      });

  const movement = await executor.inventoryMovement.create({
    data: {
      tenantId: input.tenantId,
      locationId: input.locationId,
      inventoryItemId: input.inventoryItemId,
      lotId: input.lotId ?? null,
      movementType: input.movementType,
      quantity: delta,
      unitCost,
      totalCost: delta.mul(unitCost),
      currencyCode,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      reason: input.reason ?? null,
      createdById: input.createdById ?? null,
    },
  });

  if (delta.greaterThan(0)) {
    const previousOnHandQty = balances.reduce(
      (sum, row) => sum.add(row.onHandQty),
      decimal(0),
    );
    const previousSetting =
      await executor.locationInventoryItemSetting.findUnique({
        where: {
          tenantId_locationId_inventoryItemId: {
            tenantId: input.tenantId,
            locationId: input.locationId,
            inventoryItemId: input.inventoryItemId,
          },
        },
      });
    const previousUnitCost = previousSetting?.unitCost ?? unitCost;
    const nextTotalQty = previousOnHandQty.add(delta);
    const movingAverageUnitCost = nextTotalQty.greaterThan(0)
      ? previousOnHandQty
          .mul(previousUnitCost)
          .add(delta.mul(unitCost))
          .div(nextTotalQty)
      : unitCost;

    await executor.locationInventoryItemSetting.upsert({
      where: {
        tenantId_locationId_inventoryItemId: {
          tenantId: input.tenantId,
          locationId: input.locationId,
          inventoryItemId: input.inventoryItemId,
        },
      },
      update: {
        unitCost: movingAverageUnitCost,
        currencyCode,
        isStocked: true,
      },
      create: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        inventoryItemId: input.inventoryItemId,
        unitCost: movingAverageUnitCost,
        currencyCode,
        isStocked: true,
      },
    });
  }

  return { balance: persistedBalance, movement };
}
