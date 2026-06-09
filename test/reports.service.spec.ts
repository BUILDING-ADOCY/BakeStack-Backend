import { Prisma } from '@prisma/client';

import { ReportsService } from '../src/reports/reports.service';

describe('ReportsService daily close', () => {
  let prisma: any;
  let auditService: any;
  let recipesService: any;
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      salesEntry: { findMany: jest.fn().mockResolvedValue([]) },
      wasteEvent: { findMany: jest.fn().mockResolvedValue([]) },
      recipe: { findMany: jest.fn().mockResolvedValue([]) },
      location: {
        findFirst: jest.fn().mockResolvedValue({ currencyCode: 'INR' }),
      },
    };
    auditService = { log: jest.fn() };
    recipesService = { calculateRecipeCost: jest.fn() };
    service = new ReportsService(prisma, auditService, recipesService);
  });

  it('derives revenue and COGS from captured sales (real, non-100% margin)', async () => {
    prisma.salesEntry.findMany.mockResolvedValue([
      {
        productVariantId: 'v1',
        units: new Prisma.Decimal(10),
        lineRevenue: 50000, // ₹500 in paise
      },
    ]);
    prisma.recipe.findMany.mockResolvedValue([
      { id: 'r1', productVariantId: 'v1' },
    ]);
    recipesService.calculateRecipeCost.mockResolvedValue({
      costPerYieldUnit: new Prisma.Decimal(20), // ₹20 / unit
    });

    const preview = await service.generateDailyClosePreview({
      tenantId: 't1',
      locationId: 'l1',
      businessDate: '2026-06-06',
    } as never);

    expect(preview.salesTotal).toBe(50000); // ₹500
    expect(preview.cogsTotal).toBe(20000); // 10 × ₹20 = ₹200
    expect(preview.wasteTotal).toBe(0);
    expect(preview.grossProfit).toBe(30000); // ₹300 → margin 60%, not 100%
  });

  it('falls back to manual salesTotal and zero COGS when no sales captured', async () => {
    const preview = await service.generateDailyClosePreview({
      tenantId: 't1',
      locationId: 'l1',
      businessDate: '2026-06-06',
      salesTotal: 1000,
    } as never);

    expect(preview.salesTotal).toBe(100000); // ₹1000 → paise
    expect(preview.cogsTotal).toBe(0);
    expect(preview.grossProfit).toBe(100000);
  });
});

describe('ReportsService.reconcileByDate', () => {
  const prisma = {
    salesEntry: { findMany: jest.fn() },
    productionOutput: { findMany: jest.fn() },
    wasteEvent: { findMany: jest.fn() },
    productVariant: { findMany: jest.fn() },
    recipe: { findMany: jest.fn() },
    location: { findFirst: jest.fn() },
  } as any;
  const auditService = { log: jest.fn() } as any;
  const recipesService = { calculateRecipeCost: jest.fn() } as any;
  const service = new ReportsService(prisma, auditService, recipesService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.salesEntry.findMany.mockResolvedValue([
      {
        productVariantId: 'v1',
        units: new Prisma.Decimal(10),
        lineRevenue: 500000,
      },
      {
        productVariantId: 'v2',
        units: new Prisma.Decimal(5),
        lineRevenue: 100000,
      },
    ]);
    prisma.productionOutput.findMany.mockResolvedValue([
      {
        outputQty: new Prisma.Decimal(12),
        productionBatch: { recipe: { productVariantId: 'v1' } },
      },
    ]);
    prisma.wasteEvent.findMany.mockResolvedValue([
      { inventoryItemId: 'fg1', quantity: new Prisma.Decimal(2) },
    ]);
    prisma.productVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        sku: 'SKU1',
        name: '500g',
        inventoryItemId: 'fg1',
        product: { name: 'Cake' },
      },
      {
        id: 'v2',
        sku: 'SKU2',
        name: 'each',
        inventoryItemId: null,
        product: { name: 'Bread' },
      },
    ]);
    prisma.recipe.findMany.mockResolvedValue([
      { id: 'r1', productVariantId: 'v1' },
    ]);
    prisma.location.findFirst.mockResolvedValue({ currencyCode: 'INR' });
    recipesService.calculateRecipeCost.mockResolvedValue({
      costPerYieldUnit: new Prisma.Decimal('16.2'),
      costIncomplete: false,
    });
  });

  it('reconciles produced/sold/wasted per SKU with revenue, COGS and profit', async () => {
    const result = await service.reconcileByDate('t1', 'loc1', '2026-06-06');

    expect(result.currencyCode).toBe('INR');
    expect(result.skus).toHaveLength(2);

    const v1 = result.skus.find((s) => s.productVariantId === 'v1')!;
    expect(v1).toMatchObject({
      sku: 'SKU1',
      productName: 'Cake',
      variantName: '500g',
      producedUnits: 12,
      soldUnits: 10,
      wastedUnits: 2,
      revenue: 500000,
      unitCost: 1620, // ₹16.20 in paise
      cogs: 16200, // 10 × ₹16.20
      profit: 483800, // 500000 - 16200
      costIncomplete: false,
    });

    const v2 = result.skus.find((s) => s.productVariantId === 'v2')!;
    expect(v2).toMatchObject({
      sku: 'SKU2',
      producedUnits: 0,
      soldUnits: 5,
      wastedUnits: 0,
      revenue: 100000,
      unitCost: null,
      cogs: null,
      profit: null,
      costIncomplete: true, // no active recipe -> never a silent 0
    });
  });

  it('ranks most profitable SKUs first and rolls up totals', async () => {
    const result = await service.reconcileByDate('t1', 'loc1', '2026-06-06');

    expect(result.skus[0].productVariantId).toBe('v1');
    expect(result.totals).toMatchObject({
      producedUnits: 12,
      soldUnits: 15,
      wastedUnits: 2,
      revenue: 600000,
      cogs: 16200,
      profit: 483800,
    });
    expect(recipesService.calculateRecipeCost).toHaveBeenCalledTimes(1);
  });
});
