import {
  SupplierMessageChannel,
  SupplierMessageSenderType,
  SupplierMessageStatus,
  SupplierRequestStatus,
} from '@prisma/client';
import {
  SUPPLIER_MESSAGING_PROVIDER_WARNING,
  SupplierMessagingService,
} from '../src/procurement/supplier-messaging.service';

describe('SupplierMessagingService', () => {
  let prisma: any;
  let auditService: any;
  let configService: any;
  let service: SupplierMessagingService;

  beforeEach(() => {
    prisma = {
      supplierRequest: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      supplierMessage: {
        update: jest.fn(),
        create: jest.fn(),
      },
      supplierMessageThread: {
        update: jest.fn(),
      },
      supplier: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      procurementRequest: {
        update: jest.fn(),
      },
      purchaseOrder: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    auditService = { log: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | undefined> = {
          APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
          APPWRITE_PROJECT_ID: 'project-id',
          APPWRITE_API_KEY: undefined,
        };
        return values[key];
      }),
    };
    service = new SupplierMessagingService(prisma, auditService, configService);
  });

  it('keeps the draft and marks provider-not-configured when Appwrite Messaging is not configured', async () => {
    prisma.supplierRequest.findFirst.mockResolvedValue({
      id: 'supplier-request-1',
      tenantId: 'tenant-1',
      supplierId: 'supplier-1',
      procurementRequestId: 'procurement-1',
      supplierRequestNumber: 'PR-1-S01',
      status: SupplierRequestStatus.READY_TO_SEND,
      messageChannel: SupplierMessageChannel.EMAIL,
      supplier: {
        id: 'supplier-1',
        name: 'FreshMill',
        email: 'orders@freshmill.example',
      },
      procurementRequest: {
        id: 'procurement-1',
        requestNumber: 'PR-1',
        requiredDate: new Date('2026-06-01T00:00:00.000Z'),
        locationId: 'location-1',
        location: { id: 'location-1', name: 'Main Kitchen' },
      },
      items: [],
      thread: {
        id: 'thread-1',
        subject: 'Procurement Request PR-1 - Main Kitchen',
        messages: [
          {
            id: 'message-1',
            senderType: SupplierMessageSenderType.BAKERY_USER,
            messageStatus: SupplierMessageStatus.DRAFT,
            messageBody: 'Draft body',
            messageBodyText: 'Draft body',
            messageBodyHtml: '<p>Draft body</p>',
          },
        ],
      },
    });

    const result = (await service.sendSupplierRequestMessage(
      'tenant-1',
      'supplier-request-1',
      'user-1',
    )) as { warning?: string };

    expect(result.warning).toBe(SUPPLIER_MESSAGING_PROVIDER_WARNING);
    expect(prisma.supplierMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'message-1' },
        data: expect.objectContaining({
          messageStatus: SupplierMessageStatus.FAILED_PROVIDER_NOT_CONFIGURED,
          failureReason: SUPPLIER_MESSAGING_PROVIDER_WARNING,
        }),
      }),
    );
    expect(prisma.supplierRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'supplier-request-1' },
        data: expect.objectContaining({
          status: SupplierRequestStatus.READY_TO_SEND,
          messageStatus: SupplierMessageStatus.FAILED_PROVIDER_NOT_CONFIGURED,
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUPPLIER_MESSAGE_FAILED',
      }),
      prisma,
    );
  });
});
