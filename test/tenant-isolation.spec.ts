import { ProductsService } from '../src/products/products.service';

describe('Tenant isolation', () => {
  it('respects tenant filters in service queries', async () => {
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const auditService = {
      log: jest.fn(),
    } as any;

    const service = new ProductsService(prisma, auditService);
    await expect(
      service.findOne('tenant-123', 'product-456'),
    ).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      status: 404,
    });

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-123',
          id: 'product-456',
        }),
      }),
    );
  });
});
