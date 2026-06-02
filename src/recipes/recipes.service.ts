import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainException } from '../common/exceptions/domain.exception';
import { requireInventoryItemMoneySettings } from '../common/prisma/location-money';
import { PrismaService } from '../common/prisma/prisma.service';
import { decimal } from '../common/utils/decimal.util';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { QueryRecipesDto } from './dto/query-recipes.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateRecipeDto) {
    await this.ensureVariantExists(dto.tenantId, dto.productVariantId);

    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          tenantId: dto.tenantId,
          productVariantId: dto.productVariantId,
          name: dto.name,
          version: dto.version,
          batchYieldQty: decimal(dto.batchYieldQty),
          yieldUom: dto.yieldUom,
          status: dto.status,
          isActive: dto.isActive ?? false,
          createdById: dto.createdById,
          components: {
            create: dto.components.map((component) => ({
              tenantId: dto.tenantId,
              inventoryItemId: component.inventoryItemId,
              quantity: decimal(component.quantity),
              uom: component.uom,
              lossFactorPercent: decimal(component.lossFactorPercent ?? 0),
            })),
          },
        },
        include: { components: true },
      });

      if (dto.isActive) {
        await tx.recipe.updateMany({
          where: {
            tenantId: dto.tenantId,
            productVariantId: dto.productVariantId,
            id: { not: recipe.id },
          },
          data: { isActive: false },
        });
      }

      await this.auditService.log(
        {
          tenantId: dto.tenantId,
          actorId: dto.createdById,
          action: 'recipe.created',
          entityType: 'Recipe',
          entityId: recipe.id,
          afterJson: recipe as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return recipe;
    });
  }

  findAll(query: QueryRecipesDto) {
    return this.prisma.recipe.findMany({
      where: {
        tenantId: query.tenantId,
        productVariantId: query.productVariantId,
        deletedAt: null,
      },
      include: {
        components: {
          include: {
            inventoryItem: true,
          },
        },
        productVariant: true,
      },
      orderBy: [{ productVariantId: 'asc' }, { version: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: {
        components: {
          include: {
            inventoryItem: true,
          },
        },
        productVariant: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new DomainException('RECIPE_NOT_FOUND', 'Recipe not found', 404);
    }

    return recipe;
  }

  async update(tenantId: string, id: string, dto: UpdateRecipeDto) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: { components: true },
    });

    if (!recipe) {
      throw new DomainException('RECIPE_NOT_FOUND', 'Recipe not found', 404);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.components) {
        await tx.recipeComponent.deleteMany({
          where: { tenantId, recipeId: recipe.id },
        });
      }

      const updated = await tx.recipe.update({
        where: { id: recipe.id },
        data: {
          name: dto.name,
          version: dto.version,
          batchYieldQty:
            dto.batchYieldQty === undefined
              ? undefined
              : decimal(dto.batchYieldQty),
          yieldUom: dto.yieldUom,
          status: dto.status,
          isActive: dto.isActive,
          deletedAt: dto.status === 'ARCHIVED' ? new Date() : undefined,
          components: dto.components
            ? {
                create: dto.components.map((component) => ({
                  tenantId,
                  inventoryItemId: component.inventoryItemId,
                  quantity: decimal(component.quantity),
                  uom: component.uom,
                  lossFactorPercent: decimal(component.lossFactorPercent ?? 0),
                })),
              }
            : undefined,
        },
        include: { components: true },
      });

      await this.auditService.log(
        {
          tenantId,
          action: 'recipe.updated',
          entityType: 'Recipe',
          entityId: recipe.id,
          beforeJson: recipe as unknown as Prisma.InputJsonValue,
          afterJson: updated as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return updated;
    });
  }

  async activate(tenantId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { tenantId, id, deletedAt: null },
    });

    if (!recipe) {
      throw new DomainException('RECIPE_NOT_FOUND', 'Recipe not found', 404);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.recipe.updateMany({
        where: {
          tenantId,
          productVariantId: recipe.productVariantId,
          id: { not: recipe.id },
        },
        data: {
          isActive: false,
        },
      });

      const updated = await tx.recipe.update({
        where: { id: recipe.id },
        data: {
          isActive: true,
          status: 'ACTIVE',
        },
      });

      await this.auditService.log(
        {
          tenantId,
          action: 'recipe.activated',
          entityType: 'Recipe',
          entityId: recipe.id,
          afterJson: updated as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      return updated;
    });
  }

  async calculateRecipeCost(
    tenantId: string,
    recipeId: string,
    locationId: string,
  ) {
    const recipe = await this.findRecipeForCalculation(tenantId, recipeId);
    const { currencyCode, settings } = await requireInventoryItemMoneySettings(
      this.prisma,
      {
        tenantId,
        locationId,
        inventoryItemIds: recipe.components.map(
          (component) => component.inventoryItemId,
        ),
      },
    );
    const costPerBatch = recipe.components.reduce(
      (accumulator, component) =>
        accumulator.add(
          component.quantity
            .mul(settings.get(component.inventoryItemId)!.unitCost!)
            .mul(decimal(1).add(component.lossFactorPercent.div(decimal(100)))),
        ),
      decimal(0),
    );

    return {
      recipeId: recipe.id,
      locationId,
      currencyCode,
      costPerBatch,
      costPerYieldUnit: costPerBatch.div(recipe.batchYieldQty),
      yieldUom: recipe.yieldUom,
    };
  }

  async calculateRequiredIngredients(
    tenantId: string,
    recipeId: string,
    plannedQty: number,
  ) {
    const recipe = await this.findRecipeForCalculation(tenantId, recipeId);
    const planned = decimal(plannedQty);

    return recipe.components.map((component) => ({
      inventoryItemId: component.inventoryItemId,
      inventoryItemName: component.inventoryItem.name,
      uom: component.uom,
      requiredQty: component.quantity.mul(planned).div(recipe.batchYieldQty),
      lossFactorPercent: component.lossFactorPercent,
    }));
  }

  private async ensureVariantExists(
    tenantId: string,
    productVariantId: string,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: productVariantId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!variant) {
      throw new DomainException(
        'PRODUCT_VARIANT_NOT_FOUND',
        'Product variant must exist before creating a recipe',
        404,
      );
    }
  }

  private async findRecipeForCalculation(tenantId: string, recipeId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { tenantId, id: recipeId, deletedAt: null },
      include: {
        components: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!recipe) {
      throw new DomainException('RECIPE_NOT_FOUND', 'Recipe not found', 404);
    }

    return recipe;
  }
}
