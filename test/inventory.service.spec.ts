import { Prisma } from '@prisma/client';
import { InventoryService } from '../src/inventory/inventory.service';

describe('InventoryService', () => {
  let prisma: any;
  let auditService: any;
  let service: InventoryService;

  beforeEach(() => {
    prisma = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          tenantId: 'tenant-1',
          name: 'Flour',
          type: 'RAW_MATERIAL',
          defaultUom: 'kg',
          unitCost: new Prisma.Decimal(2.5),
          reorderLevel: new Prisma.Decimal(5),
          shelfLifeDays: 30,
          isPerishable: true,
        }),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      inventoryLot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'lot-1' }),
      },
      inventoryBalance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'balance-1',
          onHandQty: new Prisma.Decimal(20),
          reservedQty: new Prisma.Decimal(0),
          availableQty: new Prisma.Decimal(20),
          lotId: null,
          updatedAt: new Date('2026-05-09T00:00:00.000Z'),
          lot: null,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'balance-1',
            onHandQty: new Prisma.Decimal(20),
            reservedQty: new Prisma.Decimal(0),
            availableQty: new Prisma.Decimal(20),
            lotId: null,
            updatedAt: new Date('2026-05-09T00:00:00.000Z'),
            lot: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: 'balance-1' }),
        create: jest.fn().mockResolvedValue({ id: 'balance-1' }),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      inventoryImport: {
        create: jest.fn().mockResolvedValue({
          id: 'import-1',
        }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'import-1',
          tenantId: 'tenant-1',
          locationId: 'location-1',
          uploadedById: 'user-1',
          fileName: 'inventory.csv',
          contentType: 'text/csv',
          fileSizeBytes: 128,
          status: data.status,
          totalRows: 1,
          processedRows: data.processedRows,
          createdItemsCount: data.createdItemsCount,
          updatedItemsCount: data.updatedItemsCount,
          openingStockRowsCount: data.openingStockRowsCount,
          errorCount: data.errorCount,
          summaryJson: data.summaryJson,
          createdAt: new Date('2026-05-09T00:00:00.000Z'),
          updatedAt: new Date('2026-05-09T00:00:00.000Z'),
          location: {
            id: 'location-1',
            name: 'Main Kitchen',
            type: 'BAKERY',
          },
          uploadedBy: {
            id: 'user-1',
            displayName: 'Owner',
            email: 'owner@bakestack.demo',
          },
        })),
      },
      location: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'location-1',
          tenantId: 'tenant-1',
          name: 'Main Kitchen',
        }),
      },
      wasteEvent: {
        create: jest.fn().mockResolvedValue({ id: 'waste-1' }),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    auditService = { log: jest.fn() };
    service = new InventoryService(prisma, auditService);
  });

  it('opening stock creates inventory movement', async () => {
    await service.recordOpeningStock({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      inventoryItemId: 'item-1',
      quantity: 12,
      createdById: 'user-1',
    });

    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'OPENING_STOCK',
        }),
      }),
    );
    expect(prisma.inventoryLot.create).not.toHaveBeenCalled();
  });

  it('adjustment can consume opening stock without explicit lot details', async () => {
    prisma.inventoryBalance.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'balance-1',
        onHandQty: new Prisma.Decimal(12),
        reservedQty: new Prisma.Decimal(0),
        availableQty: new Prisma.Decimal(12),
      });

    await service.recordOpeningStock({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      inventoryItemId: 'item-1',
      quantity: 12,
      createdById: 'user-1',
    });

    await service.adjustStock({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      inventoryItemId: 'item-1',
      quantity: 5,
      adjustmentType: 'DECREASE',
      reason: 'Cycle count correction',
      createdById: 'user-1',
    });

    expect(prisma.inventoryMovement.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'STOCK_ADJUSTMENT',
          lotId: null,
          quantity: new Prisma.Decimal(-5),
        }),
      }),
    );
  });

  it('wastage reduces stock and creates movement', async () => {
    await service.recordWastage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      inventoryItemId: 'item-1',
      quantity: 5,
      uom: 'kg',
      reasonCode: 'DAMAGED',
      recordedById: 'user-1',
    });

    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'WASTAGE',
        }),
      }),
    );
    expect(prisma.wasteEvent.create).toHaveBeenCalled();
  });

  it('wastage resolves the only available lot when lotId is omitted', async () => {
    prisma.inventoryBalance.findMany.mockResolvedValueOnce([
      {
        id: 'balance-lot-1',
        onHandQty: new Prisma.Decimal(8),
        reservedQty: new Prisma.Decimal(0),
        availableQty: new Prisma.Decimal(8),
        lotId: 'lot-1',
        updatedAt: new Date('2026-05-09T00:00:00.000Z'),
        lot: {
          expiryAt: new Date('2026-05-12T00:00:00.000Z'),
        },
      },
    ]);
    prisma.inventoryBalance.findFirst.mockResolvedValueOnce({
      id: 'balance-lot-1',
      onHandQty: new Prisma.Decimal(8),
      reservedQty: new Prisma.Decimal(0),
      availableQty: new Prisma.Decimal(8),
      lotId: 'lot-1',
      updatedAt: new Date('2026-05-09T00:00:00.000Z'),
      lot: {
        expiryAt: new Date('2026-05-12T00:00:00.000Z'),
      },
    });

    await service.recordWastage({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      inventoryItemId: 'item-1',
      quantity: 2,
      uom: 'piece',
      reasonCode: 'DAMAGED',
      recordedById: 'user-1',
    });

    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'WASTAGE',
          lotId: 'lot-1',
        }),
      }),
    );
    expect(prisma.wasteEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lotId: 'lot-1',
        }),
      }),
    );
  });

  it('imports inventory rows and records opening stock', async () => {
    prisma.inventoryItem.findFirst.mockResolvedValueOnce(null);
    prisma.inventoryItem.create.mockResolvedValue({
      id: 'item-import-1',
      tenantId: 'tenant-1',
      name: 'Cake Box 500g',
      type: 'PACKAGING',
      defaultUom: 'pcs',
      unitCost: new Prisma.Decimal(8.5),
      reorderLevel: new Prisma.Decimal(50),
      shelfLifeDays: null,
      isPerishable: false,
    });
    prisma.inventoryBalance.findFirst.mockResolvedValueOnce(null);

    const job = await service.importFile(
      {
        tenantId: 'tenant-1',
        locationId: 'location-1',
        uploadedById: 'user-1',
      },
      {
        originalname: 'inventory.csv',
        mimetype: 'text/csv',
        size: 128,
        buffer: Buffer.from(
          [
            'itemName,type,defaultUom,unitCost,reorderLevel,isPerishable,openingQty,supplierBatchNo',
            'Cake Box 500g,PACKAGING,pcs,8.5,50,false,120,BOX-500-A',
          ].join('\n'),
          'utf8',
        ),
      } as Express.Multer.File,
    );

    expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Cake Box 500g',
          type: 'PACKAGING',
        }),
      }),
    );
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'OPENING_STOCK',
          referenceType: 'InventoryImport',
          referenceId: 'import-1',
        }),
      }),
    );
    expect(job.status).toBe('COMPLETED');
    expect(job.createdItemsCount).toBe(1);
    expect(job.openingStockRowsCount).toBe(1);
  });

  it('captures row errors during import when continueOnError is enabled', async () => {
    prisma.inventoryImport.update.mockImplementation(({ data }: any) => ({
      id: 'import-1',
      tenantId: 'tenant-1',
      locationId: 'location-1',
      uploadedById: 'user-1',
      fileName: 'inventory-errors.csv',
      contentType: 'text/csv',
      fileSizeBytes: 256,
      status: data.status,
      totalRows: 2,
      processedRows: data.processedRows,
      createdItemsCount: data.createdItemsCount,
      updatedItemsCount: data.updatedItemsCount,
      openingStockRowsCount: data.openingStockRowsCount,
      errorCount: data.errorCount,
      summaryJson: data.summaryJson,
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
      updatedAt: new Date('2026-05-09T00:00:00.000Z'),
      location: {
        id: 'location-1',
        name: 'Main Kitchen',
        type: 'BAKERY',
      },
      uploadedBy: {
        id: 'user-1',
        displayName: 'Owner',
        email: 'owner@bakestack.demo',
      },
    }));
    prisma.inventoryItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.inventoryItem.create.mockResolvedValue({
      id: 'item-import-2',
      tenantId: 'tenant-1',
      name: 'Vanilla Essence',
      type: 'RAW_MATERIAL',
      defaultUom: 'ltr',
      unitCost: new Prisma.Decimal(140),
      reorderLevel: null,
      shelfLifeDays: null,
      isPerishable: false,
    });

    const job = await service.importFile(
      {
        tenantId: 'tenant-1',
        locationId: 'location-1',
        uploadedById: 'user-1',
        continueOnError: true,
      },
      {
        originalname: 'inventory-errors.csv',
        mimetype: 'text/csv',
        size: 256,
        buffer: Buffer.from(
          [
            'itemName,type,defaultUom,unitCost,openingQty',
            'Broken Row,,kg,20,10',
            'Vanilla Essence,RAW_MATERIAL,ltr,140,0',
          ].join('\n'),
          'utf8',
        ),
      } as Express.Multer.File,
    );

    expect(job.status).toBe('COMPLETED_WITH_ERRORS');
    expect(job.processedRows).toBe(1);
    expect(job.errorCount).toBe(1);
    const summary = job.summaryJson as {
      errors?: Array<{ rowNumber: number }>;
    } | null;
    expect(summary?.errors?.[0]?.rowNumber).toBe(2);
  });
});
