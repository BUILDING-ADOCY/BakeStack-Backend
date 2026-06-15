import { Injectable } from '@nestjs/common';
import { Prisma, ProductImportStatus, ProductStatus } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { AppwriteMirrorService } from '../appwrite/appwrite-mirror.service';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductImportDto } from './dto/create-product-import.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

type ProductExecutor = Prisma.TransactionClient | PrismaService;
type ParsedProductImportRow = Record<string, string>;

interface ProductImportError {
  rowNumber: number;
  productName?: string | null;
  message: string;
  row: ParsedProductImportRow;
}

interface ProductImportSummary {
  columns: string[];
  continueOnError: boolean;
  worksheetName?: string;
  errors: ProductImportError[];
  importedAt: string;
}

interface ParsedProductImportFile {
  columns: string[];
  rows: ParsedProductImportRow[];
  sourceFileText: string;
  worksheetName?: string;
}

interface ImportedCategoryResult {
  category: Prisma.ProductCategoryGetPayload<Record<string, never>>;
  created: boolean;
}

interface ImportedProductResult {
  product: Prisma.ProductGetPayload<Record<string, never>>;
  created: boolean;
  updated: boolean;
}

interface ImportedVariantResult {
  variant: Prisma.ProductVariantGetPayload<Record<string, never>>;
  created: boolean;
  updated: boolean;
}

