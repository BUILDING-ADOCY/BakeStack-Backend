import { Prisma } from '@prisma/client';

import { SalesService } from '../src/sales/sales.service';

describe('SalesService', () => {
  let prisma: any;
  let auditService: any;
  let service: SalesService;

  beforeEach(() => {
    prisma = {
      productVariant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'variant-1',
          tenantId: 'tenant-1',
          defaultSellingPrice: new Prisma.Decimal(50),
          deletedAt: null,
        }),
      },
      location: {
        findFirst: jest.fn().mockResolvedValue({ currencyCode: 'INR' }),
      },
      locationProductVariantSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      salesEntry: {
        upsert: jest
          .fn()
          .mockImplementation(({ create }) =>
            Promise.resolve({ id: 'sale-1', ...create }),
          ),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    auditService = { log: jest.fn() };
    service = new SalesService(prisma, auditService);
  });

  it('computes line revenue in paise and upserts on the business key', async () => {
    const entry = await service.upsertEntry('tenant-1', 'user-1', {
      locationId: 'loc-1',
      productVariantId: 'variant-1',
      businessDate: '2026-06-06',
      units: '3',
      unitSellPrice: '50',
    });

    expect(prisma.salesEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_locationId_businessDate_productVariantId:
            expect.objectContaining({
              tenantId: 'tenant-1',
              locationId: 'loc-1',
              productVariantId: 'variant-1',
            }),
        },
        create: expect.objectContaining({ lineRevenue: 15000 }),
        update: expect.objectContaining({ lineRevenue: 15000 }),
      }),
    );
    expect(entry.lineRevenue).toBe(15000);
  });

  it('defaults the unit sell price from the variant when omitted', async () => {
    await service.upsertEntry('tenant-1', 'user-1', {
      locationId: 'loc-1',
      productVariantId: 'variant-1',
      businessDate: '2026-06-06',
      units: '2',
    });

    // 2 units × ₹50 default = ₹100 = 10000 paise
    expect(prisma.salesEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lineRevenue: 10000 }),
      }),
    );
  });

  it('throws when no price is available', async () => {
    prisma.productVariant.findFirst.mockResolvedValue({
      id: 'variant-1',
      tenantId: 'tenant-1',
      defaultSellingPrice: null,
      deletedAt: null,
    });

    await expect(
      service.upsertEntry('tenant-1', 'user-1', {
        locationId: 'loc-1',
        productVariantId: 'variant-1',
        businessDate: '2026-06-06',
        units: '2',
      }),
    ).rejects.toMatchObject({ code: 'SALES_PRICE_REQUIRED' });
  });

  it('upserts each row of a bulk capture (idempotent per business key)', async () => {
    const result = await service.bulkUpsert('tenant-1', 'user-1', {
      entries: [
        {
          locationId: 'loc-1',
          productVariantId: 'variant-1',
          businessDate: '2026-06-06',
          units: '1',
          unitSellPrice: '50',
        },
        {
          locationId: 'loc-1',
          productVariantId: 'variant-1',
          businessDate: '2026-06-06',
          units: '4',
          unitSellPrice: '50',
        },
      ],
    });

    expect(result.entries).toHaveLength(2);
    expect(prisma.salesEntry.upsert).toHaveBeenCalledTimes(2);
  });
});
