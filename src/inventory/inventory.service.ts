import { Injectable } from '@nestjs/common';
import {
  InventoryImportStatus,
  InventoryItemType,
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import {
  applyInventoryDelta,
  InventoryDeltaInput,
  InventoryExecutor,
} from '../common/prisma/inventory-ledger';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { CreateInventoryImportDto } from './dto/create-inventory-import.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateOpeningStockDto } from './dto/create-opening-stock.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { QueryInventoryImportsDto } from './dto/query-inventory-imports.dto';
import { QueryInventoryMovementsDto } from './dto/query-inventory-movements.dto';
import { QueryInventoryStockDto } from './dto/query-inventory-stock.dto';

type ParsedImportRow = Record<string, string>;

interface InventoryImportError {
  rowNumber: number;
  itemName?: string | null;
  message: string;
  row: ParsedImportRow;
}

interface InventoryImportSummary {
  columns: string[];
  continueOnError: boolean;
  errors: InventoryImportError[];
  importedAt: string;
}

interface ImportedItemResult {
  item: Prisma.InventoryItemGetPayload<Record<string, never>>;
  created: boolean;
  updated: boolean;
}

const MAX_IMPORT_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_REPORTED_ERRORS = 25;
const TRUE_LITERALS = new Set(['true', '1', 'yes', 'y']);
const FALSE_LITERALS = new Set(['false', '0', 'no', 'n']);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  createItem(
    dto: CreateInventoryItemDto,
    executor: InventoryExecutor = this.prisma,
  ) {
    return executor.inventoryItem.create({
      data: {
        ...dto,
        unitCost: decimal(dto.unitCost),
        reorderLevel:
          dto.reorderLevel === undefined
            ? undefined
            : decimal(dto.reorderLevel),
      },
    });
  }

  listItems(tenantId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  listImports(query: QueryInventoryImportsDto) {
    return this.prisma.inventoryImport.findMany({
      where: {
        tenantId: query.tenantId,
        locationId: query.locationId,
      },
      select: {
        id: true,
        tenantId: true,
        locationId: true,
        uploadedById: true,
        fileName: true,
        contentType: true,
        fileSizeBytes: true,
        status: true,
        totalRows: true,
        processedRows: true,
        createdItemsCount: true,
        updatedItemsCount: true,
        openingStockRowsCount: true,
        errorCount: true,
        summaryJson: true,
        createdAt: true,
        updatedAt: true,
        location: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  getBalances(query: QueryInventoryStockDto) {
    return this.prisma.inventoryBalance.findMany({
      where: {
        tenantId: query.tenantId,
        locationId: query.locationId,
        inventoryItemId: query.inventoryItemId,
      },
      include: {
        inventoryItem: true,
        lot: true,
      },
      orderBy: [{ inventoryItemId: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  getMovements(query: QueryInventoryMovementsDto) {
    return this.prisma.inventoryMovement.findMany({
      where: {
        tenantId: query.tenantId,
        locationId: query.locationId,
        inventoryItemId: query.inventoryItemId,
      },
      include: {
        inventoryItem: true,
        lot: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  recordMovement(
    input: InventoryDeltaInput,
    executor: InventoryExecutor = this.prisma,
  ) {
    return applyInventoryDelta(executor, input);
  }

  async adjustStock(dto: CreateInventoryAdjustmentDto) {
    const item = await this.requireInventoryItem(
      dto.tenantId,
      dto.inventoryItemId,
    );

    return this.prisma.$transaction((tx) =>
      this.adjustStockWithExecutor(tx, dto, item),
    );
  }

  async recordOpeningStock(dto: CreateOpeningStockDto) {
    const item = await this.requireInventoryItem(
      dto.tenantId,
      dto.inventoryItemId,
    );

    return this.prisma.$transaction((tx) =>
      this.recordOpeningStockWithExecutor(tx, dto, item),
    );
  }

  async recordWastage(dto: CreateWastageDto) {
    const item = await this.requireInventoryItem(
      dto.tenantId,
      dto.inventoryItemId,
    );

    return this.prisma.$transaction((tx) =>
      this.recordWastageWithExecutor(tx, dto, item),
    );
  }

  async importFile(dto: CreateInventoryImportDto, file?: Express.Multer.File) {
    if (!file) {
      throw new DomainException(
        'INVENTORY_IMPORT_FILE_REQUIRED',
        'Attach a CSV file to continue.',
        400,
      );
    }

    await this.requireLocation(dto.tenantId, dto.locationId);

    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw new DomainException(
        'INVENTORY_IMPORT_FILE_TOO_LARGE',
        'Inventory imports are limited to 2 MB CSV files.',
        400,
      );
    }

    const sourceFileText = file.buffer.toString('utf8');
    const parsed = this.parseImportFile(sourceFileText);
    const continueOnError = dto.continueOnError ?? true;

    const importJob = await this.prisma.inventoryImport.create({
      data: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        uploadedById: dto.uploadedById,
        fileName: file.originalname,
        contentType: file.mimetype || null,
        fileSizeBytes: file.size,
        sourceFileText,
        status: InventoryImportStatus.PROCESSING,
        totalRows: parsed.rows.length,
        summaryJson: {
          columns: parsed.columns,
          continueOnError,
          errors: [],
          importedAt: new Date().toISOString(),
        },
      },
    });

    let processedRows = 0;
    let createdItemsCount = 0;
    let updatedItemsCount = 0;
    let openingStockRowsCount = 0;
    const errors: InventoryImportError[] = [];

    for (const [index, row] of parsed.rows.entries()) {
      const rowNumber = index + 2;

      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const importedItem = await this.upsertItemFromImport(
            tx,
            dto.tenantId,
            dto.uploadedById,
            row,
            rowNumber,
          );

          const openingQty = this.parseOptionalNumber(row, rowNumber, [
            'openingQty',
            'openingQuantity',
            'qty',
            'quantity',
          ]);

          if (openingQty !== null && openingQty > 0) {
            await this.recordOpeningStockWithExecutor(
              tx,
              {
                tenantId: dto.tenantId,
                locationId: dto.locationId,
                inventoryItemId: importedItem.item.id,
                quantity: openingQty,
                unitCost:
                  this.parseOptionalNumber(row, rowNumber, ['unitCost']) ??
                  Number(importedItem.item.unitCost),
                supplierBatchNo: this.getOptionalString(row, [
                  'supplierBatchNo',
                  'batchNo',
                ]),
                expiryAt: this.parseOptionalDateString(row, rowNumber, [
                  'expiryAt',
                  'expiryDate',
                ]),
                createdById: dto.uploadedById,
              },
              importedItem.item,
              {
                referenceType: 'InventoryImport',
                referenceId: importJob.id,
                reason: 'Opening stock imported from CSV.',
              },
            );
          }

          return {
            created: importedItem.created,
            updated: importedItem.updated,
            openingStockApplied: openingQty !== null && openingQty > 0,
          };
        });

        processedRows += 1;
        if (result.created) {
          createdItemsCount += 1;
        }
        if (result.updated) {
          updatedItemsCount += 1;
        }
        if (result.openingStockApplied) {
          openingStockRowsCount += 1;
        }
      } catch (error) {
        errors.push({
          rowNumber,
          itemName:
            this.getOptionalString(row, ['itemName', 'name', 'item']) ?? null,
          message:
            error instanceof DomainException || error instanceof Error
              ? error.message
              : 'The row could not be imported.',
          row,
        });

        if (!continueOnError) {
          break;
        }
      }
    }

    const errorCount = errors.length;
    const status =
      processedRows === 0
        ? InventoryImportStatus.FAILED
        : errorCount > 0
          ? InventoryImportStatus.COMPLETED_WITH_ERRORS
          : InventoryImportStatus.COMPLETED;

    const summary: InventoryImportSummary = {
      columns: parsed.columns,
      continueOnError,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
      importedAt: new Date().toISOString(),
    };

    const updatedImport = await this.prisma.inventoryImport.update({
      where: { id: importJob.id },
      data: {
        status,
        processedRows,
        createdItemsCount,
        updatedItemsCount,
        openingStockRowsCount,
        errorCount,
        summaryJson: summary as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        tenantId: true,
        locationId: true,
        uploadedById: true,
        fileName: true,
        contentType: true,
        fileSizeBytes: true,
        status: true,
        totalRows: true,
        processedRows: true,
        createdItemsCount: true,
        updatedItemsCount: true,
        openingStockRowsCount: true,
        errorCount: true,
        summaryJson: true,
        createdAt: true,
        updatedAt: true,
        location: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    await this.auditService.log({
      tenantId: dto.tenantId,
      actorId: dto.uploadedById,
      action: `inventory.import.${status.toLowerCase()}`,
      entityType: 'InventoryImport',
      entityId: updatedImport.id,
      afterJson: updatedImport as unknown as Prisma.InputJsonValue,
    });

    return updatedImport;
  }

  private async adjustStockWithExecutor(
    executor: InventoryExecutor,
    dto: CreateInventoryAdjustmentDto,
    item?: Prisma.InventoryItemGetPayload<Record<string, never>>,
  ) {
    const resolvedItem =
      item ??
      (await this.requireInventoryItem(
        dto.tenantId,
        dto.inventoryItemId,
        executor,
      ));
    const resolvedLotId =
      dto.adjustmentType === 'DECREASE'
        ? await this.resolveLotIdForReduction(executor, {
            tenantId: dto.tenantId,
            locationId: dto.locationId,
            inventoryItemId: dto.inventoryItemId,
            quantity: dto.quantity,
            lotId: dto.lotId,
          })
        : dto.lotId;
    const quantityDelta =
      dto.adjustmentType === 'DECREASE' ? -dto.quantity : dto.quantity;

    const result = await this.recordMovement(
      {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        inventoryItemId: dto.inventoryItemId,
        lotId: resolvedLotId,
        quantityDelta,
        unitCost: dto.unitCost ?? Number(resolvedItem.unitCost),
        movementType:
          dto.movementType ?? InventoryMovementType.STOCK_ADJUSTMENT,
        referenceType: 'InventoryAdjustment',
        reason: dto.reason,
        createdById: dto.createdById,
      },
      executor,
    );

    await this.auditService.log(
      {
        tenantId: dto.tenantId,
        actorId: dto.createdById,
        action: 'inventory.adjusted',
        entityType: 'InventoryItem',
        entityId: dto.inventoryItemId,
        afterJson: result as unknown as Prisma.InputJsonValue,
      },
      executor,
    );

    return result;
  }

  private async recordOpeningStockWithExecutor(
    executor: InventoryExecutor,
    dto: CreateOpeningStockDto,
    item?: Prisma.InventoryItemGetPayload<Record<string, never>>,
    options?: {
      referenceType?: string;
      referenceId?: string | null;
      reason?: string;
    },
  ) {
    const resolvedItem =
      item ??
      (await this.requireInventoryItem(
        dto.tenantId,
        dto.inventoryItemId,
        executor,
      ));
    const lotId = dto.lotId
      ? dto.lotId
      : dto.supplierId || dto.supplierBatchNo || dto.expiryAt
        ? (
            await this.findOrCreateLot(executor, {
              tenantId: dto.tenantId,
              inventoryItemId: dto.inventoryItemId,
              supplierId: dto.supplierId,
              supplierBatchNo: dto.supplierBatchNo,
              expiryAt: dto.expiryAt,
            })
          ).id
        : null;

    const result = await this.recordMovement(
      {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        inventoryItemId: dto.inventoryItemId,
        lotId,
        quantityDelta: dto.quantity,
        unitCost: dto.unitCost ?? Number(resolvedItem.unitCost),
        movementType: InventoryMovementType.OPENING_STOCK,
        referenceType: options?.referenceType ?? 'OpeningStock',
        referenceId: options?.referenceId ?? null,
        reason: options?.reason ?? 'Opening stock',
        createdById: dto.createdById,
      },
      executor,
    );

    await this.auditService.log(
      {
        tenantId: dto.tenantId,
        actorId: dto.createdById,
        action: 'inventory.opening_stock_recorded',
        entityType: 'InventoryItem',
        entityId: dto.inventoryItemId,
        afterJson: result as unknown as Prisma.InputJsonValue,
      },
      executor,
    );

    return result;
  }

  private async recordWastageWithExecutor(
    executor: InventoryExecutor,
    dto: CreateWastageDto,
    item?: Prisma.InventoryItemGetPayload<Record<string, never>>,
  ) {
    const resolvedItem =
      item ??
      (await this.requireInventoryItem(
        dto.tenantId,
        dto.inventoryItemId,
        executor,
      ));
    const resolvedLotId = await this.resolveLotIdForReduction(executor, {
      tenantId: dto.tenantId,
      locationId: dto.locationId,
      inventoryItemId: dto.inventoryItemId,
      quantity: dto.quantity,
      lotId: dto.lotId,
    });
    const costImpact = decimal(dto.quantity).mul(resolvedItem.unitCost);

    const result = await this.recordMovement(
      {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        inventoryItemId: dto.inventoryItemId,
        lotId: resolvedLotId,
        quantityDelta: -dto.quantity,
        unitCost: resolvedItem.unitCost,
        movementType: InventoryMovementType.WASTAGE,
        referenceType: 'WasteEvent',
        reason: dto.notes ?? dto.reasonCode,
        createdById: dto.recordedById,
      },
      executor,
    );

    const wasteEvent = await executor.wasteEvent.create({
      data: {
        tenantId: dto.tenantId,
        locationId: dto.locationId,
        inventoryItemId: dto.inventoryItemId,
        lotId: resolvedLotId,
        productionBatchId: dto.productionBatchId,
        quantity: decimal(dto.quantity),
        uom: dto.uom,
        reasonCode: dto.reasonCode,
        notes: dto.notes,
        costImpact,
        recordedById: dto.recordedById,
      },
    });

    await this.auditService.log(
      {
        tenantId: dto.tenantId,
        actorId: dto.recordedById,
        action: 'inventory.wastage_recorded',
        entityType: 'WasteEvent',
        entityId: wasteEvent.id,
        afterJson: wasteEvent as unknown as Prisma.InputJsonValue,
      },
      executor,
    );

    return { ...result, wasteEvent };
  }

  private async upsertItemFromImport(
    executor: InventoryExecutor,
    tenantId: string,
    uploadedById: string | undefined,
    row: ParsedImportRow,
    rowNumber: number,
  ): Promise<ImportedItemResult> {
    const itemName = this.requireString(row, rowNumber, [
      'itemName',
      'name',
      'item',
    ]);
    const existing = await executor.inventoryItem.findFirst({
      where: {
        tenantId,
        name: itemName,
        deletedAt: null,
      },
    });

    const type = this.parseOptionalInventoryItemType(row, rowNumber, ['type']);
    const defaultUom = this.getOptionalString(row, [
      'defaultUom',
      'uom',
      'unit',
    ]);
    const unitCost = this.parseOptionalNumber(row, rowNumber, ['unitCost']);
    const reorderLevel = this.parseOptionalNumber(row, rowNumber, [
      'reorderLevel',
    ]);
    const shelfLifeDays = this.parseOptionalInteger(row, rowNumber, [
      'shelfLifeDays',
    ]);
    const isPerishable = this.parseOptionalBoolean(row, rowNumber, [
      'isPerishable',
    ]);

    if (!existing) {
      if (!type) {
        throw new DomainException(
          'INVENTORY_IMPORT_TYPE_REQUIRED',
          `Type is required for new item "${itemName}".`,
          400,
        );
      }

      if (!defaultUom) {
        throw new DomainException(
          'INVENTORY_IMPORT_UOM_REQUIRED',
          `Default UOM is required for new item "${itemName}".`,
          400,
        );
      }

      if (unitCost === null) {
        throw new DomainException(
          'INVENTORY_IMPORT_UNIT_COST_REQUIRED',
          `Unit cost is required for new item "${itemName}".`,
          400,
        );
      }

      const created = await this.createItem(
        {
          tenantId,
          name: itemName,
          type,
          defaultUom,
          unitCost,
          reorderLevel: reorderLevel ?? undefined,
          shelfLifeDays: shelfLifeDays ?? undefined,
          isPerishable: isPerishable ?? undefined,
        },
        executor,
      );

      await this.auditService.log(
        {
          tenantId,
          actorId: uploadedById,
          action: 'inventory.item_created',
          entityType: 'InventoryItem',
          entityId: created.id,
          afterJson: created as unknown as Prisma.InputJsonValue,
        },
        executor,
      );

      return {
        item: created,
        created: true,
        updated: false,
      };
    }

    const nextType = type ?? existing.type;
    const nextDefaultUom = defaultUom ?? existing.defaultUom;
    const nextUnitCost = unitCost ?? Number(existing.unitCost);
    const nextReorderLevel =
      reorderLevel === null ? existing.reorderLevel : decimal(reorderLevel);
    const nextShelfLifeDays =
      shelfLifeDays === null ? existing.shelfLifeDays : shelfLifeDays;
    const nextIsPerishable =
      isPerishable === null ? existing.isPerishable : isPerishable;

    const unchanged =
      existing.type === nextType &&
      existing.defaultUom === nextDefaultUom &&
      Number(existing.unitCost) === nextUnitCost &&
      Number(existing.reorderLevel ?? 0) ===
        Number(nextReorderLevel ?? existing.reorderLevel ?? 0) &&
      (existing.shelfLifeDays ?? null) === nextShelfLifeDays &&
      existing.isPerishable === nextIsPerishable;

    if (unchanged) {
      return {
        item: existing,
        created: false,
        updated: false,
      };
    }

    const updated = await executor.inventoryItem.update({
      where: { id: existing.id },
      data: {
        type: nextType,
        defaultUom: nextDefaultUom,
        unitCost: decimal(nextUnitCost),
        reorderLevel: nextReorderLevel,
        shelfLifeDays: nextShelfLifeDays,
        isPerishable: nextIsPerishable,
      },
    });

    await this.auditService.log(
      {
        tenantId,
        actorId: uploadedById,
        action: 'inventory.item_updated',
        entityType: 'InventoryItem',
        entityId: updated.id,
        beforeJson: existing as unknown as Prisma.InputJsonValue,
        afterJson: updated as unknown as Prisma.InputJsonValue,
      },
      executor,
    );

    return {
      item: updated,
      created: false,
      updated: true,
    };
  }

  private parseImportFile(sourceFileText: string) {
    const trimmed = sourceFileText.trim();
    if (!trimmed) {
      throw new DomainException(
        'INVENTORY_IMPORT_EMPTY',
        'The uploaded CSV file is empty.',
        400,
      );
    }

    let records: Array<Record<string, string>>;
    try {
      records = parse(sourceFileText.replace(/^\uFEFF/, ''), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>;
    } catch (error) {
      throw new DomainException(
        'INVENTORY_IMPORT_INVALID_CSV',
        error instanceof Error
          ? error.message
          : 'The uploaded file is not a valid CSV.',
        400,
      );
    }

    if (!records.length) {
      throw new DomainException(
        'INVENTORY_IMPORT_EMPTY',
        'The uploaded CSV file does not contain any rows.',
        400,
      );
    }

    const columns = Object.keys(records[0] ?? {});
    return {
      columns,
      rows: records.map((record) =>
        Object.fromEntries(
          Object.entries(record).map(([key, value]) => [
            this.normalizeHeader(key),
            typeof value === 'string' ? value.trim() : '',
          ]),
        ),
      ),
    };
  }

  private normalizeHeader(value: string) {
    return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  }

  private getOptionalString(row: ParsedImportRow, keys: string[]) {
    for (const key of keys) {
      const value = row[this.normalizeHeader(key)];
      if (value !== undefined && value !== '') {
        return value;
      }
    }

    return undefined;
  }

  private requireString(
    row: ParsedImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const value = this.getOptionalString(row, keys);
    if (value) {
      return value;
    }

    throw new DomainException(
      'INVENTORY_IMPORT_REQUIRED_VALUE',
      `Row ${rowNumber || 1} is missing ${keys[0]}.`,
      400,
    );
  }

  private parseOptionalNumber(
    row: ParsedImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const value = this.getOptionalString(row, keys);
    if (value === undefined) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new DomainException(
        'INVENTORY_IMPORT_INVALID_NUMBER',
        `Row ${rowNumber || 1} has an invalid ${keys[0]}.`,
        400,
      );
    }

    return parsed;
  }

  private parseOptionalInteger(
    row: ParsedImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const parsed = this.parseOptionalNumber(row, rowNumber, keys);
    if (parsed === null) {
      return null;
    }

    if (!Number.isInteger(parsed)) {
      throw new DomainException(
        'INVENTORY_IMPORT_INVALID_INTEGER',
        `Row ${rowNumber || 1} has an invalid ${keys[0]}.`,
        400,
      );
    }

    return parsed;
  }

  private parseOptionalBoolean(
    row: ParsedImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const value = this.getOptionalString(row, keys);
    if (value === undefined) {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (TRUE_LITERALS.has(normalized)) {
      return true;
    }
    if (FALSE_LITERALS.has(normalized)) {
      return false;
    }

    throw new DomainException(
      'INVENTORY_IMPORT_INVALID_BOOLEAN',
      `Row ${rowNumber || 1} has an invalid ${keys[0]}.`,
      400,
    );
  }

  private parseOptionalInventoryItemType(
    row: ParsedImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const value = this.getOptionalString(row, keys);
    if (!value) {
      return null;
    }

    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');

    if (
      !Object.values(InventoryItemType).includes(
        normalized as InventoryItemType,
      )
    ) {
      throw new DomainException(
        'INVENTORY_IMPORT_INVALID_TYPE',
        `Row ${rowNumber || 1} has an unsupported inventory type "${value}".`,
        400,
      );
    }

    return normalized as InventoryItemType;
  }

  private parseOptionalDateString(
    row: ParsedImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const value = this.getOptionalString(row, keys);
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new DomainException(
        'INVENTORY_IMPORT_INVALID_DATE',
        `Row ${rowNumber || 1} has an invalid ${keys[0]}.`,
        400,
      );
    }

    return parsed.toISOString();
  }

  private async requireInventoryItem(
    tenantId: string,
    inventoryItemId: string,
    executor: InventoryExecutor = this.prisma,
  ) {
    const item = await executor.inventoryItem.findFirst({
      where: {
        tenantId,
        id: inventoryItemId,
        deletedAt: null,
      },
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

  private async requireLocation(
    tenantId: string,
    locationId: string,
    executor: InventoryExecutor = this.prisma,
  ) {
    const location = await executor.location.findFirst({
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

  private async resolveLotIdForReduction(
    executor: InventoryExecutor,
    input: {
      tenantId: string;
      locationId: string;
      inventoryItemId: string;
      quantity: number;
      lotId?: string | null;
    },
  ) {
    if (input.lotId) {
      return input.lotId;
    }

    const balances = await executor.inventoryBalance.findMany({
      where: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        inventoryItemId: input.inventoryItemId,
        availableQty: {
          gt: decimal(0),
        },
      },
      include: {
        lot: {
          select: {
            expiryAt: true,
          },
        },
      },
    });

    if (balances.length === 0) {
      return null;
    }

    const sortedBalances = [...balances].sort((left, right) => {
      const leftExpiry =
        left.lot?.expiryAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightExpiry =
        right.lot?.expiryAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

      if (leftExpiry !== rightExpiry) {
        return leftExpiry - rightExpiry;
      }

      return left.updatedAt.getTime() - right.updatedAt.getTime();
    });

    const preferredBalance = sortedBalances[0];
    if (
      sortedBalances.length === 1 ||
      decimal(preferredBalance.availableQty).greaterThanOrEqualTo(
        input.quantity,
      )
    ) {
      return preferredBalance.lotId;
    }

    throw new DomainException(
      'LOT_SELECTION_REQUIRED',
      'Select a specific lot for this stock reduction because the quantity spans multiple lots.',
      400,
    );
  }

  private async findOrCreateLot(
    executor: InventoryExecutor,
    input: {
      tenantId: string;
      inventoryItemId: string;
      supplierId?: string;
      supplierBatchNo?: string;
      expiryAt?: string;
    },
  ) {
    if (input.supplierBatchNo) {
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
    }

    return executor.inventoryLot.create({
      data: {
        tenantId: input.tenantId,
        inventoryItemId: input.inventoryItemId,
        supplierId: input.supplierId,
        supplierBatchNo: input.supplierBatchNo,
        receivedAt: new Date(),
        expiryAt: input.expiryAt ? new Date(input.expiryAt) : undefined,
      },
    });
  }
}
