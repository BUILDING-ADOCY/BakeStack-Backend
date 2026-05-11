import { Prisma } from '@prisma/client';
import { ProductionService } from '../src/production/production.service';

describe('ProductionService', () => {
  let prisma: any;
  let recipesService: any;
  let auditService: any;
  let service: ProductionService;

  beforeEach(() => {
    prisma = {
      productionBatch: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'batch-1' }),
      },
      inventoryBalance: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: 'balance-1',
          onHandQty: new Prisma.Decimal(10),
          reservedQty: new Prisma.Decimal(0),
          availableQty: new Prisma.Decimal(10),
        }),
        create: jest.fn().mockResolvedValue({ id: 'balance-1' }),
        update: jest.fn().mockResolvedValue({ id: 'balance-1' }),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      inventoryLot: {
        create: jest.fn().mockResolvedValue({ id: 'lot-1' }),
      },
      productionConsumption: {
        update: jest.fn(),
      },
      productionBatchItem: {
        updateMany: jest.fn(),
      },
      productionOutput: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    recipesService = { calculateRequiredIngredients: jest.fn() };
    auditService = { log: jest.fn() };
    service = new ProductionService(prisma, recipesService, auditService);
  });

  it('production batch cannot start before approval', async () => {
    prisma.productionBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      tenantId: 'tenant-1',
      status: 'PLANNED',
      consumptions: [],
    });

    await expect(
      service.startBatch('batch-1', { tenantId: 'tenant-1' }),
    ).rejects.toThrow('Production batch cannot start without approval');
  });

  it('production batch start deducts ingredients', async () => {
    prisma.productionBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      tenantId: 'tenant-1',
      locationId: 'location-1',
      status: 'APPROVED',
      consumptions: [
        {
          id: 'consumption-1',
          inventoryItemId: 'item-1',
          requiredQty: new Prisma.Decimal(5),
          inventoryItem: { unitCost: new Prisma.Decimal(2) },
        },
      ],
    });
    prisma.inventoryBalance.findMany
      .mockResolvedValueOnce([{ availableQty: new Prisma.Decimal(10) }])
      .mockResolvedValueOnce([
        { lotId: 'lot-1', availableQty: new Prisma.Decimal(10) },
      ]);

    await service.startBatch('batch-1', {
      tenantId: 'tenant-1',
      actorId: 'user-1',
    });

    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'PRODUCTION_CONSUMPTION',
        }),
      }),
    );
  });

  it('production batch completion adds finished goods', async () => {
    prisma.productionBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      tenantId: 'tenant-1',
      locationId: 'location-1',
      plannedQty: new Prisma.Decimal(12),
      status: 'IN_PROGRESS',
      recipe: {
        productVariant: {
          inventoryItemId: 'fg-1',
          unit: 'each',
        },
      },
      consumptions: [{ totalCost: new Prisma.Decimal(24) }],
      items: [],
    });

    await service.completeBatch('batch-1', {
      tenantId: 'tenant-1',
      actorId: 'user-1',
      actualOutputQty: 12,
    });

    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'PRODUCTION_OUTPUT',
        }),
      }),
    );
    expect(prisma.productionOutput.create).toHaveBeenCalled();
  });

  it('completed batch cannot be cancelled', async () => {
    prisma.productionBatch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'COMPLETED',
    });

    await expect(
      service.cancelBatch('batch-1', { tenantId: 'tenant-1' }),
    ).rejects.toThrow('Only planned or approved batches can be cancelled');
  });
});
