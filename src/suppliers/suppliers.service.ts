import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppwriteMirrorService } from '../appwrite/appwrite-mirror.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierItemDto } from './dto/update-supplier-item.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appwriteMirror: AppwriteMirrorService,
  ) {}

  async create(dto: CreateSupplierDto) {
    const supplier = await this.prisma.supplier.create({
      data: dto,
    });

    await this.mirrorSupplier(supplier);

    return supplier;
  }

  findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { tenantId, id, deletedAt: null },
    });

    if (!supplier) {
      throw new DomainException(
        'SUPPLIER_NOT_FOUND',
        'Supplier not found',
        404,
      );
    }

    return supplier;
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { tenantId, id, deletedAt: null },
    });

    if (!supplier) {
      throw new DomainException(
        'SUPPLIER_NOT_FOUND',
        'Supplier not found',
        404,
      );
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: dto,
    });

    await this.mirrorSupplier(updated);

    return updated;
  }

  async remove(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { tenantId, id, deletedAt: null },
    });

    if (!supplier) {
      throw new DomainException(
        'SUPPLIER_NOT_FOUND',
        'Supplier not found',
        404,
      );
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        status: 'ARCHIVED',
        deletedAt: new Date(),
      },
    });

    await this.appwriteMirror.deleteOperationalRow('suppliers', updated.id);

    return updated;
  }

  async createSupplierItem(dto: CreateSupplierItemDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId: dto.tenantId, deletedAt: null },
    });

    if (!supplier) {
      throw new DomainException(
        'SUPPLIER_NOT_FOUND',
        'Supplier not found',
        404,
      );
    }

    const item = await this.prisma.supplierItem.create({
      data: {
        ...dto,
        packSize: new Prisma.Decimal(dto.packSize),
        currentPrice: new Prisma.Decimal(dto.currentPrice),
        minOrderQty:
          dto.minOrderQty === undefined
            ? undefined
            : new Prisma.Decimal(dto.minOrderQty),
      },
    });

    await this.mirrorSupplierItem(item);

    return item;
  }

  listSupplierItems(tenantId: string) {
    return this.prisma.supplierItem.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        inventoryItem: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateSupplierItem(
    tenantId: string,
    id: string,
    dto: UpdateSupplierItemDto,
  ) {
    const supplierItem = await this.prisma.supplierItem.findFirst({
      where: { tenantId, id },
    });

    if (!supplierItem) {
      throw new DomainException(
        'SUPPLIER_ITEM_NOT_FOUND',
        'Supplier item mapping not found',
        404,
      );
    }

    const updated = await this.prisma.supplierItem.update({
      where: { id: supplierItem.id },
      data: {
        supplierSku: dto.supplierSku,
        purchaseUom: dto.purchaseUom,
        packSize:
          dto.packSize === undefined
            ? undefined
            : new Prisma.Decimal(dto.packSize),
      },
      include: {
        supplier: true,
        inventoryItem: true,
      },
    });

    await this.mirrorSupplierItem(updated);

    return updated;
  }

  private async mirrorSupplier(
    supplier: Prisma.SupplierGetPayload<Record<string, never>>,
  ) {
    await this.appwriteMirror.upsertOperationalRow('suppliers', {
      id: supplier.id,
      tenantId: supplier.tenantId,
      status: supplier.status,
      name: supplier.name,
      data: supplier,
    });
  }

  private async mirrorSupplierItem(supplierItem: {
    id: string;
    tenantId: string;
    supplierSku?: string | null;
    supplierId: string;
    inventoryItemId: string;
  }) {
    await this.appwriteMirror.upsertOperationalRow('supplierItemMappings', {
      id: supplierItem.id,
      tenantId: supplierItem.tenantId,
      name: supplierItem.supplierSku,
      code: supplierItem.supplierSku,
      data: supplierItem,
    });
  }
}
