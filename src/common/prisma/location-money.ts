import { Prisma } from '@prisma/client';
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

export async function requireInventoryItemMoneySettings(
  executor: MoneyExecutor,
  scope: LocationMoneyScope & { inventoryItemIds: string[] },
) {
  const inventoryItemIds = [...new Set(scope.inventoryItemIds)];
  const currencyCode = await requireLocationCurrency(executor, scope);

  if (!inventoryItemIds.length) {
    return { currencyCode, settings: new Map() };
  }

  const rows = await executor.locationInventoryItemSetting.findMany({
    where: {
      tenantId: scope.tenantId,
      locationId: scope.locationId,
      inventoryItemId: { in: inventoryItemIds },
      isStocked: { not: false },
    },
  });
  const settings = new Map(rows.map((row) => [row.inventoryItemId, row]));
  const missingSettingIds = inventoryItemIds.filter((id) => {
    const setting = settings.get(id);
    return !setting?.unitCost || setting.currencyCode !== currencyCode;
  });

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
