import { Prisma, type LocationInventoryItemSetting } from '@prisma/client';
import { DomainException } from '../exceptions/domain.exception';
import { PrismaService } from './prisma.service';

export type MoneyExecutor = Prisma.TransactionClient | PrismaService;

interface LocationMoneyScope {
  tenantId: string;
  locationId: string;
}

const setupRequired = (
  locationId: string,
  settingType: string,
  missingSettingIds: string[],
) =>
  new DomainException(
    'LOCATION_MONEY_SETUP_REQUIRED',
    'Complete location money setup before continuing.',
    409,
    { locationId, settingType, missingSettingIds },
  );

export async function requireLocationCurrency(
  executor: MoneyExecutor,
  scope: LocationMoneyScope,
) {
  const location = await executor.location.findFirst({
    where: {
      tenantId: scope.tenantId,
      id: scope.locationId,
      isActive: true,
    },
    select: { currencyCode: true },
  });

  if (!location) {
    throw new DomainException('LOCATION_NOT_FOUND', 'Location not found', 404);
  }

  return location.currencyCode;
}

/**
 * Non-throwing variant: returns the priced settings plus the ids that have no
 * usable price in the location currency. Use this for costing previews so a
 * missing ingredient price surfaces a "cost incomplete" flag instead of either
 * a hard failure or a silent zero. Write paths should keep using the throwing
 * `requireInventoryItemMoneySettings` below.
 */
export async function getInventoryItemMoneySettings(
  executor: MoneyExecutor,
  scope: LocationMoneyScope & { inventoryItemIds: string[] },
) {
  const inventoryItemIds = [...new Set(scope.inventoryItemIds)];
  const currencyCode = await requireLocationCurrency(executor, scope);

  if (!inventoryItemIds.length) {
    return {
      currencyCode,
      settings: new Map<string, LocationInventoryItemSetting>(),
      missingSettingIds: [] as string[],
    };
  }

  const rows = await executor.locationInventoryItemSetting.findMany({
    where: {
      tenantId: scope.tenantId,
      locationId: scope.locationId,
      inventoryItemId: { in: inventoryItemIds },
      isStocked: { not: false },
    },
  });
  // Only a row with a usable price in the location currency counts as priced.
  const settings = new Map<string, LocationInventoryItemSetting>();
  for (const row of rows) {
    if (row.unitCost && row.currencyCode === currencyCode) {
      settings.set(row.inventoryItemId, row);
    }
  }
  const missingSettingIds = inventoryItemIds.filter((id) => !settings.has(id));

  return { currencyCode, settings, missingSettingIds };
}

export async function requireInventoryItemMoneySettings(
  executor: MoneyExecutor,
  scope: LocationMoneyScope & { inventoryItemIds: string[] },
) {
  const { currencyCode, settings, missingSettingIds } =
    await getInventoryItemMoneySettings(executor, scope);

  if (missingSettingIds.length) {
    throw setupRequired(scope.locationId, 'inventory-items', missingSettingIds);
  }

  return { currencyCode, settings };
}

export async function requireSupplierItemMoneySettings(
  executor: MoneyExecutor,
  scope: LocationMoneyScope & { supplierItemIds: string[] },
) {
  const supplierItemIds = [...new Set(scope.supplierItemIds)];
  const currencyCode = await requireLocationCurrency(executor, scope);

  if (!supplierItemIds.length) {
    return { currencyCode, settings: new Map() };
  }

  const rows = await executor.locationSupplierItemSetting.findMany({
    where: {
      tenantId: scope.tenantId,
      locationId: scope.locationId,
      supplierItemId: { in: supplierItemIds },
      isAvailable: { not: false },
    },
  });
  const settings = new Map(rows.map((row) => [row.supplierItemId, row]));
  const missingSettingIds = supplierItemIds.filter((id) => {
    const setting = settings.get(id);
    return !setting?.currentPrice || setting.currencyCode !== currencyCode;
  });

  if (missingSettingIds.length) {
    throw setupRequired(scope.locationId, 'supplier-items', missingSettingIds);
  }

  return { currencyCode, settings };
}

export async function requireProductVariantMoneySettings(
  executor: MoneyExecutor,
  scope: LocationMoneyScope & { productVariantIds: string[] },
) {
  const productVariantIds = [...new Set(scope.productVariantIds)];
  const currencyCode = await requireLocationCurrency(executor, scope);

  if (!productVariantIds.length) {
    return { currencyCode, settings: new Map() };
  }

  const rows = await executor.locationProductVariantSetting.findMany({
    where: {
      tenantId: scope.tenantId,
      locationId: scope.locationId,
      productVariantId: { in: productVariantIds },
      isAvailable: { not: false },
    },
  });
  const settings = new Map(rows.map((row) => [row.productVariantId, row]));
  const missingSettingIds = productVariantIds.filter((id) => {
    const setting = settings.get(id);
    return !setting?.sellingPrice || setting.currencyCode !== currencyCode;
  });

  if (missingSettingIds.length) {
    throw setupRequired(
      scope.locationId,
      'product-variants',
      missingSettingIds,
    );
  }

  return { currencyCode, settings };
}
