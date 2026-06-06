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
