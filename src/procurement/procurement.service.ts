import { Injectable } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import {
  applyInventoryDelta,
  InventoryExecutor,
} from '../common/prisma/inventory-ledger';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createPurchaseOrder(dto: CreatePurchaseOrderDto) {
    const poNumber = `PO-${Date.now()}`;

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        supplierId: dto.supplierId,
        poNumber,
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
          })),
        },
      },
      include: { lines: true },
    });
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
      include: {
        supplier: true,
        location: true,
        lines: {
          include: {
            inventoryItem: true,
            supplierItem: true,
          },
        },
      },
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

  async submitPurchaseOrder(tenantId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, id },
    });

    if (!purchaseOrder) {
      throw new DomainException(
        'PURCHASE_ORDER_NOT_FOUND',
        'Purchase order not found',
        404,
      );
    }

    return this.prisma.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: {
        status: 'SUBMITTED',
        orderedAt: new Date(),
      },
    });
  }

  createGoodsReceipt(dto: CreateGoodsReceiptDto) {
    return this.prisma.goodsReceipt.create({
      data: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        purchaseOrderId: dto.purchaseOrderId,
        supplierId: dto.supplierId,
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

    if (receipt.status === 'POSTED') {
      throw new DomainException(
        'GOODS_RECEIPT_ALREADY_POSTED',
        'Goods receipt cannot be posted twice',
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

        await tx.purchaseOrder.update({
          where: { id: receipt.purchaseOrder.id },
          data: {
            status: allReceived
              ? 'RECEIVED'
              : anyReceived
                ? 'PARTIALLY_RECEIVED'
                : 'SUBMITTED',
          },
        });
      }

      const postedReceipt = await tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: { status: 'POSTED' },
        include: { lines: true },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId: receipt.receivedById,
          action: 'procurement.goods_receipt_posted',
          entityType: 'GoodsReceipt',
          entityId: receipt.id,
          afterJson: postedReceipt as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return postedReceipt;
    });
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
