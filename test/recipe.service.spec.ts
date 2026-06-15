import { Prisma } from '@prisma/client';
import { RecipesService } from '../src/recipes/recipes.service';

describe('RecipesService', () => {
  const prisma = {
    recipe: {
      findFirst: jest.fn(),
    },
    location: {
      findFirst: jest.fn(),
    },
    locationInventoryItemSetting: {
      findMany: jest.fn(),
    },
  } as any;

  const auditService = {
    log: jest.fn(),
  } as any;
  const appwriteMirror = {
    upsertOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
    deleteOperationalRow: jest.fn().mockResolvedValue({ skipped: false }),
  } as any;

  const service = new RecipesService(prisma, auditService, appwriteMirror);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates recipe cost', async () => {
    prisma.recipe.findFirst.mockResolvedValue({
      id: 'recipe-1',
      batchYieldQty: new Prisma.Decimal(10),
      yieldUom: 'each',
      components: [
        {
          inventoryItemId: 'item-1',
          quantity: new Prisma.Decimal(2),
          lossFactorPercent: new Prisma.Decimal(0),
          inventoryItem: { unitCost: new Prisma.Decimal(3) },
        },
      ],
    });
    prisma.location.findFirst.mockResolvedValue({ currencyCode: 'INR' });
    prisma.locationInventoryItemSetting.findMany.mockResolvedValue([
      {
        inventoryItemId: 'item-1',
        unitCost: new Prisma.Decimal(3),
        currencyCode: 'INR',
      },
    ]);

    const result = await service.calculateRecipeCost(
      'tenant-1',
      'recipe-1',
      'location-1',
    );

    expect(result.recipeId).toBe('recipe-1');
    expect(result.currencyCode).toBe('INR');
    expect(result.costPerBatch.toString()).toBe('6');
    expect(result.costPerYieldUnit.toString()).toBe('0.6');
  });

  it('calculates required ingredients', async () => {
    prisma.recipe.findFirst.mockResolvedValue({
      id: 'recipe-1',
      batchYieldQty: new Prisma.Decimal(10),
      components: [
        {
          inventoryItemId: 'item-1',
          quantity: new Prisma.Decimal(1),
          lossFactorPercent: new Prisma.Decimal(0),
          uom: 'kg',
          inventoryItem: { name: 'Flour' },
        },
      ],
    });

    const result = await service.calculateRequiredIngredients(
      'tenant-1',
      'recipe-1',
      25,
    );

    expect(result[0]).toMatchObject({
      inventoryItemId: 'item-1',
      inventoryItemName: 'Flour',
      uom: 'kg',
      requiredQty: new Prisma.Decimal(2.5),
    });
  });

  it('returns location-aware itemized costing previews', async () => {
    prisma.recipe.findFirst.mockResolvedValue({
      id: 'recipe-1',
      batchYieldQty: new Prisma.Decimal(10),
      yieldUom: 'each',
      components: [
        {
          inventoryItemId: 'item-1',
          quantity: new Prisma.Decimal(2),
          lossFactorPercent: new Prisma.Decimal(10),
          uom: 'kg',
          inventoryItem: { name: 'Flour' },
        },
      ],
    });
    prisma.location.findFirst.mockResolvedValue({ currencyCode: 'INR' });
    prisma.locationInventoryItemSetting.findMany.mockResolvedValue([
      {
        inventoryItemId: 'item-1',
        unitCost: new Prisma.Decimal(3),
        currencyCode: 'INR',
      },
    ]);

    const result = await service.calculateRecipeCosting(
      'tenant-1',
      'recipe-1',
      'location-1',
      5,
    );

    expect(result.costing.costPerBatch.toString()).toBe('6.6');
    expect(result.costing.costPerYieldUnit.toString()).toBe('0.66');
    expect(result.requiredIngredients[0]).toMatchObject({
      inventoryItemId: 'item-1',
      inventoryItemName: 'Flour',
      uom: 'kg',
      requiredQty: new Prisma.Decimal(1),
      unitCost: new Prisma.Decimal(3),
      totalCost: new Prisma.Decimal(3.3),
    });
  });

  it('flags cost incomplete when an ingredient has no location price', async () => {
    prisma.recipe.findFirst.mockResolvedValue({
      id: 'recipe-1',
      batchYieldQty: new Prisma.Decimal(10),
      yieldUom: 'each',
      components: [
        {
          inventoryItemId: 'item-1',
          quantity: new Prisma.Decimal(2),
          lossFactorPercent: new Prisma.Decimal(0),
          uom: 'kg',
          inventoryItem: { name: 'Flour' },
        },
      ],
    });
    prisma.location.findFirst.mockResolvedValue({ currencyCode: 'INR' });
    prisma.locationInventoryItemSetting.findMany.mockResolvedValue([]);

    const result = await service.calculateRecipeCosting(
      'tenant-1',
      'recipe-1',
      'location-1',
      1,
    );

    expect(result.costing.costIncomplete).toBe(true);
    expect(result.costing.missingInventoryItemIds).toEqual(['item-1']);
    // Missing price contributes nothing rather than a silent zero unit cost.
    expect(result.costing.costPerBatch.toString()).toBe('0');
    expect(result.requiredIngredients[0].unitCost).toBeNull();
    expect(result.requiredIngredients[0].totalCost).toBeNull();
  });

  it('guards divide-by-zero when batch yield is zero', async () => {
    prisma.recipe.findFirst.mockResolvedValue({
      id: 'recipe-1',
      batchYieldQty: new Prisma.Decimal(0),
      yieldUom: 'each',
      components: [
        {
          inventoryItemId: 'item-1',
          quantity: new Prisma.Decimal(2),
          lossFactorPercent: new Prisma.Decimal(0),
          uom: 'kg',
          inventoryItem: { name: 'Flour' },
        },
      ],
    });
    prisma.location.findFirst.mockResolvedValue({ currencyCode: 'INR' });
    prisma.locationInventoryItemSetting.findMany.mockResolvedValue([
      {
        inventoryItemId: 'item-1',
        unitCost: new Prisma.Decimal(3),
        currencyCode: 'INR',
      },
    ]);

    const result = await service.calculateRecipeCosting(
      'tenant-1',
      'recipe-1',
      'location-1',
      1,
    );

    expect(result.costing.costPerYieldUnit.toString()).toBe('0');
    expect(result.costing.costIncomplete).toBe(false);
  });
});
