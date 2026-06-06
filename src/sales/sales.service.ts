import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { requireLocationCurrency } from '../common/prisma/location-money';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { rateTimesQtyToMinor } from '../common/utils/money.util';
import { BulkCreateSalesEntriesDto } from './dto/bulk-create-sales-entries.dto';
import { CreateSalesEntryDto } from './dto/create-sales-entry.dto';
import { QuerySalesDto } from './dto/query-sales.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Idempotent per (tenant, location, businessDate, productVariant): re-submitting
   * the same SKU/day/store updates the row rather than creating a duplicate.
   */
  async upsertEntry(
    tenantId: string,
    actorId: string | null,
    dto: CreateSalesEntryDto,
  ) {
    const businessDate = this.normalizeBusinessDate(dto.businessDate);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.productVariantId, tenantId, deletedAt: null },
    });
    if (!variant) {
      throw new DomainException(
        'PRODUCT_VARIANT_NOT_FOUND',
        'Product variant not found',
        404,
      );
    }
    const currencyCode = await requireLocationCurrency(this.prisma, {
      tenantId,
      locationId: dto.locationId,
    });
    const unitSellPrice = await this.resolveUnitSellPrice(tenantId, dto, variant);
    const units = decimal(dto.units);
    const lineRevenue = rateTimesQtyToMinor(unitSellPrice, units);

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.salesEntry.upsert({
        where: {
          tenantId_locationId_businessDate_productVariantId: {
            tenantId,
            locationId: dto.locationId,
            businessDate,
            productVariantId: dto.productVariantId,
          },
        },
        update: {
          units,
          unitSellPrice,
          lineRevenue,
          currencyCode,
          createdById: actorId,
        },
        create: {
          tenantId,
          locationId: dto.locationId,
          businessDate,
          productVariantId: dto.productVariantId,
          units,
          unitSellPrice,
          lineRevenue,
          currencyCode,
          createdById: actorId,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId: actorId ?? undefined,
          action: 'sales.entry_upserted',
          entityType: 'SalesEntry',
          entityId: entry.id,
          afterJson: entry as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return entry;
    });
  }

  async bulkUpsert(
    tenantId: string,
    actorId: string | null,
    dto: BulkCreateSalesEntriesDto,
  ) {
    const entries = [];
    for (const entry of dto.entries) {
      entries.push(await this.upsertEntry(tenantId, actorId, entry));
    }
    return { entries };
  }

  list(tenantId: string, query: QuerySalesDto) {
    const where: Prisma.SalesEntryWhereInput = {
      tenantId,
      locationId: query.locationId,
    };
    if (query.businessDate) {
      where.businessDate = this.normalizeBusinessDate(query.businessDate);
    } else if (query.from || query.to) {
      where.businessDate = {
        gte: query.from ? this.normalizeBusinessDate(query.from) : undefined,
        lte: query.to ? this.normalizeBusinessDate(query.to) : undefined,
      };
    }

    return this.prisma.salesEntry.findMany({
      where,
      include: {
        productVariant: { select: { id: true, sku: true, name: true } },
      },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async resolveUnitSellPrice(
    tenantId: string,
    dto: CreateSalesEntryDto,
    variant: { defaultSellingPrice: Prisma.Decimal | null },
  ) {
    if (dto.unitSellPrice !== undefined) {
      return decimal(dto.unitSellPrice);
    }

    const setting = await this.prisma.locationProductVariantSetting.findFirst({
      where: {
        tenantId,
        locationId: dto.locationId,
        productVariantId: dto.productVariantId,
      },
    });
    const price = setting?.sellingPrice ?? variant.defaultSellingPrice;
    if (price === null || price === undefined) {
      throw new DomainException(
        'SALES_PRICE_REQUIRED',
        'Set a unit sell price, a local price, or a default selling price before capturing sales.',
        400,
      );
    }

    return decimal(price);
  }

  private normalizeBusinessDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new DomainException(
        'SALES_INVALID_BUSINESS_DATE',
        'A valid business date is required',
        400,
      );
    }
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
