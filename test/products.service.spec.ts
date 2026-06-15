import { Prisma } from '@prisma/client';
import { ProductsService } from '../src/products/products.service';

describe('ProductsService', () => {
  let prisma: any;
  let auditService: any;
  let appwriteMirror: any;
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      productCategory: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      productVariant: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      locationProductVariantSetting: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      productImport: {
        create: jest.fn().mockResolvedValue({
          id: 'product-import-1',
        }),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'product-import-1',
          tenantId: 'tenant-1',
          uploadedById: 'user-1',
          fileName: 'products.csv',
          contentType: 'text/csv',
          fileSizeBytes: 256,
          status: data.status,
          totalRows: 1,
          processedRows: data.processedRows,
          createdCategoriesCount: data.createdCategoriesCount,
          createdProductsCount: data.createdProductsCount,
          updatedProductsCount: data.updatedProductsCount,
          createdVariantsCount: data.createdVariantsCount,
          updatedVariantsCount: data.updatedVariantsCount,
          errorCount: data.errorCount,
          summaryJson: data.summaryJson,
          createdAt: new Date('2026-05-09T00:00:00.000Z'),
          updatedAt: new Date('2026-05-09T00:00:00.000Z'),
          uploadedBy: {
            id: 'user-1',
            displayName: 'Owner',
            email: 'owner@bakestack.demo',
          },
        })),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    auditService = { log: jest.fn() };
    appwriteMirror = {
      upsertOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
      deleteOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
    };
    service = new ProductsService(prisma, auditService, appwriteMirror);
  });

  it('deletes a product, its active variants, and Appwrite mirror rows', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'product-1',
      tenantId: 'tenant-1',
      categoryId: null,
      name: 'Chocolate Cake',
      description: null,
      status: 'ACTIVE',
      allergenJson: null,
      shelfLifeHours: 48,
      variants: [{ id: 'variant-1' }, { id: 'variant-2' }],
    });
    prisma.locationProductVariantSetting.findMany.mockResolvedValue([
      { id: 'setting-1' },
    ]);
    prisma.product.update.mockImplementation(({ data }: any) => ({
      id: 'product-1',
      tenantId: 'tenant-1',
      name: 'Chocolate Cake',
      status: data.status,
      deletedAt: data.deletedAt,
    }));
    prisma.productVariant.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.remove('tenant-1', 'product-1');

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          deletedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          id: { in: ['variant-1', 'variant-2'] },
          deletedAt: null,
        },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          deletedAt: expect.any(Date),
        }),
      }),
    );
    expect(appwriteMirror.deleteOperationalRow).toHaveBeenCalledWith(
      'products',
      'product-1',
    );
    expect(appwriteMirror.deleteOperationalRow).toHaveBeenCalledWith(
      'productVariants',
      'variant-1',
    );
    expect(appwriteMirror.deleteOperationalRow).toHaveBeenCalledWith(
      'productVariants',
      'variant-2',
    );
    expect(appwriteMirror.deleteOperationalRow).toHaveBeenCalledWith(
      'locationProductVariantSettings',
      'setting-1',
    );
    expect(result.status).toBe('ARCHIVED');
  });

  it('imports bakery products with categories and variants', async () => {
    prisma.productCategory.create.mockResolvedValue({
      id: 'category-1',
      tenantId: 'tenant-1',
      name: 'Cakes',
    });
    prisma.product.create.mockResolvedValue({
      id: 'product-1',
      tenantId: 'tenant-1',
      categoryId: 'category-1',
      name: 'Chocolate Cake',
      description: 'Signature sponge',
      status: 'ACTIVE',
      shelfLifeHours: 48,
      allergenJson: { labels: ['gluten', 'eggs', 'dairy'] },
    });
    prisma.productVariant.create.mockResolvedValue({
      id: 'variant-1',
      tenantId: 'tenant-1',
      productId: 'product-1',
      sku: 'CAKE-CHOCO-500',
      name: 'Chocolate Cake 500g',
      unit: 'each',
      defaultSellingPrice: new Prisma.Decimal(650),
      status: 'ACTIVE',
    });

    const job = await service.importFile(
      {
        tenantId: 'tenant-1',
        uploadedById: 'user-1',
      },
      {
        originalname: 'products.csv',
        mimetype: 'text/csv',
        size: 256,
        buffer: Buffer.from(
          [
            'productName,categoryName,description,status,shelfLifeHours,variantName,sku,unit,defaultSellingPrice,allergens',
            'Chocolate Cake,Cakes,Signature sponge,ACTIVE,48,Chocolate Cake 500g,CAKE-CHOCO-500,each,650,"gluten, eggs, dairy"',
          ].join('\n'),
          'utf8',
        ),
      } as Express.Multer.File,
    );

    expect(prisma.productCategory.create).toHaveBeenCalled();
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Chocolate Cake',
        }),
      }),
    );
    expect(prisma.productVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Chocolate Cake 500g',
          sku: 'CAKE-CHOCO-500',
        }),
      }),
    );
    expect(job.status).toBe('COMPLETED');
    expect(job.createdProductsCount).toBe(1);
    expect(job.createdVariantsCount).toBe(1);
  });

  it('imports product-name-only rows without forcing variants', async () => {
    prisma.product.create.mockResolvedValue({
      id: 'product-2',
      tenantId: 'tenant-1',
      categoryId: null,
      name: 'Espresso',
      description: null,
      status: 'ACTIVE',
      shelfLifeHours: null,
      allergenJson: null,
    });

    const job = await service.importFile(
      {
        tenantId: 'tenant-1',
        uploadedById: 'user-1',
      },
      {
        originalname: 'products.csv',
        mimetype: 'text/csv',
        size: 128,
        buffer: Buffer.from('productName\nEspresso\n', 'utf8'),
      } as Express.Multer.File,
    );

    expect(prisma.product.create).toHaveBeenCalled();
    expect(prisma.productVariant.create).not.toHaveBeenCalled();
    expect(job.status).toBe('COMPLETED');
    expect(job.createdProductsCount).toBe(1);
    expect(job.createdVariantsCount).toBe(0);
  });

  it('captures row errors during product import when continueOnError is enabled', async () => {
    prisma.productImport.update.mockImplementation(({ data }: any) => ({
      id: 'product-import-1',
      tenantId: 'tenant-1',
      uploadedById: 'user-1',
      fileName: 'products-errors.csv',
      contentType: 'text/csv',
      fileSizeBytes: 256,
      status: data.status,
      totalRows: 2,
      processedRows: data.processedRows,
      createdCategoriesCount: data.createdCategoriesCount,
      createdProductsCount: data.createdProductsCount,
      updatedProductsCount: data.updatedProductsCount,
      createdVariantsCount: data.createdVariantsCount,
      updatedVariantsCount: data.updatedVariantsCount,
      errorCount: data.errorCount,
      summaryJson: data.summaryJson,
      createdAt: new Date('2026-05-09T00:00:00.000Z'),
      updatedAt: new Date('2026-05-09T00:00:00.000Z'),
      uploadedBy: {
        id: 'user-1',
        displayName: 'Owner',
        email: 'owner@bakestack.demo',
      },
    }));
    prisma.product.create.mockResolvedValue({
      id: 'product-3',
      tenantId: 'tenant-1',
      categoryId: null,
      name: 'Sourdough',
      description: null,
      status: 'ACTIVE',
      shelfLifeHours: null,
      allergenJson: null,
    });

    const job = await service.importFile(
      {
        tenantId: 'tenant-1',
        uploadedById: 'user-1',
        continueOnError: true,
      },
      {
        originalname: 'products-errors.csv',
        mimetype: 'text/csv',
        size: 256,
        buffer: Buffer.from(
          ['productName,status', ',ACTIVE', 'Sourdough,ACTIVE'].join('\n'),
          'utf8',
        ),
      } as Express.Multer.File,
    );

    const summary = job.summaryJson as {
      errors?: Array<{ rowNumber: number; message: string }>;
    } | null;

    expect(job.status).toBe('COMPLETED_WITH_ERRORS');
    expect(job.processedRows).toBe(1);
    expect(job.errorCount).toBe(1);
    expect(summary?.errors?.[0]?.rowNumber).toBe(2);
  });
});
