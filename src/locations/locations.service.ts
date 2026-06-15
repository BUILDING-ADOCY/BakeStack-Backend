import { Injectable } from '@nestjs/common';
import { Prisma, SetupStepStatus, type DayOfWeek } from '@prisma/client';
import { AppwriteMirrorService } from '../appwrite/appwrite-mirror.service';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  findMarket,
  inferMarketTimeZone,
  isMarketTimeZone,
  type MarketDefinition,
} from '../metadata/markets.registry';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpsertInventoryItemSettingDto } from './dto/upsert-inventory-item-setting.dto';
import {
  OpeningHourInputDto,
  UpdateOpeningHoursDto,
} from './dto/update-opening-hours.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpsertLocationProfileDto } from './dto/upsert-location-profile.dto';
import { UpsertProductVariantSettingDto } from './dto/upsert-product-variant-setting.dto';
import { UpsertSupplierItemSettingDto } from './dto/upsert-supplier-item-setting.dto';

const serializeJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly appwriteMirror: AppwriteMirrorService,
  ) {}

  async create(
    tenantId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: CreateLocationDto,
  ) {
    const location = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.location.count({
        where: { tenantId },
      });

      const primary = dto.isPrimary ?? existingCount === 0;
      if (primary) {
        await tx.location.updateMany({
          where: { tenantId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const location = await tx.location.create({
        data: this.toLocationCreateInput(
          tenantId,
          dto,
          primary,
          this.resolveCreateMarket(dto),
        ),
      });

      await tx.onboardingProgress.updateMany({
        where: {
          tenantId,
          userId: actorId,
        },
        data: {
          locationSetupStatus: SetupStepStatus.COMPLETED,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'LOCATION_CREATED',
          entityType: 'Location',
          entityId: location.id,
          afterJson: serializeJson(location),
          correlationId,
        },
        tx,
      );

      return location;
    });

    await this.mirrorLocation(location);

    return location;
  }

  findAll(tenantId: string) {
    return this.prisma.location.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findOne(tenantId: string, id: string) {
    return this.prisma.location.findFirst({
      where: { tenantId, id },
    });
  }

  async getMoneyReadiness(tenantId: string, locationId: string) {
    const location = await this.requireLocation(tenantId, locationId);
    const market = findMarket(location.countryCode);
    const [
      activity,
      productVariants,
      inventoryItems,
      supplierItems,
      productVariantSettings,
      inventoryItemSettings,
      supplierItemSettings,
      mismatchedComplianceProfiles,
    ] = await Promise.all([
      this.getOperationalActivity(this.prisma, tenantId, locationId),
      this.prisma.productVariant.findMany({
        where: { tenantId, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      }),
      this.prisma.inventoryItem.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.supplierItem.findMany({
        where: {
          tenantId,
          supplier: { status: 'ACTIVE', deletedAt: null },
        },
        select: { id: true },
      }),
      this.prisma.locationProductVariantSetting.findMany({
        where: { tenantId, locationId },
        select: {
          productVariantId: true,
          sellingPrice: true,
          currencyCode: true,
        },
      }),
      this.prisma.locationInventoryItemSetting.findMany({
        where: { tenantId, locationId },
        select: {
          inventoryItemId: true,
          unitCost: true,
          currencyCode: true,
        },
      }),
      this.prisma.locationSupplierItemSetting.findMany({
        where: { tenantId, locationId },
        select: {
          supplierItemId: true,
          currentPrice: true,
          currencyCode: true,
        },
      }),
      this.prisma.complianceProfile.count({
        where: {
          tenantId,
          locationId,
          countryCode: { not: location.countryCode },
        },
      }),
    ]);

    const issues: string[] = [];
    if (!market) {
      issues.push(
        'Location country code is not in the supported market registry.',
      );
    } else if (market.currencyCode !== location.currencyCode) {
      issues.push('Location currency does not match its registered market.');
    }
    if (mismatchedComplianceProfiles > 0) {
      issues.push('One or more compliance profiles use a different country.');
    }
    const localSettings = {
      productVariants: this.readinessChecklist(
        productVariants.map((row) => row.id),
        productVariantSettings.map((row) => ({
          id: row.productVariantId,
          isConfigured:
            Boolean(row.sellingPrice) &&
            row.currencyCode === location.currencyCode,
        })),
      ),
      inventoryItems: this.readinessChecklist(
        inventoryItems.map((row) => row.id),
        inventoryItemSettings.map((row) => ({
          id: row.inventoryItemId,
          isConfigured:
            Boolean(row.unitCost) && row.currencyCode === location.currencyCode,
        })),
      ),
      supplierItems: this.readinessChecklist(
        supplierItems.map((row) => row.id),
        supplierItemSettings.map((row) => ({
          id: row.supplierItemId,
          isConfigured:
            Boolean(row.currentPrice) &&
            row.currencyCode === location.currencyCode,
        })),
      ),
    };

    if (localSettings.productVariants.missingSettingIds.length > 0) {
      issues.push(
        'Configure local selling prices for every active product variant.',
      );
    }
    if (localSettings.inventoryItems.missingSettingIds.length > 0) {
      issues.push('Configure local costs for every inventory item.');
    }
    if (localSettings.supplierItems.missingSettingIds.length > 0) {
      issues.push('Configure local supplier prices for every supplier item.');
    }

    return {
      locationId,
      countryCode: location.countryCode,
      currencyCode: location.currencyCode,
      market: market ?? null,
      isReady: issues.length === 0,
      issues,
      currencyLocked: this.totalOperationalActivity(activity) > 0,
      operationalActivity: activity,
      localSettings,
    };
  }

  private readinessChecklist(
    expectedIds: string[],
    settings: Array<{ id: string; isConfigured: boolean }>,
  ) {
    const configuredIds = new Set(
      settings
        .filter((setting) => setting.isConfigured)
        .map((setting) => setting.id),
    );
    const missingSettingIds = expectedIds.filter(
      (id) => !configuredIds.has(id),
    );

    return {
      configured: expectedIds.length - missingSettingIds.length,
      total: expectedIds.length,
      missingSettingIds,
    };
  }

  async findProductVariantSettings(tenantId: string, locationId: string) {
    await this.requireLocation(tenantId, locationId);

    return this.prisma.locationProductVariantSetting.findMany({
      where: { tenantId, locationId },
      include: { productVariant: { include: { product: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findProductVariantSetting(
    tenantId: string,
    locationId: string,
    productVariantId: string,
  ) {
    await this.requireLocation(tenantId, locationId);

    return this.prisma.locationProductVariantSetting.findFirst({
      where: { tenantId, locationId, productVariantId },
      include: { productVariant: { include: { product: true } } },
    });
  }

  async upsertProductVariantSetting(
    tenantId: string,
    locationId: string,
    productVariantId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpsertProductVariantSettingDto,
  ) {
    const [location] = await Promise.all([
      this.requireLocation(tenantId, locationId),
      this.requireProductVariant(tenantId, productVariantId),
    ]);

    const setting = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.locationProductVariantSetting.findFirst({
        where: { tenantId, locationId, productVariantId },
      });
      const setting = await tx.locationProductVariantSetting.upsert({
        where: {
          tenantId_locationId_productVariantId: {
            tenantId,
            locationId,
            productVariantId,
          },
        },
        create: {
          tenantId,
          locationId,
          productVariantId,
          sellingPrice: this.decimal(dto.sellingPrice),
          currencyCode: location.currencyCode,
          isAvailable: dto.isAvailable,
          metadataJson: this.json(dto.metadataJson),
        },
        update: {
          sellingPrice: this.decimal(dto.sellingPrice),
          currencyCode: location.currencyCode,
          isAvailable: dto.isAvailable,
          metadataJson: this.json(dto.metadataJson),
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: existing
            ? 'LOCATION_PRODUCT_VARIANT_SETTING_UPDATED'
            : 'LOCATION_PRODUCT_VARIANT_SETTING_CREATED',
          entityType: 'LocationProductVariantSetting',
          entityId: setting.id,
          beforeJson: existing ? serializeJson(existing) : undefined,
          afterJson: serializeJson(setting),
          correlationId,
        },
        tx,
      );

      return setting;
    });

    return setting;
  }

  async deleteProductVariantSetting(
    tenantId: string,
    locationId: string,
    productVariantId: string,
    actorId: string,
    correlationId: string | undefined,
  ) {
    await this.requireLocation(tenantId, locationId);

    const setting = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.locationProductVariantSetting.findFirst({
        where: { tenantId, locationId, productVariantId },
      });
      if (!existing) {
        throw this.localSettingNotFound();
      }

      await tx.locationProductVariantSetting.delete({
        where: { id: existing.id },
      });
      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'LOCATION_PRODUCT_VARIANT_SETTING_DELETED',
          entityType: 'LocationProductVariantSetting',
          entityId: existing.id,
          beforeJson: serializeJson(existing),
          correlationId,
        },
        tx,
      );

      return existing;
    });
  }

  async findInventoryItemSettings(tenantId: string, locationId: string) {
    await this.requireLocation(tenantId, locationId);

    return this.prisma.locationInventoryItemSetting.findMany({
      where: { tenantId, locationId },
      include: { inventoryItem: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findInventoryItemSetting(
    tenantId: string,
    locationId: string,
    inventoryItemId: string,
  ) {
    await this.requireLocation(tenantId, locationId);

    return this.prisma.locationInventoryItemSetting.findFirst({
      where: { tenantId, locationId, inventoryItemId },
      include: { inventoryItem: true },
    });
  }

  async upsertInventoryItemSetting(
    tenantId: string,
    locationId: string,
    inventoryItemId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpsertInventoryItemSettingDto,
  ) {
    const [location] = await Promise.all([
      this.requireLocation(tenantId, locationId),
      this.requireInventoryItem(tenantId, inventoryItemId),
    ]);

    const setting = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.locationInventoryItemSetting.findFirst({
        where: { tenantId, locationId, inventoryItemId },
      });
      const setting = await tx.locationInventoryItemSetting.upsert({
        where: {
          tenantId_locationId_inventoryItemId: {
            tenantId,
            locationId,
            inventoryItemId,
          },
        },
        create: {
          tenantId,
          locationId,
          inventoryItemId,
          unitCost: this.decimal(dto.unitCost),
          reorderLevel: this.decimal(dto.reorderLevel),
          currencyCode: location.currencyCode,
          isStocked: dto.isStocked,
          metadataJson: this.json(dto.metadataJson),
        },
        update: {
          unitCost: this.decimal(dto.unitCost),
          reorderLevel: this.decimal(dto.reorderLevel),
          currencyCode: location.currencyCode,
          isStocked: dto.isStocked,
          metadataJson: this.json(dto.metadataJson),
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: existing
            ? 'LOCATION_INVENTORY_ITEM_SETTING_UPDATED'
            : 'LOCATION_INVENTORY_ITEM_SETTING_CREATED',
          entityType: 'LocationInventoryItemSetting',
          entityId: setting.id,
          beforeJson: existing ? serializeJson(existing) : undefined,
          afterJson: serializeJson(setting),
          correlationId,
        },
        tx,
      );

      return setting;
    });

    return setting;
  }

  async deleteInventoryItemSetting(
    tenantId: string,
    locationId: string,
    inventoryItemId: string,
    actorId: string,
    correlationId: string | undefined,
  ) {
    await this.requireLocation(tenantId, locationId);

    const setting = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.locationInventoryItemSetting.findFirst({
        where: { tenantId, locationId, inventoryItemId },
      });
      if (!existing) {
        throw this.localSettingNotFound();
      }

      await tx.locationInventoryItemSetting.delete({
        where: { id: existing.id },
      });
      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'LOCATION_INVENTORY_ITEM_SETTING_DELETED',
          entityType: 'LocationInventoryItemSetting',
          entityId: existing.id,
          beforeJson: serializeJson(existing),
          correlationId,
        },
        tx,
      );

      return existing;
    });
  }

  async findSupplierItemSettings(tenantId: string, locationId: string) {
    await this.requireLocation(tenantId, locationId);

    return this.prisma.locationSupplierItemSetting.findMany({
      where: { tenantId, locationId },
      include: {
        supplierItem: { include: { inventoryItem: true, supplier: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findSupplierItemSetting(
    tenantId: string,
    locationId: string,
    supplierItemId: string,
  ) {
    await this.requireLocation(tenantId, locationId);

    return this.prisma.locationSupplierItemSetting.findFirst({
      where: { tenantId, locationId, supplierItemId },
      include: {
        supplierItem: { include: { inventoryItem: true, supplier: true } },
      },
    });
  }

  async upsertSupplierItemSetting(
    tenantId: string,
    locationId: string,
    supplierItemId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpsertSupplierItemSettingDto,
  ) {
    const [location] = await Promise.all([
      this.requireLocation(tenantId, locationId),
      this.requireSupplierItem(tenantId, supplierItemId),
    ]);

    const setting = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.locationSupplierItemSetting.findFirst({
        where: { tenantId, locationId, supplierItemId },
      });
      const setting = await tx.locationSupplierItemSetting.upsert({
        where: {
          tenantId_locationId_supplierItemId: {
            tenantId,
            locationId,
            supplierItemId,
          },
        },
        create: {
          tenantId,
          locationId,
          supplierItemId,
          currentPrice: this.decimal(dto.currentPrice),
          minOrderQty: this.decimal(dto.minOrderQty),
          currencyCode: location.currencyCode,
          isAvailable: dto.isAvailable,
          isPreferred: dto.isPreferred,
          metadataJson: this.json(dto.metadataJson),
        },
        update: {
          currentPrice: this.decimal(dto.currentPrice),
          minOrderQty: this.decimal(dto.minOrderQty),
          currencyCode: location.currencyCode,
          isAvailable: dto.isAvailable,
          isPreferred: dto.isPreferred,
          metadataJson: this.json(dto.metadataJson),
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: existing
            ? 'LOCATION_SUPPLIER_ITEM_SETTING_UPDATED'
            : 'LOCATION_SUPPLIER_ITEM_SETTING_CREATED',
          entityType: 'LocationSupplierItemSetting',
          entityId: setting.id,
          beforeJson: existing ? serializeJson(existing) : undefined,
          afterJson: serializeJson(setting),
          correlationId,
        },
        tx,
      );

      return setting;
    });

    return setting;
  }

  async deleteSupplierItemSetting(
    tenantId: string,
    locationId: string,
    supplierItemId: string,
    actorId: string,
    correlationId: string | undefined,
  ) {
    await this.requireLocation(tenantId, locationId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.locationSupplierItemSetting.findFirst({
        where: { tenantId, locationId, supplierItemId },
      });
      if (!existing) {
        throw this.localSettingNotFound();
      }

      await tx.locationSupplierItemSetting.delete({
        where: { id: existing.id },
      });
      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'LOCATION_SUPPLIER_ITEM_SETTING_DELETED',
          entityType: 'LocationSupplierItemSetting',
          entityId: existing.id,
          beforeJson: serializeJson(existing),
          correlationId,
        },
        tx,
      );

      return existing;
    });
  }

  async update(
    tenantId: string,
    id: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpdateLocationDto,
  ) {
    const record = await this.requireLocation(tenantId, id);
    const requestedMarket = this.resolveUpdateMarket(dto);
    const currentMarket = findMarket(record.countryCode);

    const location = await this.prisma.$transaction(async (tx) => {
      if (
        requestedMarket &&
        (record.countryCode !== requestedMarket.countryCode ||
          record.currencyCode !== requestedMarket.currencyCode)
      ) {
        const activity = await this.getOperationalActivity(tx, tenantId, id);
        if (this.totalOperationalActivity(activity) > 0) {
          throw new DomainException(
            'LOCATION_CURRENCY_LOCKED',
            'Location country and currency cannot change after operational activity has been recorded.',
            409,
            { activity },
          );
        }

        await Promise.all([
          tx.locationProductVariantSetting.updateMany({
            where: { tenantId, locationId: id },
            data: {
              sellingPrice: null,
              currencyCode: requestedMarket.currencyCode,
            },
          }),
          tx.locationInventoryItemSetting.updateMany({
            where: { tenantId, locationId: id },
            data: {
              unitCost: null,
              currencyCode: requestedMarket.currencyCode,
            },
          }),
          tx.locationSupplierItemSetting.updateMany({
            where: { tenantId, locationId: id },
            data: {
              currentPrice: null,
              currencyCode: requestedMarket.currencyCode,
            },
          }),
          tx.locationProfile.updateMany({
            where: { tenantId, locationId: id },
            data: {
              averageDailyRevenue: null,
              monthlyRent: null,
              currencyCode: requestedMarket.currencyCode,
            },
          }),
        ]);
      }

      if (dto.isPrimary) {
        await tx.location.updateMany({
          where: {
            tenantId,
            isPrimary: true,
            id: { not: id },
          },
          data: { isPrimary: false },
        });
      }

      const location = await tx.location.update({
        where: { id: record.id },
        data: this.toLocationUpdateInput(
          dto,
          requestedMarket,
          requestedMarket ?? currentMarket,
        ),
      });

      await tx.onboardingProgress.updateMany({
        where: {
          tenantId,
          userId: actorId,
        },
        data: {
          locationSetupStatus: SetupStepStatus.COMPLETED,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'LOCATION_UPDATED',
          entityType: 'Location',
          entityId: location.id,
          beforeJson: serializeJson(record),
          afterJson: serializeJson(location),
          correlationId,
        },
        tx,
      );

      return location;
    });

    await this.mirrorLocation(location);

    return location;
  }

  private async mirrorLocation(location: {
    id: string;
    tenantId: string;
    name: string;
    type: string;
    countryCode?: string | null;
    currencyCode?: string | null;
    isActive?: boolean | null;
  }) {
    await this.appwriteMirror.upsertOperationalRow('locations', {
      id: location.id,
      tenantId: location.tenantId,
      status: location.isActive === false ? 'INACTIVE' : 'ACTIVE',
      name: location.name,
      code: location.type,
      countryCode: location.countryCode,
      currencyCode: location.currencyCode,
      data: location,
    });
  }

  findProfile(tenantId: string, locationId: string) {
    return this.prisma.locationProfile.findFirst({
      where: { tenantId, locationId },
    });
  }

  async upsertProfile(
    tenantId: string,
    locationId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpsertLocationProfileDto,
  ) {
    const location = await this.requireLocation(tenantId, locationId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.locationProfile.findFirst({
        where: { tenantId, locationId },
      });

      const data: Prisma.LocationProfileUncheckedUpdateInput = {
        storeDisplayName: dto.storeDisplayName,
        storeManagerName: dto.storeManagerName,
        storeManagerPhone: dto.storeManagerPhone,
        seatingCapacity: dto.seatingCapacity,
        tableCount: dto.tableCount,
        kitchenType: dto.kitchenType,
        hasInHouseKitchen: dto.hasInHouseKitchen,
        hasCentralKitchen: dto.hasCentralKitchen,
        hasDelivery: dto.hasDelivery,
        hasTakeaway: dto.hasTakeaway,
        hasDineIn: dto.hasDineIn,
        hasWholesale: dto.hasWholesale,
        hasCatering: dto.hasCatering,
        serviceModes: dto.serviceModes
          ? serializeJson(dto.serviceModes)
          : Prisma.JsonNull,
        averageDailyOrders: dto.averageDailyOrders,
        averageDailyRevenue:
          dto.averageDailyRevenue !== undefined
            ? new Prisma.Decimal(dto.averageDailyRevenue)
            : undefined,
        monthlyRent:
          dto.monthlyRent !== undefined
            ? new Prisma.Decimal(dto.monthlyRent)
            : undefined,
        currencyCode: location.currencyCode,
        staffCount: dto.staffCount,
        productionStartTime: dto.productionStartTime,
        productionEndTime: dto.productionEndTime,
        peakHoursJson: dto.peakHoursJson
          ? serializeJson(dto.peakHoursJson)
          : Prisma.JsonNull,
        cuisineOrProductFocus: dto.cuisineOrProductFocus,
        signatureProductsJson: dto.signatureProductsJson
          ? serializeJson(dto.signatureProductsJson)
          : Prisma.JsonNull,
        targetCustomersJson: dto.targetCustomersJson
          ? serializeJson(dto.targetCustomersJson)
          : Prisma.JsonNull,
        pricePositioning: dto.pricePositioning,
        notes: dto.notes,
      };
      const createData: Prisma.LocationProfileUncheckedCreateInput = {
        tenantId,
        locationId,
        storeDisplayName: dto.storeDisplayName,
        storeManagerName: dto.storeManagerName,
        storeManagerPhone: dto.storeManagerPhone,
        seatingCapacity: dto.seatingCapacity,
        tableCount: dto.tableCount,
        kitchenType: dto.kitchenType,
        hasInHouseKitchen: dto.hasInHouseKitchen,
        hasCentralKitchen: dto.hasCentralKitchen,
        hasDelivery: dto.hasDelivery,
        hasTakeaway: dto.hasTakeaway,
        hasDineIn: dto.hasDineIn,
        hasWholesale: dto.hasWholesale,
        hasCatering: dto.hasCatering,
        serviceModes: dto.serviceModes
          ? serializeJson(dto.serviceModes)
          : Prisma.JsonNull,
        averageDailyOrders: dto.averageDailyOrders,
        averageDailyRevenue:
          dto.averageDailyRevenue !== undefined
            ? new Prisma.Decimal(dto.averageDailyRevenue)
            : undefined,
        monthlyRent:
          dto.monthlyRent !== undefined
            ? new Prisma.Decimal(dto.monthlyRent)
            : undefined,
        currencyCode: location.currencyCode,
        staffCount: dto.staffCount,
        productionStartTime: dto.productionStartTime,
        productionEndTime: dto.productionEndTime,
        peakHoursJson: dto.peakHoursJson
          ? serializeJson(dto.peakHoursJson)
          : Prisma.JsonNull,
        cuisineOrProductFocus: dto.cuisineOrProductFocus,
        signatureProductsJson: dto.signatureProductsJson
          ? serializeJson(dto.signatureProductsJson)
          : Prisma.JsonNull,
        targetCustomersJson: dto.targetCustomersJson
          ? serializeJson(dto.targetCustomersJson)
          : Prisma.JsonNull,
        pricePositioning: dto.pricePositioning,
        notes: dto.notes,
      };

      const profile = existing
        ? await tx.locationProfile.update({
            where: { locationId },
            data,
          })
        : await tx.locationProfile.create({
            data: createData,
          });

      await tx.onboardingProgress.updateMany({
        where: {
          tenantId,
          userId: actorId,
        },
        data: {
          cafeProfileStatus: SetupStepStatus.COMPLETED,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: existing
            ? 'LOCATION_PROFILE_UPDATED'
            : 'LOCATION_PROFILE_CREATED',
          entityType: 'LocationProfile',
          entityId: profile.id,
          beforeJson: existing ? serializeJson(existing) : undefined,
          afterJson: serializeJson(profile),
          correlationId,
        },
        tx,
      );

      return profile;
    });
  }

  getOpeningHours(tenantId: string, locationId: string) {
    return this.prisma.openingHour.findMany({
      where: { tenantId, locationId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async updateOpeningHours(
    tenantId: string,
    locationId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpdateOpeningHoursDto,
  ) {
    await this.requireLocation(tenantId, locationId);
    this.validateOpeningHours(dto.openingHours);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.openingHour.findMany({
        where: { tenantId, locationId },
      });

      await tx.openingHour.deleteMany({
        where: { tenantId, locationId },
      });

      if (!dto.openingHours.length) {
        await this.auditService.log(
          {
            tenantId,
            actorId,
            action: 'OPENING_HOURS_UPDATED',
            entityType: 'Location',
            entityId: locationId,
            beforeJson: serializeJson(existing),
            afterJson: serializeJson([]),
            correlationId,
          },
          tx,
        );

        return [];
      }

      await tx.openingHour.createMany({
        data: dto.openingHours.map((item) => ({
          tenantId,
          locationId,
          dayOfWeek: item.dayOfWeek,
          openTime: item.isClosed ? null : (item.openTime ?? null),
          closeTime: item.isClosed ? null : (item.closeTime ?? null),
          isClosed: item.isClosed ?? false,
        })),
      });

      const saved = await tx.openingHour.findMany({
        where: { tenantId, locationId },
        orderBy: { dayOfWeek: 'asc' },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'OPENING_HOURS_UPDATED',
          entityType: 'Location',
          entityId: locationId,
          beforeJson: serializeJson(existing),
          afterJson: serializeJson(saved),
          correlationId,
        },
        tx,
      );

      return saved;
    });
  }

  private async requireLocation(tenantId: string, id: string) {
    const location = await this.prisma.location.findFirst({
      where: { tenantId, id },
    });

    if (!location) {
      throw new DomainException(
        'LOCATION_NOT_FOUND',
        'Location not found',
        404,
      );
    }

    return location;
  }

  private async requireProductVariant(tenantId: string, id: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { tenantId, id },
    });
    if (!variant) {
      throw new DomainException(
        'PRODUCT_VARIANT_NOT_FOUND',
        'Product variant not found',
        404,
      );
    }

    return variant;
  }

  private async requireInventoryItem(tenantId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { tenantId, id },
    });
    if (!item) {
      throw new DomainException(
        'INVENTORY_ITEM_NOT_FOUND',
        'Inventory item not found',
        404,
      );
    }

    return item;
  }

  private async requireSupplierItem(tenantId: string, id: string) {
    const item = await this.prisma.supplierItem.findFirst({
      where: { tenantId, id },
    });
    if (!item) {
      throw new DomainException(
        'SUPPLIER_ITEM_NOT_FOUND',
        'Supplier item not found',
        404,
      );
    }

    return item;
  }

  private async getOperationalActivity(
    executor: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    locationId: string,
  ) {
    const [
      inventoryBalances,
      inventoryMovements,
      inventoryImports,
      procurementRequests,
      purchaseOrders,
      goodsReceipts,
      productionPlans,
      productionBatches,
      wasteEvents,
      qcChecks,
      dailyCloses,
    ] = await Promise.all([
      executor.inventoryBalance.count({ where: { tenantId, locationId } }),
      executor.inventoryMovement.count({ where: { tenantId, locationId } }),
      executor.inventoryImport.count({ where: { tenantId, locationId } }),
      executor.procurementRequest.count({ where: { tenantId, locationId } }),
      executor.purchaseOrder.count({ where: { tenantId, locationId } }),
      executor.goodsReceipt.count({ where: { tenantId, locationId } }),
      executor.productionPlan.count({ where: { tenantId, locationId } }),
      executor.productionBatch.count({ where: { tenantId, locationId } }),
      executor.wasteEvent.count({ where: { tenantId, locationId } }),
      executor.qCCheck.count({ where: { tenantId, locationId } }),
      executor.dailyClose.count({ where: { tenantId, locationId } }),
    ]);

    return {
      inventoryBalances,
      inventoryMovements,
      inventoryImports,
      procurementRequests,
      purchaseOrders,
      goodsReceipts,
      productionPlans,
      productionBatches,
      wasteEvents,
      qcChecks,
      dailyCloses,
    };
  }

  private totalOperationalActivity(activity: Record<string, number>) {
    return Object.values(activity).reduce((total, count) => total + count, 0);
  }

  private localSettingNotFound() {
    return new DomainException(
      'LOCATION_LOCAL_SETTING_NOT_FOUND',
      'Location local setting not found',
      404,
    );
  }

  private decimal(value: number | undefined) {
    return value !== undefined ? new Prisma.Decimal(value) : undefined;
  }

  private json(value: Record<string, unknown> | undefined) {
    return value !== undefined ? serializeJson(value) : undefined;
  }

  private resolveCreateMarket(dto: CreateLocationDto) {
    return this.requireMarket(
      dto.countryCode,
      dto.country ?? this.readAddressValue(dto.address, 'country'),
      true,
    );
  }

  private resolveUpdateMarket(dto: UpdateLocationDto) {
    const countryName =
      dto.country ?? this.readAddressValue(dto.address, 'country');
    if (!dto.countryCode && !countryName) {
      return undefined;
    }

    return this.requireMarket(dto.countryCode, countryName);
  }

  private requireMarket(
    countryCode: string | undefined,
    countryName: string | undefined,
    fallbackToIndia = false,
  ) {
    const normalizedCode =
      countryCode?.trim().toUpperCase() ??
      (fallbackToIndia && !countryName ? 'IN' : undefined);
    const byCode = normalizedCode ? findMarket(normalizedCode) : undefined;
    const byName = countryName ? findMarket(undefined, countryName) : undefined;

    if (normalizedCode && !byCode) {
      throw new DomainException(
        'UNSUPPORTED_MARKET',
        `Country code ${normalizedCode} is not in the supported market registry.`,
        400,
      );
    }
    if (!normalizedCode && countryName && !byName) {
      throw new DomainException(
        'UNSUPPORTED_MARKET',
        `Country ${countryName} is not in the supported market registry.`,
        400,
      );
    }
    if (byCode && byName && byCode.countryCode !== byName.countryCode) {
      throw new DomainException(
        'MARKET_COUNTRY_MISMATCH',
        'Country code and country name identify different markets.',
        400,
      );
    }

    const market = byCode ?? byName;
    if (!market) {
      throw new DomainException(
        'UNSUPPORTED_MARKET',
        'A supported market is required.',
        400,
      );
    }

    return market;
  }

  private toLocationCreateInput(
    tenantId: string,
    dto: CreateLocationDto,
    isPrimary: boolean,
    market: MarketDefinition,
  ): Prisma.LocationUncheckedCreateInput {
    const address = this.buildAddress(dto, market);

    return {
      tenantId,
      name: dto.name,
      type: dto.type,
      address,
      addressLine1:
        dto.addressLine1 ?? this.readAddressValue(dto.address, 'line1'),
      addressLine2:
        dto.addressLine2 ?? this.readAddressValue(dto.address, 'line2'),
      city: dto.city ?? this.readAddressValue(dto.address, 'city'),
      state:
        dto.state ??
        this.readAddressValue(dto.address, 'state') ??
        this.readAddressValue(dto.address, 'region'),
      postalCode:
        dto.postalCode ?? this.readAddressValue(dto.address, 'postalCode'),
      country: market.countryName,
      countryCode: market.countryCode,
      currencyCode: market.currencyCode,
      latitude:
        dto.latitude !== undefined
          ? new Prisma.Decimal(dto.latitude)
          : undefined,
      longitude:
        dto.longitude !== undefined
          ? new Prisma.Decimal(dto.longitude)
          : undefined,
      phone: dto.phone,
      email: dto.email,
      timezone: this.resolveLocationTimeZone(dto, market),
      isPrimary,
      isActive: dto.isActive ?? true,
    };
  }

  private toLocationUpdateInput(
    dto: UpdateLocationDto,
    market: MarketDefinition | undefined,
    timezoneMarket: MarketDefinition | undefined,
  ): Prisma.LocationUpdateInput {
    const address = this.buildAddress(dto, market);
    const timezone =
      dto.timezone !== undefined
        ? this.resolveLocationTimeZone(dto, timezoneMarket)
        : market
          ? this.resolveLocationTimeZone(dto, market)
          : undefined;

    return {
      name: dto.name,
      type: dto.type,
      address,
      addressLine1:
        dto.addressLine1 ?? this.readAddressValue(dto.address, 'line1'),
      addressLine2:
        dto.addressLine2 ?? this.readAddressValue(dto.address, 'line2'),
      city: dto.city ?? this.readAddressValue(dto.address, 'city'),
      state:
        dto.state ??
        this.readAddressValue(dto.address, 'state') ??
        this.readAddressValue(dto.address, 'region'),
      postalCode:
        dto.postalCode ?? this.readAddressValue(dto.address, 'postalCode'),
      country: market?.countryName,
      countryCode: market?.countryCode,
      currencyCode: market?.currencyCode,
      latitude:
        dto.latitude !== undefined
          ? new Prisma.Decimal(dto.latitude)
          : undefined,
      longitude:
        dto.longitude !== undefined
          ? new Prisma.Decimal(dto.longitude)
          : undefined,
      phone: dto.phone,
      email: dto.email,
      timezone,
      isPrimary: dto.isPrimary,
      isActive: dto.isActive,
    };
  }

  private resolveLocationTimeZone(
    dto: Pick<
      CreateLocationDto | UpdateLocationDto,
      'timezone' | 'city' | 'state' | 'address'
    >,
    market: MarketDefinition | undefined,
  ) {
    if (!market) {
      return dto.timezone;
    }

    const requestedTimezone = dto.timezone?.trim();
    if (requestedTimezone) {
      if (!isMarketTimeZone(market, requestedTimezone)) {
        throw new DomainException(
          'UNSUPPORTED_TIMEZONE',
          `Timezone ${requestedTimezone} is not supported for ${market.countryName}.`,
          400,
          {
            countryCode: market.countryCode,
            supportedTimeZones: market.timeZones.map((option) => option.value),
          },
        );
      }

      return requestedTimezone;
    }

    return inferMarketTimeZone(market, [
      dto.city,
      dto.state,
      this.readAddressValue(dto.address, 'city'),
      this.readAddressValue(dto.address, 'state'),
      this.readAddressValue(dto.address, 'region'),
    ]);
  }

  private buildAddress(
    dto: Pick<
      CreateLocationDto | UpdateLocationDto,
      | 'address'
      | 'addressLine1'
      | 'addressLine2'
      | 'city'
      | 'state'
      | 'postalCode'
      | 'country'
    >,
    market?: MarketDefinition,
  ): Prisma.InputJsonValue | undefined {
    if (dto.address) {
      return {
        ...dto.address,
        ...(market ? { country: market.countryName } : {}),
      } as Prisma.InputJsonValue;
    }

    const address = {
      line1: dto.addressLine1,
      line2: dto.addressLine2,
      city: dto.city,
      state: dto.state,
      postalCode: dto.postalCode,
      country: market?.countryName ?? dto.country,
    };

    return Object.values(address).some(Boolean)
      ? (address as Prisma.InputJsonValue)
      : undefined;
  }

  private readAddressValue(
    address: Record<string, unknown> | undefined,
    key: string,
  ) {
    const value = address?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private validateOpeningHours(openingHours: OpeningHourInputDto[]) {
    for (const item of openingHours) {
      if (item.isClosed) {
        continue;
      }

      if (!item.openTime || !item.closeTime) {
        throw new DomainException(
          'INVALID_OPENING_HOURS',
          `Opening and closing time are required for ${item.dayOfWeek}.`,
          400,
        );
      }

      if (item.closeTime <= item.openTime) {
        throw new DomainException(
          'INVALID_OPENING_HOURS',
          `Closing time must be after opening time for ${item.dayOfWeek}.`,
          400,
        );
      }
    }

    const days = new Set<DayOfWeek>();
    for (const item of openingHours) {
      if (days.has(item.dayOfWeek)) {
        throw new DomainException(
          'INVALID_OPENING_HOURS',
          `Duplicate opening-hour entry found for ${item.dayOfWeek}.`,
          400,
        );
      }
      days.add(item.dayOfWeek);
    }
  }
}
