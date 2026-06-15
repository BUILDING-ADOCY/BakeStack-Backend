import { Prisma } from '@prisma/client';
import { LocationsService } from '../src/locations/locations.service';

const location = {
  id: 'location-1',
  tenantId: 'tenant-1',
  name: 'Front Cafe',
  type: 'CAFE',
  country: 'India',
  countryCode: 'IN',
  currencyCode: 'INR',
};

const countDelegate = () => ({ count: jest.fn().mockResolvedValue(0) });

const buildPrisma = () => {
  const prisma: any = {
    location: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(location),
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'location-1',
        ...data,
      })),
      update: jest.fn().mockImplementation(({ data }: any) => ({
        ...location,
        ...data,
      })),
      updateMany: jest.fn(),
    },
    locationProductVariantSetting: {
      ...countDelegate(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    locationInventoryItemSetting: {
      ...countDelegate(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }: any) => ({
        id: 'inventory-setting-1',
        ...create,
      })),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    locationSupplierItemSetting: {
      ...countDelegate(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    locationProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'profile-1',
        ...data,
      })),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    complianceProfile: countDelegate(),
    inventoryBalance: countDelegate(),
    inventoryMovement: countDelegate(),
    inventoryImport: countDelegate(),
    procurementRequest: countDelegate(),
    purchaseOrder: countDelegate(),
    goodsReceipt: countDelegate(),
    productionPlan: countDelegate(),
    productionBatch: countDelegate(),
    wasteEvent: countDelegate(),
    qCCheck: countDelegate(),
    dailyClose: countDelegate(),
    productVariant: {
      findFirst: jest.fn().mockResolvedValue({ id: 'variant-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    inventoryItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'inventory-item-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    supplierItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'supplier-item-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    onboardingProgress: { updateMany: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
      callback(prisma),
    ),
  };

  return prisma;
};

const buildAppwriteMirrorMock = () =>
  ({
    upsertOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
    deleteOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
  }) as any;

const buildService = (prisma: any) =>
  new LocationsService(
    prisma as any,
    {
      log: jest.fn(),
    } as any,
    buildAppwriteMirrorMock(),
  );

describe('LocationsService money foundation', () => {
  it('derives currency from the selected market when creating a location', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);

    const created = await service.create('tenant-1', 'user-1', 'corr-1', {
      tenantId: 'ignored-client-tenant',
      name: 'Seattle Cafe',
      type: 'CAFE' as any,
      city: 'Seattle',
      state: 'WA',
      countryCode: 'us',
    });

    expect(created).toMatchObject({
      country: 'United States',
      countryCode: 'US',
      currencyCode: 'USD',
    });
  });

  it('creates additional tenant stores as secondary locations by default', async () => {
    const prisma = buildPrisma();
    prisma.location.count.mockResolvedValue(1);
    const service = buildService(prisma);

    const created = await service.create('tenant-1', 'user-1', 'corr-1', {
      name: 'Downtown Cafe',
      type: 'CAFE' as any,
      city: 'Pune',
      state: 'Maharashtra',
      countryCode: 'IN',
    });

    expect(created).toMatchObject({
      tenantId: 'tenant-1',
      name: 'Downtown Cafe',
      isPrimary: false,
    });
    expect(prisma.location.updateMany).not.toHaveBeenCalled();
  });

  it('locks a location currency after operational activity exists', async () => {
    const prisma = buildPrisma();
    prisma.inventoryMovement.count.mockResolvedValue(1);
    const service = buildService(prisma);

    await expect(
      service.update('tenant-1', 'location-1', 'user-1', 'corr-1', {
        countryCode: 'US',
      }),
    ).rejects.toMatchObject({ code: 'LOCATION_CURRENCY_LOCKED' });
    expect(prisma.location.update).not.toHaveBeenCalled();
  });

  it('resets money overrides when market changes before activity starts', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);

    const updated = await service.update(
      'tenant-1',
      'location-1',
      'user-1',
      'corr-1',
      { countryCode: 'US' },
    );

    expect(updated).toMatchObject({
      countryCode: 'US',
      currencyCode: 'USD',
    });
    expect(
      prisma.locationProductVariantSetting.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sellingPrice: null,
          currencyCode: 'USD',
        }),
      }),
    );
    expect(prisma.locationProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          averageDailyRevenue: null,
          monthlyRent: null,
          currencyCode: 'USD',
        }),
      }),
    );
  });

  it('snapshots location currency on profile money fields', async () => {
    const prisma = buildPrisma();
    prisma.location.findFirst.mockResolvedValue({
      ...location,
      countryCode: 'US',
      currencyCode: 'USD',
    });
    const service = buildService(prisma);

    await service.upsertProfile('tenant-1', 'location-1', 'user-1', 'corr-1', {
      averageDailyRevenue: 1250,
      monthlyRent: 3000,
    });

    expect(prisma.locationProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currencyCode: 'USD' }),
      }),
    );
  });

  it('derives local inventory-setting currency from its location', async () => {
    const prisma = buildPrisma();
    prisma.location.findFirst.mockResolvedValue({
      ...location,
      countryCode: 'AU',
      currencyCode: 'AUD',
    });
    const service = buildService(prisma);

    const setting = await service.upsertInventoryItemSetting(
      'tenant-1',
      'location-1',
      'inventory-item-1',
      'user-1',
      'corr-1',
      { unitCost: 4.25, reorderLevel: 12 },
    );

    expect(setting.currencyCode).toBe('AUD');
    expect(setting.unitCost).toEqual(new Prisma.Decimal(4.25));
  });

  it('reports readiness and a locked currency when batches exist', async () => {
    const prisma = buildPrisma();
    prisma.productionBatch.count.mockResolvedValue(1);
    const service = buildService(prisma);

    await expect(
      service.getMoneyReadiness('tenant-1', 'location-1'),
    ).resolves.toMatchObject({
      isReady: true,
      currencyLocked: true,
      operationalActivity: { productionBatches: 1 },
    });
  });

  it('reports missing local catalog settings before operational actions', async () => {
    const prisma = buildPrisma();
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'variant-1' }]);
    prisma.inventoryItem.findMany.mockResolvedValue([{ id: 'item-1' }]);
    prisma.supplierItem.findMany.mockResolvedValue([{ id: 'supplier-item-1' }]);
    const service = buildService(prisma);

    await expect(
      service.getMoneyReadiness('tenant-1', 'location-1'),
    ).resolves.toMatchObject({
      isReady: false,
      localSettings: {
        productVariants: { missingSettingIds: ['variant-1'] },
        inventoryItems: { missingSettingIds: ['item-1'] },
        supplierItems: { missingSettingIds: ['supplier-item-1'] },
      },
    });
  });
});
