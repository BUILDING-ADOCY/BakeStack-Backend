import { Prisma } from '@prisma/client';
import { SuppliersService } from '../src/suppliers/suppliers.service';

describe('SuppliersService mappings', () => {
  let prisma: any;
  let appwriteMirror: any;
  let service: SuppliersService;

  beforeEach(() => {
    prisma = {
      supplierItem: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    appwriteMirror = {
      upsertOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
      deleteOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
    };
    service = new SuppliersService(prisma, appwriteMirror);
  });

  it('updates shared supplier SKU, UOM, and pack size within the tenant', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue({
      id: 'supplier-item-1',
      tenantId: 'tenant-1',
    });
    prisma.supplierItem.update.mockResolvedValue({
      id: 'supplier-item-1',
      supplierSku: 'FLOUR-25',
      purchaseUom: 'bag',
      packSize: new Prisma.Decimal(25),
    });

    const updated = await service.updateSupplierItem(
      'tenant-1',
      'supplier-item-1',
      {
        supplierSku: 'FLOUR-25',
        purchaseUom: 'bag',
        packSize: 25,
      },
    );

    expect(prisma.supplierItem.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', id: 'supplier-item-1' },
    });
    expect(prisma.supplierItem.update).toHaveBeenCalledWith({
      where: { id: 'supplier-item-1' },
      data: {
        supplierSku: 'FLOUR-25',
        purchaseUom: 'bag',
        packSize: new Prisma.Decimal(25),
      },
      include: {
        supplier: true,
        inventoryItem: true,
      },
    });
    expect(updated.supplierSku).toBe('FLOUR-25');
  });

  it('rejects supplier item updates outside the tenant', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSupplierItem('tenant-1', 'supplier-item-other', {
        packSize: 10,
      }),
    ).rejects.toMatchObject({
      code: 'SUPPLIER_ITEM_NOT_FOUND',
      status: 404,
    });
    expect(prisma.supplierItem.update).not.toHaveBeenCalled();
  });
});
