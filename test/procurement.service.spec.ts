import { ProcurementService } from '../src/procurement/procurement.service';

describe('ProcurementService', () => {
  let prisma: any;
  let auditService: any;
  let service: ProcurementService;

  beforeEach(() => {
    prisma = {
      goodsReceipt: {
        findFirst: jest.fn(),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'receipt-1', status: 'POSTED' }),
      },
      inventoryLot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'lot-1' }),
      },
      goodsReceiptLine: {
        update: jest.fn(),
      },
      inventoryBalance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'balance-1' }),
        update: jest.fn().mockResolvedValue({ id: 'balance-1' }),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      purchaseOrderLine: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrder: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    auditService = { log: jest.fn() };
    service = new ProcurementService(prisma, auditService);
  });

  it('rejects duplicate goods receipt posting', async () => {
    prisma.goodsReceipt.findFirst.mockResolvedValue({
      id: 'receipt-1',
      status: 'POSTED',
    });

    await expect(
      service.postGoodsReceipt('tenant-1', 'receipt-1'),
    ).rejects.toThrow('Goods receipt cannot be posted twice');
  });

  it('goods receipt increases stock and creates movement', async () => {
    prisma.goodsReceipt.findFirst.mockResolvedValue({
      id: 'receipt-1',
      tenantId: 'tenant-1',
      locationId: 'location-1',
      supplierId: 'supplier-1',
      receivedById: 'user-1',
      receivedAt: new Date(),
      status: 'DRAFT',
      lines: [
        {
          id: 'line-1',
          inventoryItemId: 'item-1',
          acceptedQty: 10,
          unitCost: 4,
          expiryAt: new Date(),
        },
      ],
      purchaseOrder: null,
    });

    await service.postGoodsReceipt('tenant-1', 'receipt-1');

    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'PURCHASE_RECEIPT',
        }),
      }),
    );
  });
});
