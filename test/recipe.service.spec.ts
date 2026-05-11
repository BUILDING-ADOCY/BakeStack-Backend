import { Prisma } from '@prisma/client';
import { RecipesService } from '../src/recipes/recipes.service';

describe('RecipesService', () => {
  const prisma = {
    recipe: {
      findFirst: jest.fn(),
    },
  } as any;

  const auditService = {
    log: jest.fn(),
  } as any;

  const service = new RecipesService(prisma, auditService);

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

    const result = await service.calculateRecipeCost('tenant-1', 'recipe-1');

    expect(result.recipeId).toBe('recipe-1');
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
});
