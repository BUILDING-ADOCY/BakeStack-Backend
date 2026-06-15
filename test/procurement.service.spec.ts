import { ProcurementService } from '../src/procurement/procurement.service';

describe('ProcurementService', () => {
  let prisma: any;
  let auditService: any;
  let supplierMessagingService: any;
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
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'balance-1' }),
        update: jest.fn().mockResolvedValue({ id: 'balance-1' }),
      },
      locationInventoryItemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      purchaseOrderLine: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      purchaseOrder: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      location: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'location-1',
          currencyCode: 'INR',
        }),
      },
      inventoryItem: {
        findMany: jest.fn(),
      },
      supplierItem: {
        findMany: jest.fn(),
      },
      procurementRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      procurementRequestItem: {
        create: jest.fn(),
        update: jest.fn(),
      },
      supplierRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      supplierRequestItem: {
        update: jest.fn(),
      },
      supplierMessageThread: {
        create: jest.fn(),
        update: jest.fn(),
      },
      supplierMessage: {
        create: jest.fn().mockResolvedValue({ id: 'message-1' }),
        update: jest.fn(),
      },
      supplierQuotation: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    auditService = { log: jest.fn() };
    supplierMessagingService = {
      sendSupplierRequestMessage: jest.fn(),
      sendSupplierReminderMessage: jest.fn(),
      sendPurchaseOrderConfirmation: jest.fn(),
      notifyInternalTeamOnSupplierResponse: jest.fn(),
    };
    service = new ProcurementService(
      prisma,
      auditService,
      supplierMessagingService,
    );
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
      currencyCode: 'INR',
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

  it('creates supplier requests and message drafts from procurement demand', async () => {
    prisma.location.findFirst.mockResolvedValue({
      id: 'location-1',
      name: 'Main Kitchen',
      addressLine1: '12 Market St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94103',
    });
    prisma.inventoryItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Flour',
        defaultUom: 'kg',
        deletedAt: null,
      },
    ]);
    prisma.supplierItem.findMany.mockResolvedValue([
      {
        id: 'supplier-item-1',
        tenantId: 'tenant-1',
        supplierId: 'supplier-1',
        inventoryItemId: 'item-1',
        supplier: {
          id: 'supplier-1',
          name: 'FreshMill',
          email: 'orders@freshmill.example',
        },
        inventoryItem: {
          id: 'item-1',
          name: 'Flour',
        },
      },
    ]);
    prisma.procurementRequest.create.mockResolvedValue({
      id: 'request-1',
      requestNumber: 'PR-1',
    });
    prisma.procurementRequestItem.create.mockResolvedValue({
      id: 'request-item-1',
      tenantId: 'tenant-1',
      procurementRequestId: 'request-1',
      inventoryItemId: 'item-1',
      requiredQuantity: 25,
      unit: 'kg',
    });
    prisma.supplierRequest.create.mockResolvedValue({
      id: 'supplier-request-1',
      items: [],
    });
    prisma.supplierMessageThread.create.mockResolvedValue({
      id: 'thread-1',
    });
    prisma.procurementRequest.findFirst.mockResolvedValue({
      id: 'request-1',
      tenantId: 'tenant-1',
      requestNumber: 'PR-1',
      items: [],
      supplierRequests: [],
      purchaseOrders: [],
    });

    await service.createProcurementRequest({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      requiredDate: '2026-06-01T00:00:00.000Z',
      createdById: 'user-1',
      items: [
        {
          inventoryItemId: 'item-1',
          requiredQuantity: 25,
          unit: 'kg',
        },
      ],
    });

    expect(prisma.supplierRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierId: 'supplier-1',
          status: 'READY_TO_SEND',
        }),
      }),
    );
    expect(prisma.supplierMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageStatus: 'DRAFT',
          messageBody: expect.stringContaining('Flour'),
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROCUREMENT_CREATED',
      }),
      prisma,
    );
  });
});
