/**
 * Dev fixture: give the logged-in user's auto-provisioned tenant a minimal but
 * complete, testable bakery (location + priced product + active recipe + priced
 * ingredients) so the sales -> COGS -> margin flow can be exercised end-to-end.
 *
 * Idempotent: re-running finds existing rows instead of duplicating.
 * Run: npx tsx prisma/dev-fixture.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TARGET_EMAIL =
  process.env.FIXTURE_USER_EMAIL ?? 'surajmahapatra2003@gmail.com';
const d = (v: string) => new Prisma.Decimal(v);

async function main() {
  const user = await prisma.user.findFirst({ where: { email: TARGET_EMAIL } });
  if (!user) throw new Error(`User not found: ${TARGET_EMAIL}`);
  const tenantId = user.tenantId;
  console.log('tenant:', tenantId, 'user:', user.id);

  // 1) Location
  let location = await prisma.location.findFirst({
    where: { tenantId, name: 'Main Store' },
  });
  location ??= await prisma.location.create({
    data: {
      tenantId,
      name: 'Main Store',
      type: 'CAFE',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      countryCode: 'IN',
      currencyCode: 'INR',
      timezone: 'Asia/Kolkata',
      isPrimary: true,
      isActive: true,
    },
  });
  console.log('location:', location.id);

  // 2) Category + Product + Variant (priced)
  let category = await prisma.productCategory.findFirst({
    where: { tenantId, name: 'Cakes' },
  });
  category ??= await prisma.productCategory.create({
    data: { tenantId, name: 'Cakes' },
  });

  let product = await prisma.product.findFirst({
    where: { tenantId, name: 'Chocolate Cake' },
  });
  product ??= await prisma.product.create({
    data: {
      tenantId,
      categoryId: category.id,
      name: 'Chocolate Cake',
      status: 'ACTIVE',
    },
  });

  let variant = await prisma.productVariant.findFirst({
    where: { tenantId, sku: 'CAKE-CHOCO-500' },
  });
  variant ??= await prisma.productVariant.create({
    data: {
      tenantId,
      productId: product.id,
      sku: 'CAKE-CHOCO-500',
      name: '500g',
      unit: 'each',
      defaultSellingPrice: d('500'),
      currencyCode: 'INR',
      status: 'ACTIVE',
    },
  });
  console.log('variant:', variant.id);

  // 3) Ingredients + per-location unit costs (rates stay Decimal)
  const ingredients = [
    { name: 'Flour', uom: 'kg', unitCost: '40', qty: '0.30' },
    { name: 'Dark Chocolate', uom: 'kg', unitCost: '600', qty: '0.25' },
  ];
  const components: Prisma.RecipeComponentCreateWithoutRecipeInput[] = [];
  for (const ing of ingredients) {
    let item = await prisma.inventoryItem.findFirst({
      where: { tenantId, name: ing.name },
    });
    item ??= await prisma.inventoryItem.create({
      data: {
        tenantId,
        name: ing.name,
        type: 'RAW_MATERIAL',
        defaultUom: ing.uom,
        unitCost: d(ing.unitCost),
      },
    });

    const existingSetting = await prisma.locationInventoryItemSetting.findFirst(
      {
        where: { tenantId, locationId: location.id, inventoryItemId: item.id },
      },
    );
    if (existingSetting) {
      await prisma.locationInventoryItemSetting.update({
        where: { id: existingSetting.id },
        data: {
          unitCost: d(ing.unitCost),
          currencyCode: 'INR',
          isStocked: true,
        },
      });
    } else {
      await prisma.locationInventoryItemSetting.create({
        data: {
          tenantId,
          locationId: location.id,
          inventoryItemId: item.id,
          unitCost: d(ing.unitCost),
          currencyCode: 'INR',
          isStocked: true,
        },
      });
    }

    components.push({
      tenant: { connect: { id: tenantId } },
      inventoryItem: { connect: { id: item.id } },
      quantity: d(ing.qty),
      uom: ing.uom,
      lossFactorPercent: d('0'),
    });
  }

  // 4) Per-location selling price for the variant (so it's available + priced here)
  const existingVariantSetting =
    await prisma.locationProductVariantSetting.findFirst({
      where: {
        tenantId,
        locationId: location.id,
        productVariantId: variant.id,
      },
    });
  if (!existingVariantSetting) {
    await prisma.locationProductVariantSetting.create({
      data: {
        tenantId,
        locationId: location.id,
        productVariantId: variant.id,
        sellingPrice: d('500'),
        currencyCode: 'INR',
        isAvailable: true,
      },
    });
  }

  // 5) Active recipe (COGS ≈ 0.30×40 + 0.25×600 = ₹162 per cake → ~67% margin)
  let recipe = await prisma.recipe.findFirst({
    where: { tenantId, productVariantId: variant.id },
  });
  if (!recipe) {
    recipe = await prisma.recipe.create({
      data: {
        tenantId,
        productVariantId: variant.id,
        name: 'Chocolate Cake 500g Recipe',
        version: 1,
        batchYieldQty: d('1'),
        yieldUom: 'each',
        status: 'ACTIVE',
        isActive: true,
        components: { create: components },
      },
    });
  }
  console.log('recipe:', recipe.id);

  // 6) Mark onboarding complete so the app routes straight to the workspace
  await prisma.onboardingProgress.updateMany({
    where: { tenantId, userId: user.id },
    data: {
      businessProfileStatus: 'COMPLETED',
      locationSetupStatus: 'COMPLETED',
      cafeProfileStatus: 'COMPLETED',
      complianceStatus: 'COMPLETED',
      productSetupStatus: 'COMPLETED',
      inventorySetupStatus: 'COMPLETED',
      recipeSetupStatus: 'COMPLETED',
      supplierSetupStatus: 'COMPLETED',
      productionSetupStatus: 'COMPLETED',
      isCompleted: true,
    },
  });

  console.log('FIXTURE_DONE');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
