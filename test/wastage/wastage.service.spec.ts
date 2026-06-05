import { Prisma, WasteReasonCode } from '@prisma/client';
import * as inventoryLedger from '../../src/common/prisma/inventory-ledger';
import { WastageService } from '../../src/wastage/wastage.service';

describe('WastageService', () => {
  let prisma: any;
  let auditService: any;
  let idempotencyService: any;
  let service: WastageService;
  let applyInventoryDeltaSpy: jest.SpyInstance;

  const baseEvent = {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    locationId: '33333333-3333-4333-8333-333333333333',
    inventoryItemId: '44444444-4444-4444-8444-444444444444',
    lotId: null,
    productionBatchId: null,
    quantity: new Prisma.Decimal(2),
    uom: 'kg',
    reasonCode: WasteReasonCode.DAMAGED,
    notes: null,
    costImpact: 1000, // amount in minor units (paise): ₹10
    recordedById: '55555555-5555-4555-8555-555555555555',
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    createdAt: new Date('2026-05-22T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      location: {
        findFirst: jest.fn().mockResolvedValue({
          id: baseEvent.locationId,
          tenantId: baseEvent.tenantId,
          isActive: true,
          name: 'Main Store',
          currencyCode: 'INR',
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: baseEvent.locationId, name: 'Main Store', isActive: true },
          ]),
      },
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: baseEvent.inventoryItemId,
          tenantId: baseEvent.tenantId,
          name: 'Flour',
          unitCost: new Prisma.Decimal(5),
          defaultUom: 'kg',
          deletedAt: null,
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: baseEvent.inventoryItemId, name: 'Flour' },
          ]),
      },
      inventoryLot: {
        findFirst: jest.fn().mockResolvedValue({
          id: '66666666-6666-4666-8666-666666666666',
          tenantId: baseEvent.tenantId,
          inventoryItemId: baseEvent.inventoryItemId,
        }),
      },
      inventoryBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'balance-1',
            tenantId: baseEvent.tenantId,
            locationId: baseEvent.locationId,
            inventoryItemId: baseEvent.inventoryItemId,
            lotId: null,
            availableQty: new Prisma.Decimal(10),
            onHandQty: new Prisma.Decimal(10),
            reservedQty: new Prisma.Decimal(0),
          },
        ]),
      },
      inventoryMovement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      locationInventoryItemSetting: {
        findMany: jest.fn().mockResolvedValue([
          {
            inventoryItemId: baseEvent.inventoryItemId,
            unitCost: new Prisma.Decimal(5),
            currencyCode: 'INR',
          },
        ]),
      },
      productionBatch: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      productionOutput: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      wasteEvent: {
        create: jest.fn().mockResolvedValue(baseEvent),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...baseEvent,
          inventoryItem: { id: baseEvent.inventoryItemId, name: 'Flour' },
          location: { id: baseEvent.locationId, name: 'Main Store' },
          lot: null,
          productionBatch: null,
          recordedBy: null,
          voidedBy: null,
        }),
        findFirst: jest.fn().mockResolvedValue(baseEvent),
        update: jest.fn().mockResolvedValue({
          ...baseEvent,
          voidedAt: new Date('2026-05-22T01:00:00.000Z'),
          voidedById: baseEvent.recordedById,
          voidReason: 'Duplicate entry',
        }),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      idempotencyKey: {
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    auditService = { log: jest.fn() };
    idempotencyService = { findExisting: jest.fn().mockResolvedValue(null) };
    service = new WastageService(prisma, auditService, idempotencyService);
    applyInventoryDeltaSpy = jest
      .spyOn(inventoryLedger, 'applyInventoryDelta')
      .mockResolvedValue({
        balance: { id: 'balance-1' },
        movement: { id: 'movement-1' },
      } as any);
  });

  afterEach(() => {
    applyInventoryDeltaSpy.mockRestore();
  });

  it('recordWasteEvent with lotId uses lot cost and writes one negative ledger delta', async () => {
    prisma.inventoryBalance.findMany.mockResolvedValue([
      {
        id: 'balance-lot',
        lotId: '66666666-6666-4666-8666-666666666666',
        availableQty: new Prisma.Decimal(8),
      },
    ]);
    prisma.inventoryMovement.findMany.mockResolvedValue([
      {
        quantity: new Prisma.Decimal(10),
        totalCost: new Prisma.Decimal(70),
      },
    ]);

    await service.recordWasteEvent(baseEvent.tenantId, baseEvent.recordedById, {
      locationId: baseEvent.locationId,
      inventoryItemId: baseEvent.inventoryItemId,
      lotId: '66666666-6666-4666-8666-666666666666',
      quantity: '2',
      uom: 'kg',
      reasonCode: WasteReasonCode.DAMAGED,
    });

    expect(applyInventoryDeltaSpy).toHaveBeenCalledTimes(1);
    expect(applyInventoryDeltaSpy).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        quantityDelta: new Prisma.Decimal(-2),
        unitCost: new Prisma.Decimal(7),
        movementType: 'WASTAGE',
        referenceType: 'WasteEvent',
      }),
    );
  });

  it('recordWasteEvent without lotId uses weighted-average item cost', async () => {
    await service.recordWasteEvent(baseEvent.tenantId, baseEvent.recordedById, {
      locationId: baseEvent.locationId,
      inventoryItemId: baseEvent.inventoryItemId,
      quantity: '3',
      uom: 'kg',
      reasonCode: WasteReasonCode.OTHER,
    });

    expect(prisma.wasteEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costImpact: 1500, // amount in minor units (paise): 3kg × ₹5
          lotId: null,
        }),
      }),
    );
  });

  it('insufficient stock throws WASTAGE_INSUFFICIENT_STOCK', async () => {
    prisma.inventoryBalance.findMany.mockResolvedValue([
      { lotId: null, availableQty: new Prisma.Decimal(1) },
    ]);

    await expect(
      service.recordWasteEvent(baseEvent.tenantId, baseEvent.recordedById, {
        locationId: baseEvent.locationId,
        inventoryItemId: baseEvent.inventoryItemId,
        quantity: '3',
        uom: 'kg',
        reasonCode: WasteReasonCode.OTHER,
      }),
    ).rejects.toMatchObject({
      code: 'WASTAGE_INSUFFICIENT_STOCK',
    });
  });

  it('no inventory balance throws WASTAGE_NO_STOCK_BASIS', async () => {
    prisma.inventoryBalance.findMany.mockResolvedValue([]);

    await expect(
      service.recordWasteEvent(baseEvent.tenantId, baseEvent.recordedById, {
        locationId: baseEvent.locationId,
        inventoryItemId: baseEvent.inventoryItemId,
        quantity: '3',
        uom: 'kg',
        reasonCode: WasteReasonCode.OTHER,
      }),
    ).rejects.toMatchObject({
      code: 'WASTAGE_NO_STOCK_BASIS',
    });
  });

  it('lot mismatch throws WASTAGE_LOT_MISMATCH', async () => {
    prisma.inventoryLot.findFirst.mockResolvedValue(null);

    await expect(
      service.recordWasteEvent(baseEvent.tenantId, baseEvent.recordedById, {
        locationId: baseEvent.locationId,
        inventoryItemId: baseEvent.inventoryItemId,
        lotId: '66666666-6666-4666-8666-666666666666',
        quantity: '2',
        uom: 'kg',
        reasonCode: WasteReasonCode.DAMAGED,
      }),
    ).rejects.toMatchObject({
      code: 'WASTAGE_LOT_MISMATCH',
    });
  });

  it('voidWasteEvent writes a positive compensating delta and marks the row voided', async () => {
    await service.voidWasteEvent(
      baseEvent.tenantId,
      baseEvent.recordedById,
      baseEvent.id,
      {
        reason: 'Duplicate entry',
      },
    );

    expect(applyInventoryDeltaSpy).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        quantityDelta: baseEvent.quantity,
        unitCost: new Prisma.Decimal(5),
        referenceType: 'WasteEventVoid',
      }),
    );
    expect(prisma.wasteEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          voidedById: baseEvent.recordedById,
          voidReason: 'Duplicate entry',
        }),
      }),
    );
  });

  it('getSummary returns correct totals and prior-period percent change', async () => {
    prisma.wasteEvent.aggregate
      .mockResolvedValueOnce({
        _sum: {
          costImpact: new Prisma.Decimal(60),
          quantity: new Prisma.Decimal(12),
        },
        _count: { _all: 6 },
      })
      .mockResolvedValueOnce({
        _sum: { costImpact: new Prisma.Decimal(40) },
      });
    prisma.wasteEvent.groupBy
      .mockResolvedValueOnce([
        {
          reasonCode: WasteReasonCode.OVERPRODUCTION,
          _sum: { costImpact: new Prisma.Decimal(45) },
          _count: { _all: 4 },
        },
      ])
      .mockResolvedValueOnce([
        {
          inventoryItemId: baseEvent.inventoryItemId,
          uom: 'kg',
          _sum: {
            costImpact: new Prisma.Decimal(60),
            quantity: new Prisma.Decimal(12),
          },
          _count: { _all: 6 },
        },
      ]);

    const summary = await service.getSummary(baseEvent.tenantId, {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-07T23:59:59.999Z',
    });

    expect(summary.totalCost).toBe('60');
    expect(summary.eventCount).toBe(6);
    expect(summary.comparisonToPriorPeriod.percentChange).toBe(50);
    expect(summary.byReasonCode[0]).toEqual({
      reasonCode: WasteReasonCode.OVERPRODUCTION,
      totalCost: '45',
      eventCount: 4,
    });
  });

  it('getInsights returns OVERPRODUCTION_HIGH when threshold is crossed', async () => {
    prisma.wasteEvent.aggregate
      .mockResolvedValueOnce({
        _sum: { costImpact: new Prisma.Decimal(100) },
        _count: { _all: 8 },
      })
      .mockResolvedValueOnce({
        _sum: { costImpact: new Prisma.Decimal(50) },
      })
      .mockResolvedValueOnce({
        _sum: { costImpact: new Prisma.Decimal(50) },
      });
    prisma.wasteEvent.groupBy
      .mockResolvedValueOnce([
        {
          reasonCode: WasteReasonCode.OVERPRODUCTION,
          _sum: { costImpact: new Prisma.Decimal(40) },
          _count: { _all: 4 },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.location.findMany.mockResolvedValue([
      { id: baseEvent.locationId, name: 'Main' },
    ]);

    const insights = await service.getInsights(baseEvent.tenantId, {
      days: 14,
    });

    expect(insights.map((insight) => insight.type)).toContain(
      'OVERPRODUCTION_HIGH',
    );
  });
});
