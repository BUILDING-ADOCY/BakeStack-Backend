import { Injectable } from '@nestjs/common';
import {
  GoodsReceiptStatus,
  InventoryMovementType,
  Prisma,
  ProcurementRequestItemStatus,
  ProcurementRequestStatus,
  PurchaseOrderStatus,
  SupplierMessageChannel,
  SupplierMessageSenderType,
  SupplierMessageStatus,
  SupplierQuotationStatus,
  SupplierRequestStatus,
  type ProcurementRequestItem,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import {
  applyInventoryDelta,
  InventoryExecutor,
} from '../common/prisma/inventory-ledger';
import {
  requireLocationCurrency,
  requireSupplierItemMoneySettings,
} from '../common/prisma/location-money';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { AddSupplierResponseDto } from './dto/add-supplier-response.dto';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreateProcurementRequestDto } from './dto/create-procurement-request.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceiveSupplierRequestGoodsDto } from './dto/receive-supplier-request-goods.dto';
import {
  AcceptSupplierQuotationDto,
  RejectSupplierQuotationDto,
} from './dto/supplier-quotation-action.dto';
import { SupplierMessagingService } from './supplier-messaging.service';

const supplierRequestInclude = {
  supplier: true,
  procurementRequest: {
    include: {
      location: true,
    },
  },
  items: {
    include: {
      inventoryItem: true,
      supplierItem: true,
      procurementRequestItem: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  thread: {
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  quotations: {
    orderBy: { createdAt: 'desc' },
  },
  purchaseOrders: {
    include: {
      lines: true,
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.SupplierRequestInclude;

const purchaseOrderInclude = {
  supplier: true,
  location: true,
  lines: {
    include: {
      inventoryItem: true,
      supplierItem: true,
    },
  },
  goodsReceipts: {
    include: {
      supplier: true,
      lines: {
        include: {
          inventoryItem: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.PurchaseOrderInclude;

const openProcurementStatuses = [
  ProcurementRequestStatus.DRAFT,
  ProcurementRequestStatus.PENDING_APPROVAL,
  ProcurementRequestStatus.SUPPLIER_REQUEST_CREATED,
  ProcurementRequestStatus.SUPPLIER_MESSAGE_SENT,
  ProcurementRequestStatus.SUPPLIER_RESPONDED,
  ProcurementRequestStatus.QUOTATION_RECEIVED,
  ProcurementRequestStatus.CONFIRMED,
  ProcurementRequestStatus.PARTIALLY_RECEIVED,
];

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly supplierMessagingService: SupplierMessagingService,
  ) {}

  async createProcurementRequest(dto: CreateProcurementRequestDto) {
    const location = await this.prisma.location.findFirst({
      where: { tenantId: dto.tenantId, id: dto.locationId, isActive: true },
    });

    if (!location) {
      throw new DomainException(
        'LOCATION_NOT_FOUND',
        'Delivery location not found for this tenant',
        404,
      );
    }
    const currencyCode = location.currencyCode;

    const inventoryIds = [
      ...new Set(dto.items.map((item) => item.inventoryItemId)),
    ];
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        tenantId: dto.tenantId,
        id: { in: inventoryIds },
        deletedAt: null,
      },
    });
    const inventoryById = new Map(
      inventoryItems.map((item) => [item.id, item]),
    );

    if (inventoryItems.length !== inventoryIds.length) {
      throw new DomainException(
        'PROCUREMENT_ITEM_NOT_FOUND',
        'One or more requested inventory items do not exist for this tenant',
        400,
      );
    }

    await this.assertNoDuplicateOpenProcurement(
      dto.tenantId,
      dto.locationId,
      new Date(dto.requiredDate),
      inventoryIds,
    );

    const supplierItems = await this.prisma.supplierItem.findMany({
      where: {
        tenantId: dto.tenantId,
        inventoryItemId: { in: inventoryIds },
        supplier: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      include: {
        supplier: true,
        inventoryItem: true,
      },
      orderBy: [{ currentPrice: 'asc' }, { createdAt: 'asc' }],
    });

    const chosenSupplierItems = dto.items.map((item) =>
      this.chooseSupplierItem(
        item.inventoryItemId,
        item.preferredSupplierId,
        supplierItems,
      ),
    );

    const requestNumber = `PR-${Date.now()}`;
    const createdRequest = await this.prisma.$transaction(async (tx) => {
      const request = await tx.procurementRequest.create({
        data: {
          tenantId: dto.tenantId,
          locationId: dto.locationId,
          requestNumber,
          sourceType: dto.sourceType ?? 'MANUAL',
          requiredDate: new Date(dto.requiredDate),
          priority: dto.priority ?? 'NORMAL',
          status: ProcurementRequestStatus.DRAFT,
          createdById: dto.createdById,
          notes: dto.notes,
        },
      });

      const requestItems: ProcurementRequestItem[] = [];
      for (const [index, item] of dto.items.entries()) {
        const chosenSupplierItem = chosenSupplierItems[index];
        requestItems.push(
          await tx.procurementRequestItem.create({
            data: {
              tenantId: dto.tenantId,
              procurementRequestId: request.id,
              inventoryItemId: item.inventoryItemId,
              requiredQuantity: decimal(item.requiredQuantity),
              unit: item.unit,
              estimatedPrice:
                item.estimatedPrice === undefined
                  ? undefined
                  : decimal(item.estimatedPrice),
              currencyCode,
              preferredSupplierId:
                chosenSupplierItem?.supplierId ?? item.preferredSupplierId,
              status: chosenSupplierItem
                ? ProcurementRequestItemStatus.ASSIGNED
                : ProcurementRequestItemStatus.UNASSIGNED,
            },
          }),
        );
      }

      const groups = new Map<
        string,
        Array<{
          requestItem: (typeof requestItems)[number];
          supplierItem: (typeof supplierItems)[number];
        }>
      >();

      chosenSupplierItems.forEach((supplierItem, index) => {
        if (!supplierItem) return;
        const current = groups.get(supplierItem.supplierId) ?? [];
        current.push({
          requestItem: requestItems[index],
          supplierItem,
        });
        groups.set(supplierItem.supplierId, current);
      });

      let supplierRequestIndex = 1;
      for (const [supplierId, groupItems] of groups.entries()) {
        const supplier = groupItems[0]?.supplierItem.supplier;
        const supplierRequestNumber = `${requestNumber}-S${supplierRequestIndex
          .toString()
          .padStart(2, '0')}`;
        supplierRequestIndex += 1;

        const supplierRequest = await tx.supplierRequest.create({
          data: {
            tenantId: dto.tenantId,
            procurementRequestId: request.id,
            supplierId,
            supplierRequestNumber,
            status: supplier?.email
              ? SupplierRequestStatus.READY_TO_SEND
              : SupplierRequestStatus.DRAFT,
            messageStatus: supplier?.email
              ? SupplierMessageStatus.READY_TO_SEND
              : SupplierMessageStatus.DRAFT,
            messageChannel: SupplierMessageChannel.EMAIL,
            requiredDeliveryDate: new Date(dto.requiredDate),
            deliveryLocation: this.formatLocation(location),
            items: {
              create: groupItems.map(({ requestItem, supplierItem }) => ({
                tenantId: dto.tenantId,
                procurementRequestItemId: requestItem.id,
                inventoryItemId: requestItem.inventoryItemId,
                supplierItemId: supplierItem.id,
                requestedQuantity: requestItem.requiredQuantity,
                currencyCode,
                status: 'REQUESTED',
              })),
            },
          },
          include: {
            items: {
              include: {
                inventoryItem: true,
              },
            },
          },
        });

        const subject = `Procurement Request ${requestNumber} - ${location.name}`;
        const draftItems = groupItems.map(({ requestItem }) => ({
          name:
            inventoryById.get(requestItem.inventoryItemId)?.name ??
            requestItem.inventoryItemId,
          quantity: requestItem.requiredQuantity.toString(),
          unit: requestItem.unit,
        }));
        const body = this.generateSupplierMessageDraft({
          supplierName: supplier?.name ?? 'Supplier',
          requestNumber,
          storeName: location.name,
          requiredDate: dto.requiredDate,
          deliveryLocation: this.formatLocation(location),
          bakeryName: 'BakeStack',
          items: draftItems,
        });
        const htmlBody = this.generateSupplierMessageHtmlDraft({
          supplierName: supplier?.name ?? 'Supplier',
          requestNumber,
          storeName: location.name,
          requiredDate: dto.requiredDate,
          deliveryLocation: this.formatLocation(location),
          bakeryName: 'BakeStack',
          items: draftItems,
        });

        const thread = await tx.supplierMessageThread.create({
          data: {
            tenantId: dto.tenantId,
            supplierRequestId: supplierRequest.id,
            supplierId,
            subject,
            status: 'OPEN',
            lastMessageAt: new Date(),
          },
        });

        const message = await tx.supplierMessage.create({
          data: {
            tenantId: dto.tenantId,
            threadId: thread.id,
            supplierRequestId: supplierRequest.id,
            supplierId,
            senderType: SupplierMessageSenderType.BAKERY_USER,
            senderId: dto.createdById,
            channel: SupplierMessageChannel.EMAIL,
            subject,
            messageBody: body,
            messageBodyText: body,
            messageBodyHtml: htmlBody,
            messageStatus: SupplierMessageStatus.DRAFT,
          },
        });

        await this.auditService.log(
          {
            tenantId: dto.tenantId,
            actorId: dto.createdById,
            action: 'SUPPLIER_REQUEST_CREATED',
            entityType: 'SupplierRequest',
            entityId: supplierRequest.id,
            afterJson: {
              supplierId,
              supplierRequestNumber,
              itemCount: groupItems.length,
            } as Prisma.InputJsonValue,
          },
          tx,
        );

        await this.auditService.log(
          {
            tenantId: dto.tenantId,
            actorId: dto.createdById,
            action: 'SUPPLIER_MESSAGE_DRAFT_CREATED',
            entityType: 'SupplierRequest',
            entityId: supplierRequest.id,
            afterJson: {
              messageId: message.id,
              subject,
            } as Prisma.InputJsonValue,
          },
          tx,
        );
      }

      const finalStatus =
        groups.size > 0
          ? ProcurementRequestStatus.SUPPLIER_REQUEST_CREATED
          : ProcurementRequestStatus.DRAFT;
      await tx.procurementRequest.update({
        where: { id: request.id },
        data: { status: finalStatus },
      });

      await this.auditService.log(
        {
          tenantId: dto.tenantId,
          actorId: dto.createdById,
          action: 'PROCUREMENT_CREATED',
          entityType: 'ProcurementRequest',
          entityId: request.id,
          afterJson: {
            requestNumber,
            supplierRequestCount: groups.size,
            unassignedItemCount: chosenSupplierItems.filter((item) => !item)
              .length,
          } as Prisma.InputJsonValue,
        },
        tx,
      );

      return request;
    });

    if (dto.autoSend) {
      const requestWithSupplierRequests = await this.findProcurementRequest(
        dto.tenantId,
        createdRequest.id,
      );
      await Promise.all(
        requestWithSupplierRequests.supplierRequests.map((supplierRequest) =>
          this.sendSupplierRequest(
            dto.tenantId,
            supplierRequest.id,
            dto.createdById,
            SupplierMessageChannel.EMAIL,
          ),
        ),
      );
    }

    return this.findProcurementRequest(dto.tenantId, createdRequest.id);
  }

  listProcurementRequests(tenantId: string) {
    return this.prisma.procurementRequest.findMany({
      where: { tenantId },
      include: {
        location: true,
        items: {
          include: {
            inventoryItem: true,
            preferredSupplier: true,
          },
        },
        supplierRequests: {
          include: {
            supplier: true,
            items: true,
          },
        },
        purchaseOrders: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findProcurementRequest(tenantId: string, id: string) {
    const request = await this.prisma.procurementRequest.findFirst({
      where: { tenantId, id },
      include: {
        location: true,
        items: {
          include: {
            inventoryItem: true,
            preferredSupplier: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        supplierRequests: {
          include: {
            supplier: true,
            items: {
              include: {
                inventoryItem: true,
              },
            },
            thread: {
              include: {
                messages: {
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
            quotations: true,
            purchaseOrders: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        purchaseOrders: true,
      },
    });

    if (!request) {
      throw new DomainException(
        'PROCUREMENT_REQUEST_NOT_FOUND',
        'Procurement request not found',
        404,
      );
    }

    return request;
  }

  listSupplierRequests(tenantId: string, status?: SupplierRequestStatus) {
    return this.prisma.supplierRequest.findMany({
      where: { tenantId, status },
      include: supplierRequestInclude,
      orderBy: [{ lastReplyAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findSupplierRequest(tenantId: string, id: string) {
    const supplierRequest = await this.prisma.supplierRequest.findFirst({
      where: { tenantId, id },
      include: supplierRequestInclude,
    });

    if (!supplierRequest) {
      throw new DomainException(
        'SUPPLIER_REQUEST_NOT_FOUND',
        'Supplier request not found',
        404,
      );
    }

    return supplierRequest;
  }

  sendSupplierRequest(
    tenantId: string,
    id: string,
    actorId?: string,
    channel: SupplierMessageChannel = SupplierMessageChannel.EMAIL,
  ) {
    const safeChannel =
      channel === SupplierMessageChannel.SMS
        ? SupplierMessageChannel.SMS
        : SupplierMessageChannel.EMAIL;
    return this.supplierMessagingService.sendSupplierRequestMessage(
      tenantId,
      id,
      actorId,
      safeChannel,
    );
  }

  sendSupplierReminder(tenantId: string, id: string, actorId?: string) {
    return this.supplierMessagingService.sendSupplierReminderMessage(
      tenantId,
      id,
      actorId,
    );
  }

  async addSupplierResponse(
    tenantId: string,
    supplierRequestId: string,
    dto: AddSupplierResponseDto,
  ) {
    const supplierRequest = await this.findSupplierRequest(
      tenantId,
      supplierRequestId,
    );
    const currencyCode =
      supplierRequest.procurementRequest.location.currencyCode;
    if (!supplierRequest.thread) {
      throw new DomainException(
        'SUPPLIER_THREAD_NOT_FOUND',
        'Supplier conversation thread not found',
        404,
      );
    }

    const itemsById = new Map(
      supplierRequest.items.map((item) => [item.id, item]),
    );
    const itemsByInventoryId = new Map(
      supplierRequest.items.map((item) => [item.inventoryItemId, item]),
    );

    const resolvedItems = dto.items.map((item) => {
      const supplierRequestItem =
        (item.supplierRequestItemId &&
          itemsById.get(item.supplierRequestItemId)) ||
        (item.inventoryItemId && itemsByInventoryId.get(item.inventoryItemId));

      if (!supplierRequestItem) {
        throw new DomainException(
          'SUPPLIER_RESPONSE_ITEM_NOT_FOUND',
          'A quoted item does not belong to this supplier request',
          400,
        );
      }

      return { input: item, supplierRequestItem };
    });

    const lineTotal = resolvedItems.reduce(
      (sum, { input, supplierRequestItem }) => {
        const quantity = decimal(
          input.quotedQuantity ??
            input.availableQuantity ??
            supplierRequestItem.requestedQuantity,
        );
        const unitPrice = decimal(
          input.unitPrice ?? supplierRequestItem.unitPrice ?? 0,
        );
        return sum.add(quantity.mul(unitPrice));
      },
      decimal(0),
    );
    const computedTax = resolvedItems.reduce(
      (sum, { input, supplierRequestItem }) => {
        const quantity = decimal(
          input.quotedQuantity ??
            input.availableQuantity ??
            supplierRequestItem.requestedQuantity,
        );
        const unitPrice = decimal(
          input.unitPrice ?? supplierRequestItem.unitPrice ?? 0,
        );
        const taxRate = decimal(
          input.taxRate ?? supplierRequestItem.taxRate ?? 0,
        );
        return sum.add(quantity.mul(unitPrice).mul(taxRate).div(100));
      },
      decimal(0),
    );
    const taxAmount =
      dto.taxAmount === undefined ? computedTax : decimal(dto.taxAmount);
    const deliveryCharges = decimal(dto.deliveryCharges ?? 0);
    const discount = decimal(dto.discount ?? 0);
    const totalAmount = lineTotal
      .add(taxAmount)
      .add(deliveryCharges)
      .sub(discount);
    const quotationNumber = `QT-${Date.now()}`;

    await this.prisma.$transaction(async (tx) => {
      for (const { input, supplierRequestItem } of resolvedItems) {
        await tx.supplierRequestItem.update({
          where: { id: supplierRequestItem.id },
          data: {
            quotedQuantity:
              input.quotedQuantity === undefined
                ? undefined
                : decimal(input.quotedQuantity),
            availableQuantity:
              input.availableQuantity === undefined
                ? undefined
                : decimal(input.availableQuantity),
            unitPrice:
              input.unitPrice === undefined
                ? undefined
                : decimal(input.unitPrice),
            currencyCode,
            taxRate:
              input.taxRate === undefined ? undefined : decimal(input.taxRate),
            deliveryDate: input.deliveryDate
              ? new Date(input.deliveryDate)
              : undefined,
            supplierNotes: input.supplierNotes,
            status: input.status ?? 'QUOTED',
          },
        });

        if (supplierRequestItem.procurementRequestItemId) {
          await tx.procurementRequestItem.update({
            where: { id: supplierRequestItem.procurementRequestItemId },
            data: { status: ProcurementRequestItemStatus.QUOTED },
          });
        }
      }

      await tx.supplierMessage.create({
        data: {
          tenantId,
          threadId: supplierRequest.thread!.id,
          supplierRequestId,
          supplierId: supplierRequest.supplierId,
          senderType: SupplierMessageSenderType.SUPPLIER,
          senderId: supplierRequest.supplierId,
          channel: SupplierMessageChannel.EMAIL,
          subject: supplierRequest.thread!.subject,
          messageBody: dto.messageBody,
          messageBodyText: dto.messageBody,
          messageStatus: SupplierMessageStatus.RECEIVED,
          hasAttachment: Boolean(dto.attachmentUrl),
        },
      });

      await tx.supplierQuotation.create({
        data: {
          tenantId,
          supplierRequestId,
          supplierId: supplierRequest.supplierId,
          quotationNumber,
          totalAmount,
          taxAmount,
          deliveryCharges,
          discount,
          currencyCode,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          attachmentUrl: dto.attachmentUrl,
          status: SupplierQuotationStatus.RECEIVED,
        },
      });

      await tx.supplierMessageThread.update({
        where: { id: supplierRequest.thread!.id },
        data: {
          status: 'QUOTATION_RECEIVED',
          lastMessageAt: new Date(),
        },
      });

      await tx.supplierRequest.update({
        where: { id: supplierRequestId },
        data: {
          status: SupplierRequestStatus.QUOTATION_RECEIVED,
          lastReplyAt: new Date(),
        },
      });

      await tx.procurementRequest.update({
        where: { id: supplierRequest.procurementRequestId },
        data: { status: ProcurementRequestStatus.QUOTATION_RECEIVED },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId: dto.senderId,
          action: 'SUPPLIER_RESPONSE_ADDED',
          entityType: 'SupplierRequest',
          entityId: supplierRequestId,
          afterJson: {
            quotationNumber,
            totalAmount: totalAmount.toString(),
            itemCount: resolvedItems.length,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
    });

    await this.supplierMessagingService.notifyInternalTeamOnSupplierResponse(
      tenantId,
      supplierRequestId,
      dto.senderId,
    );

    return this.findSupplierRequest(tenantId, supplierRequestId);
  }

  async acceptSupplierQuotation(
    tenantId: string,
    quotationId: string,
    dto: AcceptSupplierQuotationDto,
  ) {
    const quotation = await this.prisma.supplierQuotation.findFirst({
      where: { tenantId, id: quotationId },
      include: {
        supplierRequest: {
          include: {
            procurementRequest: true,
            items: {
              include: {
                supplierItem: true,
                procurementRequestItem: true,
              },
            },
          },
        },
      },
    });

    if (!quotation) {
      throw new DomainException(
        'SUPPLIER_QUOTATION_NOT_FOUND',
        'Supplier quotation not found',
        404,
      );
    }

    if (
      quotation.status === SupplierQuotationStatus.ACCEPTED ||
      quotation.status === SupplierQuotationStatus.REJECTED ||
      quotation.status === SupplierQuotationStatus.PO_CREATED
    ) {
      throw new DomainException(
        'SUPPLIER_QUOTATION_FINALIZED',
        'Supplier quotation has already been finalized',
        409,
      );
    }

    const acceptedItems = quotation.supplierRequest.items.filter(
      (item) => item.unitPrice && item.unitPrice.greaterThanOrEqualTo(0),
    );

    if (!acceptedItems.length) {
      throw new DomainException(
        'SUPPLIER_QUOTATION_HAS_NO_LINES',
        'Cannot create a purchase order without quoted line prices',
        400,
      );
    }
    const locationId = quotation.supplierRequest.procurementRequest.locationId;
    const supplierItemIds = acceptedItems.flatMap((item) =>
      item.supplierItemId ? [item.supplierItemId] : [],
    );
    if (supplierItemIds.length !== acceptedItems.length) {
      throw new DomainException(
        'LOCATION_MONEY_SETUP_REQUIRED',
        'Complete location supplier pricing before creating a purchase order.',
        409,
        {
          locationId,
          settingType: 'supplier-items',
          missingSettingIds: acceptedItems
            .filter((item) => !item.supplierItemId)
            .map((item) => item.inventoryItemId),
        },
      );
    }
    const { currencyCode } = await requireSupplierItemMoneySettings(
      this.prisma,
      { tenantId, locationId, supplierItemIds },
    );

    const poNumber = `PO-${Date.now()}`;
    const purchaseOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          tenantId,
          locationId,
          supplierId: quotation.supplierId,
          procurementRequestId: quotation.supplierRequest.procurementRequestId,
          supplierRequestId: quotation.supplierRequestId,
          poNumber,
          currencyCode,
          expectedDeliveryDate: dto.expectedDeliveryDate
            ? new Date(dto.expectedDeliveryDate)
            : quotation.supplierRequest.requiredDeliveryDate,
          createdById: dto.createdById,
          lines: {
            create: acceptedItems.map((item) => {
              const quantity = decimal(
                item.quotedQuantity ??
                  item.availableQuantity ??
                  item.requestedQuantity,
              );
              const unitPrice = decimal(item.unitPrice ?? 0);
              return {
                tenantId,
                supplierItemId: item.supplierItemId,
                inventoryItemId: item.inventoryItemId,
                orderedQty: quantity,
                unitPrice,
                totalPrice: quantity.mul(unitPrice),
                currencyCode,
              };
            }),
          },
        },
        include: purchaseOrderInclude,
      });

      await tx.supplierQuotation.update({
        where: { id: quotation.id },
        data: { status: SupplierQuotationStatus.PO_CREATED },
      });

      await tx.supplierRequest.update({
        where: { id: quotation.supplierRequestId },
        data: { status: SupplierRequestStatus.PO_CREATED },
      });

      await tx.procurementRequest.update({
        where: { id: quotation.supplierRequest.procurementRequestId },
        data: { status: ProcurementRequestStatus.CONFIRMED },
      });

      for (const item of acceptedItems) {
        if (item.procurementRequestItemId) {
          await tx.procurementRequestItem.update({
            where: { id: item.procurementRequestItemId },
            data: { status: ProcurementRequestItemStatus.ACCEPTED },
          });
        }
        await tx.supplierRequestItem.update({
          where: { id: item.id },
          data: { status: 'ACCEPTED' },
        });
      }

      await this.auditService.log(
        {
          tenantId,
          actorId: dto.createdById,
          action: 'SUPPLIER_QUOTATION_ACCEPTED',
          entityType: 'SupplierQuotation',
          entityId: quotation.id,
          afterJson: {
            purchaseOrderId: order.id,
            poNumber,
          } as Prisma.InputJsonValue,
        },
        tx,
      );

      await this.auditService.log(
        {
          tenantId,
          actorId: dto.createdById,
          action: 'PURCHASE_ORDER_CREATED',
          entityType: 'PurchaseOrder',
          entityId: order.id,
          afterJson: {
            supplierQuotationId: quotation.id,
            supplierRequestId: quotation.supplierRequestId,
            poNumber,
          } as Prisma.InputJsonValue,
        },
        tx,
      );

      return order;
    });

    await this.supplierMessagingService.sendPurchaseOrderConfirmation(
      tenantId,
      purchaseOrder.id,
      dto.createdById,
    );

    return purchaseOrder;
  }

  async rejectSupplierQuotation(
    tenantId: string,
    quotationId: string,
    dto: RejectSupplierQuotationDto,
  ) {
    const quotation = await this.prisma.supplierQuotation.findFirst({
      where: { tenantId, id: quotationId },
    });

    if (!quotation) {
      throw new DomainException(
        'SUPPLIER_QUOTATION_NOT_FOUND',
        'Supplier quotation not found',
        404,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.supplierQuotation.update({
        where: { id: quotation.id },
        data: { status: SupplierQuotationStatus.REJECTED },
      });
      await tx.supplierRequest.update({
        where: { id: quotation.supplierRequestId },
        data: { status: SupplierRequestStatus.REJECTED },
      });
      await this.auditService.log(
        {
          tenantId,
          actorId: dto.actorId,
          action: 'SUPPLIER_QUOTATION_REJECTED',
          entityType: 'SupplierQuotation',
          entityId: quotation.id,
          afterJson: { notes: dto.notes ?? null } as Prisma.InputJsonValue,
        },
        tx,
      );
    });

    return this.findSupplierRequest(tenantId, quotation.supplierRequestId);
  }

  async receiveSupplierRequestGoods(
    tenantId: string,
    supplierRequestId: string,
    dto: ReceiveSupplierRequestGoodsDto,
  ) {
    const supplierRequest = await this.findSupplierRequest(
      tenantId,
      supplierRequestId,
    );
    const purchaseOrder = supplierRequest.purchaseOrders[0];

    if (!purchaseOrder) {
      throw new DomainException(
        'PURCHASE_ORDER_NOT_FOUND',
        'Accept a supplier quotation before receiving goods',
        400,
      );
    }

    const requestItemsById = new Map(
      supplierRequest.items.map((item) => [item.id, item]),
    );
    const receipt = await this.createGoodsReceipt({
      tenantId,
      locationId: supplierRequest.procurementRequest.locationId,
      purchaseOrderId: purchaseOrder.id,
      supplierId: supplierRequest.supplierId,
      receivedById: dto.receivedById,
      receivedAt: dto.receivedAt ?? new Date().toISOString(),
      lines: dto.lines.map((line) => {
        const requestItem = requestItemsById.get(line.supplierRequestItemId);
        if (!requestItem) {
          throw new DomainException(
            'SUPPLIER_REQUEST_ITEM_NOT_FOUND',
            'Receipt line does not belong to this supplier request',
            400,
          );
        }
        return {
          inventoryItemId: requestItem.inventoryItemId,
          receivedQty: line.receivedQty,
          acceptedQty: line.acceptedQty,
          rejectedQty: line.rejectedQty,
          unitCost: Number(requestItem.unitPrice ?? 0),
          supplierBatchNo: line.supplierBatchNo,
          expiryAt: line.expiryAt,
        };
      }),
    });

    return this.postGoodsReceipt(tenantId, receipt.id);
  }

  async createPurchaseOrder(dto: CreatePurchaseOrderDto) {
    const poNumber = `PO-${Date.now()}`;
    const currencyCode = await requireLocationCurrency(this.prisma, dto);

    const purchaseOrder = await this.prisma.purchaseOrder.create({
      data: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        supplierId: dto.supplierId,
        poNumber,
        currencyCode,
        expectedDeliveryDate: dto.expectedDeliveryDate
          ? new Date(dto.expectedDeliveryDate)
          : undefined,
        createdById: dto.createdById,
        lines: {
          create: dto.lines.map((line) => ({
            tenantId: dto.tenantId,
            supplierItemId: line.supplierItemId,
            inventoryItemId: line.inventoryItemId,
            orderedQty: decimal(line.orderedQty),
            unitPrice: decimal(line.unitPrice),
            totalPrice: decimal(line.orderedQty).mul(line.unitPrice),
            currencyCode,
          })),
        },
      },
      include: { lines: true },
    });

    await this.auditService.log({
      tenantId: dto.tenantId,
      actorId: dto.createdById,
      action: 'PURCHASE_ORDER_CREATED',
      entityType: 'PurchaseOrder',
      entityId: purchaseOrder.id,
      afterJson: purchaseOrder as unknown as Prisma.InputJsonValue,
    });

    return purchaseOrder;
  }

  listPurchaseOrders(tenantId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        lines: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPurchaseOrder(tenantId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, id },
      include: purchaseOrderInclude,
    });

    if (!purchaseOrder) {
      throw new DomainException(
        'PURCHASE_ORDER_NOT_FOUND',
        'Purchase order not found',
        404,
      );
    }

    return purchaseOrder;
  }

  async submitPurchaseOrder(tenantId: string, id: string, actorId?: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, id },
      include: { lines: true },
    });

    if (!purchaseOrder) {
      throw new DomainException(
        'PURCHASE_ORDER_NOT_FOUND',
        'Purchase order not found',
        404,
      );
    }
    const supplierItemIds = purchaseOrder.lines.flatMap((line) =>
      line.supplierItemId ? [line.supplierItemId] : [],
    );
    if (supplierItemIds.length !== purchaseOrder.lines.length) {
      throw new DomainException(
        'LOCATION_MONEY_SETUP_REQUIRED',
        'Complete location supplier pricing before submitting this purchase order.',
        409,
        {
          locationId: purchaseOrder.locationId,
          settingType: 'supplier-items',
          missingSettingIds: purchaseOrder.lines
            .filter((line) => !line.supplierItemId)
            .map((line) => line.inventoryItemId),
        },
      );
    }
    const { currencyCode } = await requireSupplierItemMoneySettings(
      this.prisma,
      {
        tenantId,
        locationId: purchaseOrder.locationId,
        supplierItemIds,
      },
    );

    const updated = await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: {
        status: PurchaseOrderStatus.SUBMITTED,
        orderedAt: new Date(),
        currencyCode,
      },
    });

    await this.auditService.log({
      tenantId,
      actorId,
      action: 'procurement.purchase_order_submitted',
      entityType: 'PurchaseOrder',
      entityId: id,
      beforeJson: purchaseOrder as unknown as Prisma.InputJsonValue,
      afterJson: updated as unknown as Prisma.InputJsonValue,
    });

    return updated;
  }

  async createGoodsReceipt(dto: CreateGoodsReceiptDto) {
    await this.validateGoodsReceipt(dto);
    const currencyCode = await requireLocationCurrency(this.prisma, dto);

    return this.prisma.goodsReceipt.create({
      data: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        purchaseOrderId: dto.purchaseOrderId,
        supplierId: dto.supplierId,
        currencyCode,
        receivedById: dto.receivedById,
        receivedAt: new Date(dto.receivedAt),
        lines: {
          create: dto.lines.map((line) => ({
            tenantId: dto.tenantId,
            inventoryItemId: line.inventoryItemId,
            receivedQty: decimal(line.receivedQty),
            acceptedQty: decimal(line.acceptedQty),
            rejectedQty: decimal(line.rejectedQty ?? 0),
            unitCost: decimal(line.unitCost),
            currencyCode,
            expiryAt: line.expiryAt ? new Date(line.expiryAt) : undefined,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async postGoodsReceipt(tenantId: string, id: string) {
    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { tenantId, id },
      include: {
        lines: true,
        purchaseOrder: {
          include: { lines: true },
        },
      },
    });

    if (!receipt) {
      throw new DomainException(
        'GOODS_RECEIPT_NOT_FOUND',
        'Goods receipt not found',
        404,
      );
    }

    if (receipt.status === GoodsReceiptStatus.POSTED) {
      throw new DomainException(
        'GOODS_RECEIPT_ALREADY_POSTED',
        'Goods receipt cannot be posted twice',
        409,
      );
    }
    const locationCurrencyCode = await requireLocationCurrency(this.prisma, {
      tenantId,
      locationId: receipt.locationId,
    });
    if (receipt.currencyCode && receipt.currencyCode !== locationCurrencyCode) {
      throw new DomainException(
        'CROSS_CURRENCY_TRANSFER_NOT_SUPPORTED',
        'Goods receipts must use the receiving location currency.',
        409,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const line of receipt.lines) {
        const lot = await this.findOrCreateLot(tx, {
          tenantId,
          inventoryItemId: line.inventoryItemId,
          supplierId: receipt.supplierId,
          supplierBatchNo: `${receipt.id}:${line.id}`,
          expiryAt: line.expiryAt,
          receivedAt: receipt.receivedAt,
        });

        await tx.goodsReceiptLine.update({
          where: { id: line.id },
          data: { lotId: lot.id },
        });

        await applyInventoryDelta(tx, {
          tenantId,
          locationId: receipt.locationId,
          inventoryItemId: line.inventoryItemId,
          lotId: lot.id,
          quantityDelta: line.acceptedQty,
          unitCost: line.unitCost,
          currencyCode: locationCurrencyCode,
          movementType: InventoryMovementType.PURCHASE_RECEIPT,
          referenceType: 'GoodsReceipt',
          referenceId: receipt.id,
          createdById: receipt.receivedById,
        });

        if (receipt.purchaseOrder) {
          const poLine = receipt.purchaseOrder.lines.find(
            (purchaseOrderLine) =>
              purchaseOrderLine.inventoryItemId === line.inventoryItemId,
          );

          if (poLine) {
            await tx.purchaseOrderLine.update({
              where: { id: poLine.id },
              data: {
                receivedQty: poLine.receivedQty.add(line.acceptedQty),
              },
            });
          }
        }
      }

      let nextPurchaseOrderStatus: PurchaseOrderStatus | null = null;
      if (receipt.purchaseOrder) {
        const refreshedLines = await tx.purchaseOrderLine.findMany({
          where: {
            tenantId,
            purchaseOrderId: receipt.purchaseOrder.id,
          },
        });

        const allReceived = refreshedLines.every((line) =>
          line.receivedQty.greaterThanOrEqualTo(line.orderedQty),
        );
        const anyReceived = refreshedLines.some((line) =>
          line.receivedQty.greaterThan(0),
        );
        nextPurchaseOrderStatus = allReceived
          ? PurchaseOrderStatus.RECEIVED
          : anyReceived
            ? PurchaseOrderStatus.PARTIALLY_RECEIVED
            : PurchaseOrderStatus.SUBMITTED;

        await tx.purchaseOrder.update({
          where: { id: receipt.purchaseOrder.id },
          data: {
            status: nextPurchaseOrderStatus,
          },
        });

        await this.syncSupplierRequestReceiptStatus(
          tx,
          tenantId,
          receipt.purchaseOrder.supplierRequestId,
          receipt.purchaseOrder.procurementRequestId,
          nextPurchaseOrderStatus,
        );
      }

      const postedReceipt = await tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: { status: GoodsReceiptStatus.POSTED },
        include: { lines: true },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId: receipt.receivedById,
          action: 'GOODS_RECEIVED_AND_INVENTORY_UPDATED',
          entityType: 'GoodsReceipt',
          entityId: receipt.id,
          afterJson: postedReceipt as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return postedReceipt;
    });
  }

  private async validateGoodsReceipt(dto: CreateGoodsReceiptDto) {
    if (dto.purchaseOrderId) {
      const order = await this.prisma.purchaseOrder.findFirst({
        where: {
          tenantId: dto.tenantId,
          id: dto.purchaseOrderId,
          supplierId: dto.supplierId,
        },
      });
      if (!order) {
        throw new DomainException(
          'PURCHASE_ORDER_NOT_FOUND',
          'Purchase order not found for this supplier receipt',
          404,
        );
      }
    }

    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        tenantId: dto.tenantId,
        id: { in: dto.lines.map((line) => line.inventoryItemId) },
        deletedAt: null,
      },
    });
    const inventoryById = new Map(
      inventoryItems.map((item) => [item.id, item]),
    );

    for (const line of dto.lines) {
      const inventoryItem = inventoryById.get(line.inventoryItemId);
      if (!inventoryItem) {
        throw new DomainException(
          'INVENTORY_ITEM_NOT_FOUND',
          'Receipt contains an inventory item outside this tenant',
          400,
        );
      }
      if (line.acceptedQty > line.receivedQty) {
        throw new DomainException(
          'ACCEPTED_QTY_EXCEEDS_RECEIVED_QTY',
          'Accepted quantity cannot exceed received quantity',
          400,
        );
      }
      if (
        inventoryItem.isPerishable &&
        line.acceptedQty > 0 &&
        !line.expiryAt
      ) {
        throw new DomainException(
          'EXPIRY_DATE_REQUIRED',
          `Expiry date is required for perishable item ${inventoryItem.name}`,
          400,
        );
      }
    }
  }

  private chooseSupplierItem(
    inventoryItemId: string,
    preferredSupplierId: string | undefined,
    supplierItems: Array<
      Prisma.SupplierItemGetPayload<{
        include: { supplier: true; inventoryItem: true };
      }>
    >,
  ) {
    const candidates = supplierItems.filter(
      (item) => item.inventoryItemId === inventoryItemId,
    );
    if (!candidates.length) return null;

    return (
      candidates.find((item) => item.supplierId === preferredSupplierId) ??
      candidates[0]
    );
  }

  private async assertNoDuplicateOpenProcurement(
    tenantId: string,
    locationId: string,
    requiredDate: Date,
    inventoryItemIds: string[],
  ) {
    const startOfDay = new Date(requiredDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const duplicates = await this.prisma.procurementRequest.findMany({
      where: {
        tenantId,
        locationId,
        requiredDate: {
          gte: startOfDay,
          lt: endOfDay,
        },
        status: { in: openProcurementStatuses },
        items: {
          some: {
            inventoryItemId: { in: inventoryItemIds },
            status: {
              in: [
                ProcurementRequestItemStatus.PENDING,
                ProcurementRequestItemStatus.ASSIGNED,
                ProcurementRequestItemStatus.UNASSIGNED,
                ProcurementRequestItemStatus.QUOTED,
                ProcurementRequestItemStatus.ACCEPTED,
              ],
            },
          },
        },
      },
      include: {
        items: {
          where: { inventoryItemId: { in: inventoryItemIds } },
          select: { inventoryItemId: true },
        },
      },
      take: 3,
    });

    if (!duplicates.length) {
      return;
    }

    throw new DomainException(
      'DUPLICATE_OPEN_PROCUREMENT',
      'An open procurement request already exists for this store, item, and required date.',
      409,
      {
        requestIds: duplicates.map((request) => request.id),
        itemIds: [
          ...new Set(
            duplicates.flatMap((request) =>
              request.items.map((item) => item.inventoryItemId),
            ),
          ),
        ],
      },
    );
  }

  private generateSupplierMessageDraft(input: {
    supplierName: string;
    requestNumber: string;
    storeName: string;
    requiredDate: string;
    deliveryLocation: string;
    bakeryName: string;
    items: Array<{ name: string; quantity: string; unit: string }>;
  }) {
    const itemList = input.items
      .map((item) => `- ${item.name}: ${item.quantity} ${item.unit}`)
      .join('\n');

    return [
      `Hello ${input.supplierName},`,
      '',
      `We need the following items for ${input.storeName}:`,
      '',
      itemList,
      '',
      `Required Delivery Date: ${input.requiredDate}`,
      `Delivery Location: ${input.deliveryLocation}`,
      '',
      'Please confirm:',
      '- Availability',
      '- Best price',
      '- Delivery date/time',
      '- Payment terms',
      '',
      'Regards,',
      input.bakeryName,
    ].join('\n');
  }

  private generateSupplierMessageHtmlDraft(input: {
    supplierName: string;
    requestNumber: string;
    storeName: string;
    requiredDate: string;
    deliveryLocation: string;
    bakeryName: string;
    items: Array<{ name: string; quantity: string; unit: string }>;
  }) {
    const rows = input.items
      .map(
        (item) =>
          `<tr><td>${this.escapeHtml(item.name)}</td><td>${this.escapeHtml(item.quantity)}</td><td>${this.escapeHtml(item.unit)}</td></tr>`,
      )
      .join('');

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${this.escapeHtml(`Procurement Request ${input.requestNumber} - ${input.storeName}`)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #171717; line-height: 1.5; }
      .wrap { max-width: 680px; margin: 0 auto; padding: 24px; }
      .header { font-weight: 700; font-size: 18px; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
      th { background: #f8fafc; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">${this.escapeHtml(input.bakeryName)}</div>
      <p>Hello ${this.escapeHtml(input.supplierName)},</p>
      <p>We need the following items for <strong>${this.escapeHtml(input.storeName)}</strong>:</p>
      <table>
        <thead><tr><th>Item</th><th>Quantity</th><th>Unit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p><strong>Required Delivery Date:</strong> ${this.escapeHtml(input.requiredDate)}</p>
      <p><strong>Delivery Location:</strong> ${this.escapeHtml(input.deliveryLocation)}</p>
      <p>Please confirm availability, best price, delivery date/time, and payment terms.</p>
      <p>You can reply to this email or contact our procurement team.</p>
      <p>Regards,<br/>${this.escapeHtml(input.bakeryName)}</p>
    </div>
  </body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatLocation(location: {
    name: string;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  }) {
    return [
      location.name,
      location.addressLine1,
      location.city,
      location.state,
      location.postalCode,
    ]
      .filter(Boolean)
      .join(', ');
  }

  private async syncSupplierRequestReceiptStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    supplierRequestId: string | null,
    procurementRequestId: string | null,
    purchaseOrderStatus: PurchaseOrderStatus,
  ) {
    const supplierStatus =
      purchaseOrderStatus === PurchaseOrderStatus.RECEIVED
        ? SupplierRequestStatus.FULLY_RECEIVED
        : purchaseOrderStatus === PurchaseOrderStatus.PARTIALLY_RECEIVED
          ? SupplierRequestStatus.PARTIALLY_RECEIVED
          : SupplierRequestStatus.DELIVERY_PENDING;
    const procurementStatus =
      purchaseOrderStatus === PurchaseOrderStatus.RECEIVED
        ? ProcurementRequestStatus.FULLY_RECEIVED
        : purchaseOrderStatus === PurchaseOrderStatus.PARTIALLY_RECEIVED
          ? ProcurementRequestStatus.PARTIALLY_RECEIVED
          : ProcurementRequestStatus.CONFIRMED;

    if (supplierRequestId) {
      await tx.supplierRequest.update({
        where: { id: supplierRequestId },
        data: { status: supplierStatus },
      });
    }

    if (procurementRequestId) {
      await tx.procurementRequest.update({
        where: { tenantId, id: procurementRequestId },
        data: { status: procurementStatus },
      });
    }
  }

  private async findOrCreateLot(
    executor: InventoryExecutor,
    input: {
      tenantId: string;
      inventoryItemId: string;
      supplierId: string;
      supplierBatchNo: string;
      expiryAt?: Date | null;
      receivedAt: Date;
    },
  ) {
    const existing = await executor.inventoryLot.findFirst({
      where: {
        tenantId: input.tenantId,
        inventoryItemId: input.inventoryItemId,
        supplierBatchNo: input.supplierBatchNo,
      },
    });

    if (existing) {
      return existing;
    }

    return executor.inventoryLot.create({
      data: {
        tenantId: input.tenantId,
        inventoryItemId: input.inventoryItemId,
        supplierId: input.supplierId,
        supplierBatchNo: input.supplierBatchNo,
        receivedAt: input.receivedAt,
        expiryAt: input.expiryAt ?? undefined,
      },
    });
  }
}