const MAX_PRODUCT_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_REPORTED_ERRORS = 25;
const PRODUCT_IMPORT_SELECT = {
  id: true,
  tenantId: true,
  uploadedById: true,
  fileName: true,
  contentType: true,
  fileSizeBytes: true,
  status: true,
  totalRows: true,
  processedRows: true,
  createdCategoriesCount: true,
  createdProductsCount: true,
  updatedProductsCount: true,
  createdVariantsCount: true,
  updatedVariantsCount: true,
  errorCount: true,
  summaryJson: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: {
    select: {
      id: true,
      displayName: true,
      email: true,
    },
  },
} satisfies Prisma.ProductImportSelect;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly appwriteMirror: AppwriteMirrorService,
  ) {}

  createCategory(
    dto: CreateProductCategoryDto,
    executor: ProductExecutor = this.prisma,
  ) {
    return executor.productCategory.create({
      data: dto,
    });
  }

  listCategories(tenantId: string) {
    return this.prisma.productCategory.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateProductDto, executor: ProductExecutor = this.prisma) {
    const product = await executor.product.create({
      data: {
        tenantId: dto.tenantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        status: dto.status,
        allergenJson: dto.allergenJson as Prisma.InputJsonValue | undefined,
        shelfLifeHours: dto.shelfLifeHours,
      },
    });

    if (executor === this.prisma) {
      await this.mirrorProduct(product);
    }

    return product;
  }

  findAll(tenantId: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      include: {
        category: true,
        variants: {
          where: { deletedAt: null },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        id,
        deletedAt: null,
      },
      include: {
        category: true,
        variants: {
          where: { deletedAt: null },
        },
      },
    });

    if (!product) {
      throw new DomainException('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }

    return product;
  }

  listImports(tenantId: string) {
    return this.prisma.productImport.findMany({
      where: { tenantId },
      select: PRODUCT_IMPORT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    const record = await this.prisma.product.findFirst({
      where: { tenantId, id, deletedAt: null },
    });

    if (!record) {
      throw new DomainException('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }

    const product = await this.prisma.product.update({
      where: { id: record.id },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        status: dto.status,
        allergenJson: dto.allergenJson as Prisma.InputJsonValue | undefined,
        shelfLifeHours: dto.shelfLifeHours,
      },
    });

    await this.mirrorProduct(product);

    return product;
  }

  async remove(tenantId: string, id: string) {
    const record = await this.prisma.product.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: {
        variants: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!record) {
      throw new DomainException('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }

    const deletedAt = new Date();
    const variantIds = record.variants.map((variant) => variant.id);
    const locationSettingIds =
      variantIds.length > 0
        ? await this.prisma.locationProductVariantSetting.findMany({
            where: {
              tenantId,
              productVariantId: { in: variantIds },
            },
            select: { id: true },
          })
        : [];

    const product = await this.prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: record.id },
        data: {
          status: ProductStatus.ARCHIVED,
          deletedAt,
        },
      });

      if (variantIds.length > 0) {
        await tx.productVariant.updateMany({
          where: {
            tenantId,
            id: { in: variantIds },
            deletedAt: null,
          },
          data: {
            status: ProductStatus.ARCHIVED,
            deletedAt,
          },
        });
      }

      return updatedProduct;
    });

    await Promise.all([
      this.appwriteMirror.deleteOperationalRow('products', product.id),
      ...variantIds.map((variantId) =>
        this.appwriteMirror.deleteOperationalRow('productVariants', variantId),
      ),
      ...locationSettingIds.map((setting) =>
        this.appwriteMirror.deleteOperationalRow(
          'locationProductVariantSettings',
          setting.id,
        ),
      ),
    ]);

    return product;
  }

  async createVariant(
    dto: CreateProductVariantDto,
    executor: ProductExecutor = this.prisma,
  ) {
    const product = await executor.product.findFirst({
      where: { id: dto.productId, tenantId: dto.tenantId, deletedAt: null },
    });

    if (!product) {
      throw new DomainException(
        'PRODUCT_NOT_FOUND',
        'Cannot create a variant for a missing product',
        404,
      );
    }

    const variant = await executor.productVariant.create({
      data: {
        ...dto,
        defaultSellingPrice:
          dto.defaultSellingPrice === undefined
            ? undefined
            : new Prisma.Decimal(dto.defaultSellingPrice),
      },
    });

    if (executor === this.prisma) {
      await this.mirrorProductVariant(variant);
    }

    return variant;
  }

  async updateVariant(
    tenantId: string,
    id: string,
    dto: UpdateProductVariantDto,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!variant) {
      throw new DomainException(
        'PRODUCT_VARIANT_NOT_FOUND',
        'Product variant not found',
        404,
      );
    }

    const updatedVariant = await this.prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        ...dto,
        defaultSellingPrice:
          dto.defaultSellingPrice === undefined
            ? undefined
            : new Prisma.Decimal(dto.defaultSellingPrice),
      },
    });

    await this.mirrorProductVariant(updatedVariant);

    return updatedVariant;
  }

  async importFile(dto: CreateProductImportDto, file?: Express.Multer.File) {
    if (!file) {
      throw new DomainException(
        'PRODUCT_IMPORT_FILE_REQUIRED',
        'Attach a CSV or spreadsheet file to continue.',
        400,
      );
    }

    if (file.size > MAX_PRODUCT_IMPORT_FILE_SIZE_BYTES) {
      throw new DomainException(
        'PRODUCT_IMPORT_FILE_TOO_LARGE',
        'Product imports are limited to 5 MB files.',
        400,
      );
    }

    const parsed = this.parseImportFile(file);
    const continueOnError = dto.continueOnError ?? true;

    const importJob = await this.prisma.productImport.create({
      data: {
        tenantId: dto.tenantId,
        uploadedById: dto.uploadedById,
        fileName: file.originalname,
        contentType: file.mimetype || null,
        fileSizeBytes: file.size,
        sourceFileText: parsed.sourceFileText,
        status: ProductImportStatus.PROCESSING,
        totalRows: parsed.rows.length,
        summaryJson: {
          columns: parsed.columns,
          continueOnError,
          worksheetName: parsed.worksheetName,
          errors: [],
          importedAt: new Date().toISOString(),
        },
      },
    });
    await this.mirrorProductImport(importJob);

    let processedRows = 0;
    let createdCategoriesCount = 0;
    let createdProductsCount = 0;
    let updatedProductsCount = 0;
    let createdVariantsCount = 0;
    let updatedVariantsCount = 0;
    const errors: ProductImportError[] = [];

    for (const [index, row] of parsed.rows.entries()) {
      const rowNumber = index + 2;

      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const categoryResult = await this.upsertCategoryFromImport(
            tx,
            dto.tenantId,
            dto.uploadedById,
            row,
          );
          const productResult = await this.upsertProductFromImport(
            tx,
            dto.tenantId,
            dto.uploadedById,
            row,
            rowNumber,
            categoryResult?.category.id,
          );
          const variantResult = await this.upsertVariantFromImport(
            tx,
            dto.tenantId,
            dto.uploadedById,
            productResult.product,
            row,
            rowNumber,
          );

          return {
            categoryCreated: categoryResult?.created ?? false,
            product: productResult.product,
            productCreated: productResult.created,
            productUpdated: productResult.updated,
            variant: variantResult?.variant ?? null,
            variantCreated: variantResult?.created ?? false,
            variantUpdated: variantResult?.updated ?? false,
          };
        });

        processedRows += 1;
        if (result.productCreated || result.productUpdated) {
          await this.mirrorProduct(result.product);
        }
        if (
          result.variant &&
          (result.variantCreated || result.variantUpdated)
        ) {
          await this.mirrorProductVariant(result.variant);
        }
        if (result.categoryCreated) {
          createdCategoriesCount += 1;
        }
        if (result.productCreated) {
          createdProductsCount += 1;
        }
        if (result.productUpdated) {
          updatedProductsCount += 1;
        }
        if (result.variantCreated) {
          createdVariantsCount += 1;
        }
        if (result.variantUpdated) {
          updatedVariantsCount += 1;
        }
      } catch (error) {
        errors.push({
          rowNumber,
          productName:
            this.getOptionalString(row, ['productName', 'name', 'product']) ??
            null,
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
        ? ProductImportStatus.FAILED
        : errorCount > 0
          ? ProductImportStatus.COMPLETED_WITH_ERRORS
          : ProductImportStatus.COMPLETED;

    const summary: ProductImportSummary = {
      columns: parsed.columns,
      continueOnError,
      worksheetName: parsed.worksheetName,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
      importedAt: new Date().toISOString(),
    };

    const updatedImport = await this.prisma.productImport.update({
      where: { id: importJob.id },
      data: {
        status,
        processedRows,
        createdCategoriesCount,
        createdProductsCount,
        updatedProductsCount,
        createdVariantsCount,
        updatedVariantsCount,
        errorCount,
        summaryJson: summary as unknown as Prisma.InputJsonValue,
      },
      select: PRODUCT_IMPORT_SELECT,
    });
    await this.mirrorProductImport(updatedImport);

    await this.auditService.log({
      tenantId: dto.tenantId,
      actorId: dto.uploadedById,
      action: `products.import.${status.toLowerCase()}`,
      entityType: 'ProductImport',
      entityId: updatedImport.id,
      afterJson: updatedImport as unknown as Prisma.InputJsonValue,
    });

    return updatedImport;
  }

  private async upsertCategoryFromImport(
    executor: ProductExecutor,
    tenantId: string,
    uploadedById: string | undefined,
    row: ParsedProductImportRow,
  ): Promise<ImportedCategoryResult | null> {
    const categoryName = this.getOptionalString(row, [
      'categoryName',
      'category',
    ]);
    if (!categoryName) {
      return null;
    }

    const existing = await executor.productCategory.findFirst({
      where: {
        tenantId,
        name: categoryName,
      },
    });

    if (existing) {
      return {
        category: existing,
        created: false,
      };
    }

    const created = await this.createCategory(
      {
        tenantId,
        name: categoryName,
      },
      executor,
    );

    await this.auditService.log(
      {
        tenantId,
        actorId: uploadedById,
        action: 'products.category_created',
        entityType: 'ProductCategory',
        entityId: created.id,
        afterJson: created as unknown as Prisma.InputJsonValue,
      },
      executor,
    );

    return {
      category: created,
      created: true,
    };
  }

  private async upsertProductFromImport(
    executor: ProductExecutor,
    tenantId: string,
    uploadedById: string | undefined,
    row: ParsedProductImportRow,
    rowNumber: number,
    categoryId?: string,
  ): Promise<ImportedProductResult> {
    const productName = this.requireString(row, rowNumber, [
      'productName',
      'name',
      'product',
    ]);
    const existing = await executor.product.findFirst({
      where: {
        tenantId,
        name: productName,
        deletedAt: null,
      },
    });

    const description = this.getOptionalString(row, ['description']);
    const status = this.parseOptionalProductStatus(row, rowNumber, [
      'status',
      'productStatus',
    ]);
    const shelfLifeHours = this.parseOptionalInteger(row, rowNumber, [
      'shelfLifeHours',
      'shelflifehours',
    ]);
    const allergenJson = this.parseOptionalAllergens(row);

    if (!existing) {
      const created = await this.create(
        {
          tenantId,
          categoryId,
          name: productName,
          description,
          status: status ?? ProductStatus.ACTIVE,
          allergenJson: allergenJson ?? undefined,
          shelfLifeHours: shelfLifeHours ?? undefined,
        },
        executor,
      );

      await this.auditService.log(
        {
          tenantId,
          actorId: uploadedById,
          action: 'products.product_created',
          entityType: 'Product',
          entityId: created.id,
          afterJson: created as unknown as Prisma.InputJsonValue,
        },
        executor,
      );

      return {
        product: created,
        created: true,
        updated: false,
      };
    }

    const nextCategoryId = categoryId ?? existing.categoryId ?? undefined;
    const nextDescription = description ?? existing.description ?? undefined;
    const nextStatus = status ?? existing.status;
    const nextShelfLifeHours =
      shelfLifeHours === null ? existing.shelfLifeHours : shelfLifeHours;
    const nextAllergenJson =
      allergenJson === undefined ? existing.allergenJson : allergenJson;

    const unchanged =
      (existing.categoryId ?? undefined) === nextCategoryId &&
      (existing.description ?? undefined) === nextDescription &&
      existing.status === nextStatus &&
      (existing.shelfLifeHours ?? null) === nextShelfLifeHours &&
      JSON.stringify(existing.allergenJson ?? null) ===
        JSON.stringify(nextAllergenJson ?? null);

    if (unchanged) {
      return {
        product: existing,
        created: false,
        updated: false,
      };
    }

    const updated = await executor.product.update({
      where: { id: existing.id },
      data: {
        categoryId: nextCategoryId,
        description: nextDescription,
        status: nextStatus,
        shelfLifeHours: nextShelfLifeHours,
        allergenJson:
          nextAllergenJson === undefined
            ? undefined
            : (nextAllergenJson as Prisma.InputJsonValue),
      },
    });

    await this.auditService.log(
      {
        tenantId,
        actorId: uploadedById,
        action: 'products.product_updated',
        entityType: 'Product',
        entityId: updated.id,
        beforeJson: existing as unknown as Prisma.InputJsonValue,
        afterJson: updated as unknown as Prisma.InputJsonValue,
      },
      executor,
    );

    return {
      product: updated,
      created: false,
      updated: true,
    };
  }

  private async upsertVariantFromImport(
    executor: ProductExecutor,
    tenantId: string,
    uploadedById: string | undefined,
    product: Prisma.ProductGetPayload<Record<string, never>>,
    row: ParsedProductImportRow,
    rowNumber: number,
  ): Promise<ImportedVariantResult | null> {
    if (!this.hasVariantPayload(row)) {
      return null;
    }

    const variantName =
      this.getOptionalString(row, ['variantName', 'variant']) ?? product.name;
    const explicitSku = this.getOptionalString(row, ['sku', 'variantSku']);
    const unit = this.getOptionalString(row, ['unit']) ?? 'each';
    const defaultSellingPrice = this.parseOptionalNumber(row, rowNumber, [
      'defaultSellingPrice',
      'sellingPrice',
      'price',
    ]);
    const status = this.parseOptionalProductStatus(row, rowNumber, [
      'variantStatus',
      'status',
    ]);

    const existing = explicitSku
      ? await executor.productVariant.findFirst({
          where: {
            tenantId,
            sku: explicitSku,
            deletedAt: null,
          },
        })
      : await executor.productVariant.findFirst({
          where: {
            tenantId,
            productId: product.id,
            name: variantName,
            deletedAt: null,
          },
        });

    if (!existing) {
      const sku =
        explicitSku ??
        (await this.generateVariantSku(
          executor,
          tenantId,
          product.name,
          variantName,
          rowNumber,
        ));
      const created = await executor.productVariant.create({
        data: {
          tenantId,
          productId: product.id,
          sku,
          name: variantName,
          unit,
          defaultSellingPrice:
            defaultSellingPrice === null
              ? undefined
              : new Prisma.Decimal(defaultSellingPrice),
          status: status ?? product.status,
        },
      });

      await this.auditService.log(
        {
          tenantId,
          actorId: uploadedById,
          action: 'products.variant_created',
          entityType: 'ProductVariant',
          entityId: created.id,
          afterJson: created as unknown as Prisma.InputJsonValue,
        },
        executor,
      );

      return {
        variant: created,
        created: true,
        updated: false,
      };
    }

    const nextSku = explicitSku ?? existing.sku;
    const nextUnit = unit ?? existing.unit;
    const nextPrice =
      defaultSellingPrice === null
        ? existing.defaultSellingPrice
        : new Prisma.Decimal(defaultSellingPrice);
    const nextStatus = status ?? existing.status;
    const nextProductId = product.id;

    const unchanged =
      existing.productId === nextProductId &&
      existing.name === variantName &&
      existing.sku === nextSku &&
      existing.unit === nextUnit &&
      JSON.stringify(existing.defaultSellingPrice ?? null) ===
        JSON.stringify(nextPrice ?? null) &&
      existing.status === nextStatus;

    if (unchanged) {
      return {
        variant: existing,
        created: false,
        updated: false,
      };
    }

    const updated = await executor.productVariant.update({
      where: { id: existing.id },
      data: {
        productId: nextProductId,
        name: variantName,
        sku: nextSku,
        unit: nextUnit,
        defaultSellingPrice: nextPrice,
        status: nextStatus,
      },
    });

    await this.auditService.log(
      {
        tenantId,
        actorId: uploadedById,
        action: 'products.variant_updated',
        entityType: 'ProductVariant',
        entityId: updated.id,
        beforeJson: existing as unknown as Prisma.InputJsonValue,
        afterJson: updated as unknown as Prisma.InputJsonValue,
      },
      executor,
    );

    return {
      variant: updated,
      created: false,
      updated: true,
    };
  }

  private async mirrorProduct(
    product: Prisma.ProductGetPayload<Record<string, never>>,
  ) {
    await this.appwriteMirror.upsertOperationalRow('products', {
      id: product.id,
      tenantId: product.tenantId,
      status: product.status,
      name: product.name,
      data: product,
    });
  }

  private async mirrorProductVariant(
    variant: Prisma.ProductVariantGetPayload<Record<string, never>>,
  ) {
    await this.appwriteMirror.upsertOperationalRow('productVariants', {
      id: variant.id,
      tenantId: variant.tenantId,
      status: variant.status,
      name: variant.name,
      code: variant.sku,
      data: variant,
    });
  }

  private async mirrorProductImport(importJob: {
    id: string;
    tenantId: string;
    uploadedById?: string | null;
    fileName: string;
    status: ProductImportStatus;
  }) {
    await this.appwriteMirror.upsertOperationalRow('productImports', {
      id: importJob.id,
      tenantId: importJob.tenantId,
      createdById: importJob.uploadedById,
      status: importJob.status,
      name: importJob.fileName,
      data: importJob,
    });
  }

  private parseImportFile(file: Express.Multer.File): ParsedProductImportFile {
    const extension = this.getFileExtension(file.originalname);
    if (extension === 'xlsx' || extension === 'xls') {
      return this.parseSpreadsheetFile(file);
    }

    return this.parseCsvFile(file.buffer.toString('utf8'));
  }

  private parseCsvFile(sourceFileText: string): ParsedProductImportFile {
    const trimmed = sourceFileText.trim();
    if (!trimmed) {
      throw new DomainException(
        'PRODUCT_IMPORT_EMPTY',
        'The uploaded file is empty.',
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
        'PRODUCT_IMPORT_INVALID_FILE',
        error instanceof Error
          ? error.message
          : 'The uploaded CSV file could not be parsed.',
        400,
      );
    }

    if (!records.length) {
      throw new DomainException(
        'PRODUCT_IMPORT_EMPTY',
        'The uploaded file does not contain any rows.',
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
      sourceFileText,
    };
  }

  private parseSpreadsheetFile(
    file: Express.Multer.File,
  ): ParsedProductImportFile {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, {
        type: 'buffer',
      });
    } catch (error) {
      throw new DomainException(
        'PRODUCT_IMPORT_INVALID_FILE',
        error instanceof Error
          ? error.message
          : 'The spreadsheet could not be parsed.',
        400,
      );
    }

    const worksheetName = workbook.SheetNames[0];
    if (!worksheetName) {
      throw new DomainException(
        'PRODUCT_IMPORT_EMPTY',
        'The spreadsheet does not contain any worksheets.',
        400,
      );
    }

    const worksheet = workbook.Sheets[worksheetName];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      worksheet,
      {
        defval: '',
        raw: false,
      },
    );

    if (!records.length) {
      throw new DomainException(
        'PRODUCT_IMPORT_EMPTY',
        'The spreadsheet does not contain any rows.',
        400,
      );
    }

    const columns = Object.keys(records[0] ?? {});
    const rows = records.map((record) =>
      Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
          this.normalizeHeader(key),
          typeof value === 'string' ? value.trim() : String(value ?? ''),
        ]),
      ),
    );

    return {
      columns,
      rows,
      worksheetName,
      sourceFileText: JSON.stringify({
        worksheetName,
        rows: records,
      }),
    };
  }

  private hasVariantPayload(row: ParsedProductImportRow) {
    return this.hasAnyValue(row, [
      'variantName',
      'variant',
      'sku',
      'variantSku',
      'unit',
      'defaultSellingPrice',
      'sellingPrice',
      'price',
      'variantStatus',
    ]);
  }

  private hasAnyValue(row: ParsedProductImportRow, keys: string[]) {
    return keys.some((key) => {
      const value = row[this.normalizeHeader(key)];
      return value !== undefined && value !== '';
    });
  }

  private normalizeHeader(value: string) {
    return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  }

  private getOptionalString(row: ParsedProductImportRow, keys: string[]) {
    for (const key of keys) {
      const value = row[this.normalizeHeader(key)];
      if (value !== undefined && value !== '') {
        return value;
      }
    }

    return undefined;
  }

  private requireString(
    row: ParsedProductImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const value = this.getOptionalString(row, keys);
    if (value) {
      return value;
    }

    throw new DomainException(
      'PRODUCT_IMPORT_REQUIRED_VALUE',
      `Row ${rowNumber} is missing ${keys[0]}.`,
      400,
    );
  }

  private parseOptionalNumber(
    row: ParsedProductImportRow,
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
        'PRODUCT_IMPORT_INVALID_NUMBER',
        `Row ${rowNumber} has an invalid ${keys[0]}.`,
        400,
      );
    }

    return parsed;
  }

  private parseOptionalInteger(
    row: ParsedProductImportRow,
    rowNumber: number,
    keys: string[],
  ) {
    const parsed = this.parseOptionalNumber(row, rowNumber, keys);
    if (parsed === null) {
      return null;
    }

    if (!Number.isInteger(parsed)) {
      throw new DomainException(
        'PRODUCT_IMPORT_INVALID_INTEGER',
        `Row ${rowNumber} has an invalid ${keys[0]}.`,
        400,
      );
    }

    return parsed;
  }

  private parseOptionalProductStatus(
    row: ParsedProductImportRow,
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
    if (!Object.values(ProductStatus).includes(normalized as ProductStatus)) {
      throw new DomainException(
        'PRODUCT_IMPORT_INVALID_STATUS',
        `Row ${rowNumber} has an unsupported status "${value}".`,
        400,
      );
    }

    return normalized as ProductStatus;
  }

  private parseOptionalAllergens(row: ParsedProductImportRow) {
    const value = this.getOptionalString(row, ['allergens', 'allergenList']);
    if (!value) {
      return undefined;
    }

    const labels = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    return labels.length
      ? {
          labels,
        }
      : undefined;
  }

  private getFileExtension(fileName: string) {
    const segments = fileName.split('.');
    return segments.length > 1 ? (segments.pop()?.toLowerCase() ?? '') : '';
  }

  private async generateVariantSku(
    executor: ProductExecutor,
    tenantId: string,
    productName: string,
    variantName: string,
    rowNumber: number,
  ) {
    const base = this.slugifySku(`${productName}-${variantName}`) || 'PRODUCT';
    const candidate = base.slice(0, 40);

    const existing = await executor.productVariant.findFirst({
      where: {
        tenantId,
        sku: candidate,
      },
    });

    if (!existing) {
      return candidate;
    }

    return `${candidate.slice(0, 32)}-${rowNumber}`;
  }

  private slugifySku(value: string) {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
