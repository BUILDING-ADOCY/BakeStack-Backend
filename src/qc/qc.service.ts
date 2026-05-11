import { Injectable } from '@nestjs/common';
import { Prisma, QCStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { CreateQcCheckDto } from './dto/create-qc-check.dto';
import { QueryQcChecksDto } from './dto/query-qc-checks.dto';

@Injectable()
export class QcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  list(tenantId: string, query: QueryQcChecksDto) {
    return this.prisma.qCCheck.findMany({
      where: {
        tenantId,
        locationId: query.locationId,
        productionBatchId: query.productionBatchId,
        status: query.status,
      },
      include: {
        checkedBy: true,
        inventoryLot: {
          include: {
            inventoryItem: true,
          },
        },
        location: true,
        productionBatch: {
          include: {
            recipe: {
              include: {
                productVariant: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    tenantId: string,
    actorId: string,
    correlationId: string | undefined,
    dto: CreateQcCheckDto,
  ) {
    await this.requireLocation(tenantId, dto.locationId);

    const batch = dto.productionBatchId
      ? await this.requireBatch(tenantId, dto.productionBatchId, dto.locationId)
      : null;
    const lot = dto.inventoryLotId
      ? await this.requireLot(tenantId, dto.inventoryLotId)
      : null;

    return this.prisma.$transaction(async (tx) => {
      const qcCheck = await tx.qCCheck.create({
        data: {
          tenantId,
          locationId: dto.locationId,
          productionBatchId: batch?.id,
          inventoryLotId: lot?.id,
          status: dto.status,
          score:
            dto.score === undefined
              ? undefined
              : decimal(dto.score).toDecimalPlaces(2),
          notes: dto.notes,
          imageUrl: dto.imageUrl,
          checkedById: actorId,
        },
        include: {
          checkedBy: true,
          inventoryLot: {
            include: {
              inventoryItem: true,
            },
          },
          location: true,
          productionBatch: {
            include: {
              recipe: {
                include: {
                  productVariant: true,
                },
              },
            },
          },
        },
      });

      if (batch) {
        if (dto.status === QCStatus.HOLD || dto.status === QCStatus.FAILED) {
          await tx.productionBatch.update({
            where: { id: batch.id },
            data: { status: 'QC_HOLD' },
          });
        } else if (
          dto.status === QCStatus.RELEASED &&
          batch.status === 'QC_HOLD'
        ) {
          await tx.productionBatch.update({
            where: { id: batch.id },
            data: { status: 'COMPLETED' },
          });
        }
      }

      await this.auditService.log(
        {
          tenantId,
          actorId,
          action: 'qc.check_recorded',
          entityType: 'QCCheck',
          entityId: qcCheck.id,
          afterJson: qcCheck as unknown as Prisma.InputJsonValue,
          correlationId,
        },
        tx,
      );

      return qcCheck;
    });
  }

  private async requireLocation(tenantId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: {
        id: locationId,
        tenantId,
      },
    });

    if (!location) {
      throw new DomainException(
        'LOCATION_NOT_FOUND',
        'The selected location could not be found for this tenant.',
        404,
      );
    }

    return location;
  }

  private async requireBatch(
    tenantId: string,
    productionBatchId: string,
    locationId: string,
  ) {
    const batch = await this.prisma.productionBatch.findFirst({
      where: {
        id: productionBatchId,
        tenantId,
        locationId,
      },
    });

    if (!batch) {
      throw new DomainException(
        'PRODUCTION_BATCH_NOT_FOUND',
        'The selected production batch could not be found for this tenant and location.',
        404,
      );
    }

    return batch;
  }

  private async requireLot(tenantId: string, inventoryLotId: string) {
    const lot = await this.prisma.inventoryLot.findFirst({
      where: {
        id: inventoryLotId,
        tenantId,
      },
    });

    if (!lot) {
      throw new DomainException(
        'INVENTORY_LOT_NOT_FOUND',
        'The selected inventory lot could not be found for this tenant.',
        404,
      );
    }

    return lot;
  }
}
