import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: dto,
    });
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

    return this.prisma.supplier.update({
      where: { id: supplier.id },
      data: dto,
    });
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

    return this.prisma.supplierItem.create({
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
}
