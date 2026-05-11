import { Prisma } from '@prisma/client';
import { QcService } from '../src/qc/qc.service';

describe('QcService', () => {
  let prisma: any;
  let auditService: any;
  let service: QcService;

  beforeEach(() => {
    prisma = {
      qCCheck: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'qc-1',
          tenantId: 'tenant-1',
          locationId: 'location-1',
          productionBatchId: 'batch-1',
          inventoryLotId: null,
          status: 'HOLD',
          score: new Prisma.Decimal(82),
          notes: 'Texture issue',
          imageUrl: null,
          checkedById: 'user-1',
          createdAt: new Date('2026-05-11T00:00:00.000Z'),
          checkedBy: {
            id: 'user-1',
            displayName: 'Owner',
          },
          inventoryLot: null,
          location: {
            id: 'location-1',
            name: 'Main Kitchen',
          },
          productionBatch: {
            id: 'batch-1',
            batchNumber: 'BATCH-001',
            recipe: {
              id: 'recipe-1',
              productVariant: {
                id: 'variant-1',
                name: 'Milk Bun Standard',
              },
            },
          },
        }),
      },
      location: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'location-1',
          tenantId: 'tenant-1',
        }),
      },
      productionBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'batch-1',
          tenantId: 'tenant-1',
          locationId: 'location-1',
          status: 'COMPLETED',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'batch-1',
          status: 'QC_HOLD',
        }),
      },
      inventoryLot: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    auditService = {
      log: jest.fn(),
    };

    service = new QcService(prisma, auditService);
  });

  it('lists QC checks scoped by tenant and optional filters', async () => {
    await service.list('tenant-1', {
      locationId: 'location-1',
      status: 'HOLD',
    });

    expect(prisma.qCCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          locationId: 'location-1',
          status: 'HOLD',
        }),
      }),
    );
  });

  it('records a QC hold and moves the batch to QC_HOLD', async () => {
    const result = await service.create('tenant-1', 'user-1', 'corr-1', {
      locationId: 'location-1',
      productionBatchId: 'batch-1',
      status: 'HOLD',
      score: 82,
      notes: 'Texture issue',
    });

    expect(prisma.qCCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          locationId: 'location-1',
          productionBatchId: 'batch-1',
          checkedById: 'user-1',
          status: 'HOLD',
        }),
      }),
    );
    expect(prisma.productionBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'QC_HOLD' },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'qc.check_recorded',
      }),
      prisma,
    );
    expect(result.id).toBe('qc-1');
  });
});
