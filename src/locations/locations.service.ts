import { Injectable } from '@nestjs/common';
import { Prisma, SetupStepStatus, type DayOfWeek } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import {
  OpeningHourInputDto,
  UpdateOpeningHoursDto,
} from './dto/update-opening-hours.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpsertLocationProfileDto } from './dto/upsert-location-profile.dto';

const serializeJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    tenantId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: CreateLocationDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
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
        data: this.toLocationCreateInput(tenantId, dto, primary),
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

  async update(
    tenantId: string,
    id: string,
    actorId: string,
    correlationId: string | undefined,
    dto: UpdateLocationDto,
  ) {
    const record = await this.requireLocation(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
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
        data: this.toLocationUpdateInput(dto),
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
    await this.requireLocation(tenantId, locationId);

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

  private toLocationCreateInput(
    tenantId: string,
    dto: CreateLocationDto,
    isPrimary: boolean,
  ): Prisma.LocationUncheckedCreateInput {
    const address = this.buildAddress(dto);

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
      country:
        dto.country ?? this.readAddressValue(dto.address, 'country') ?? 'India',
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
      timezone: dto.timezone ?? 'Asia/Kolkata',
      isPrimary,
      isActive: dto.isActive ?? true,
    };
  }

  private toLocationUpdateInput(
    dto: UpdateLocationDto,
  ): Prisma.LocationUpdateInput {
    const address = this.buildAddress(dto);

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
      country:
        dto.country ??
        this.readAddressValue(dto.address, 'country') ??
        undefined,
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
      timezone: dto.timezone,
      isPrimary: dto.isPrimary,
      isActive: dto.isActive,
    };
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
  ): Prisma.InputJsonValue | undefined {
    if (dto.address) {
      return dto.address as Prisma.InputJsonValue;
    }

    const address = {
      line1: dto.addressLine1,
      line2: dto.addressLine2,
      city: dto.city,
      state: dto.state,
      postalCode: dto.postalCode,
      country: dto.country,
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
