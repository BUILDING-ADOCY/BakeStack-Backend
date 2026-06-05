import {
  BusinessStage,
  BusinessType,
  ComplianceStatus,
  DayOfWeek,
  InventoryItemType,
  InventoryMovementType,
  LocationType,
  PrismaClient,
  ProductStatus,
  ProductionBatchStatus,
  ProductionPlanStatus,
  RecipeStatus,
  SetupStepStatus,
  SupplierStatus,
  TenantStatus,
  UserStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_SECURITY_USER_ID = 'seed_user_bakestack_demo_owner';
const LEGACY_DEMO_SECURITY_USER_ID = 'seed_user_oakstreet_owner';
const DEMO_SECURITY_ORGANIZATION_ID = 'seed_org_bakestack_demo';

const money = (value: number) => value.toFixed(4);
// Amount columns are integer minor units (paise); rates/quantities stay Decimal.
const moneyMinor = (value: number) => Math.round(value * 100);

async function resetDatabase() {
  await prisma.webhookInbox.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.dailyClose.deleteMany();
  await prisma.qCCheck.deleteMany();
  await prisma.wasteEvent.deleteMany();
  await prisma.onboardingProgress.deleteMany();
  await prisma.productionOutput.deleteMany();
  await prisma.productionConsumption.deleteMany();
  await prisma.productionBatchItem.deleteMany();
  await prisma.productionBatch.deleteMany();
  await prisma.productionPlan.deleteMany();
  await prisma.recipeComponent.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.supplierInvoice.deleteMany();
  await prisma.goodsReceiptLine.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplierItem.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryBalance.deleteMany();
  await prisma.inventoryLot.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.userRoleAssignment.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.openingHour.deleteMany();
  await prisma.complianceProfile.deleteMany();
  await prisma.locationProfile.deleteMany();
  await prisma.location.deleteMany();
  await prisma.businessProfile.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.tenant.deleteMany();
}

async function main() {
  await resetDatabase();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'BakeStack Demo Bakery',
      legalName: 'BakeStack Foods Pvt Ltd',
      securityOrganizationId: DEMO_SECURITY_ORGANIZATION_ID,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      status: TenantStatus.ACTIVE,
    },
  });

  await prisma.businessProfile.create({
    data: {
      tenantId: tenant.id,
      businessName: 'BakeStack Demo Bakery',
      legalName: 'BakeStack Foods Pvt Ltd',
      brandName: 'BakeStack',
      businessType: BusinessType.BAKERY_CAFE,
      businessStage: BusinessStage.RUNNING,
      ownerName: 'BakeStack Owner',
      ownerPhone: '+91-98765-43210',
      ownerEmail: 'owner@bakestack.demo',
      description: 'Merchant-first bakery and cafe operations workspace.',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      defaultLanguage: 'en-IN',
    },
  });

  const mainKitchen = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Main Bakery Kitchen',
      type: LocationType.KITCHEN,
      timezone: 'Asia/Kolkata',
      addressLine1: '12 Flour Mill Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
      isPrimary: false,
      isActive: true,
      address: {
        line1: '12 Flour Mill Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
    },
  });

  const frontCafe = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: 'Front Cafe',
      type: LocationType.CAFE,
      timezone: 'Asia/Kolkata',
      addressLine1: '14 Flour Mill Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
      isPrimary: true,
      isActive: true,
      address: {
        line1: '14 Flour Mill Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
    },
  });

  const [owner, legacyOwner, manager, baker, inventoryClerk] =
    await Promise.all([
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          securityUserId: DEMO_SECURITY_USER_ID,
          email: 'owner@bakestack.demo',
          displayName: 'BakeStack Owner',
          phone: '+1-415-555-0100',
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          securityUserId: LEGACY_DEMO_SECURITY_USER_ID,
          email: 'owner@oakstreetbakery.test',
          displayName: 'Oak Owner',
          phone: '+1-415-555-0104',
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'manager@bakestack.demo',
          displayName: 'Cafe Manager',
          phone: '+1-415-555-0101',
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'baker@bakestack.demo',
          displayName: 'Head Baker',
          phone: '+1-415-555-0102',
          status: UserStatus.ACTIVE,
        },
      }),
      prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'inventory@bakestack.demo',
          displayName: 'Inventory Clerk',
          phone: '+1-415-555-0103',
          status: UserStatus.ACTIVE,
        },
      }),
    ]);

  const [ownerRole, managerRole, bakerRole, inventoryRole] = await Promise.all([
    prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Owner',
        description: 'Full tenant control',
        policyJson: { permissions: ['*'] },
      },
    }),
    prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Manager',
        description: 'Operational oversight',
        policyJson: {
          permissions: ['locations.manage', 'reports.view', 'products.manage'],
        },
      },
    }),
    prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Head Baker',
        description: 'Production owner',
        policyJson: {
          permissions: [
            'recipes.manage',
            'production.manage',
            'inventory.view',
          ],
        },
      },
    }),
    prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Inventory Clerk',
        description: 'Stock and procurement support',
        policyJson: {
          permissions: [
            'inventory.manage',
            'suppliers.manage',
            'procurement.manage',
          ],
        },
      },
    }),
  ]);

  await prisma.userRoleAssignment.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRole.id,
        effectiveFrom: new Date(),
      },
      {
        tenantId: tenant.id,
        userId: legacyOwner.id,
        roleId: ownerRole.id,
        effectiveFrom: new Date(),
      },
      {
        tenantId: tenant.id,
        userId: manager.id,
        roleId: managerRole.id,
        locationId: frontCafe.id,
        effectiveFrom: new Date(),
      },
      {
        tenantId: tenant.id,
        userId: baker.id,
        roleId: bakerRole.id,
        locationId: mainKitchen.id,
        effectiveFrom: new Date(),
      },
      {
        tenantId: tenant.id,
        userId: inventoryClerk.id,
        roleId: inventoryRole.id,
        locationId: mainKitchen.id,
        effectiveFrom: new Date(),
      },
    ],
  });

  await prisma.locationProfile.create({
    data: {
      tenantId: tenant.id,
      locationId: frontCafe.id,
      storeDisplayName: 'BakeStack Front Cafe',
      storeManagerName: 'Cafe Manager',
      storeManagerPhone: '+91-98765-43211',
      seatingCapacity: 24,
      tableCount: 8,
      kitchenType: 'Bakery Cafe',
      hasInHouseKitchen: true,
      hasCentralKitchen: false,
      hasDelivery: true,
      hasTakeaway: true,
      hasDineIn: true,
      hasWholesale: false,
      hasCatering: false,
      serviceModes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PRE_ORDER'],
      averageDailyOrders: 120,
      averageDailyRevenue: '18000.00',
      monthlyRent: '85000.00',
      staffCount: 14,
      productionStartTime: '05:30',
      productionEndTime: '21:00',
      cuisineOrProductFocus: 'cakes, breads, pastries, coffee',
      signatureProductsJson: ['Chocolate Cake', 'Croissant', 'Sourdough'],
      targetCustomersJson: [
        'walk-in cafe guests',
        'celebration cake buyers',
        'office coffee crowd',
      ],
      pricePositioning: 'premium_neighborhood',
      notes: 'Demo operating profile for onboarding and dashboard previews.',
    },
  });

  await prisma.openingHour.createMany({
    data: Object.values(DayOfWeek).map((dayOfWeek) => ({
      tenantId: tenant.id,
      locationId: frontCafe.id,
      dayOfWeek,
      openTime: '08:00',
      closeTime: '22:00',
      isClosed: false,
    })),
  });

  await prisma.complianceProfile.create({
    data: {
      tenantId: tenant.id,
      status: ComplianceStatus.NOT_PROVIDED,
      notes: 'Demo tenant can add GST, FSSAI, and PAN details later.',
    },
  });

  await prisma.onboardingProgress.createMany({
    data: [owner.id, legacyOwner.id].map((userId) => ({
      tenantId: tenant.id,
      userId,
      businessProfileStatus: SetupStepStatus.COMPLETED,
      locationSetupStatus: SetupStepStatus.COMPLETED,
      cafeProfileStatus: SetupStepStatus.COMPLETED,
      complianceStatus: SetupStepStatus.SKIPPED,
      productSetupStatus: SetupStepStatus.COMPLETED,
      inventorySetupStatus: SetupStepStatus.COMPLETED,
      recipeSetupStatus: SetupStepStatus.COMPLETED,
      supplierSetupStatus: SetupStepStatus.COMPLETED,
      productionSetupStatus: SetupStepStatus.COMPLETED,
      isCompleted: true,
      completedAt: new Date(),
    })),
  });

  const categories = await Promise.all(
    ['Cakes', 'Pastries', 'Beverages', 'Breads'].map((name, index) =>
      prisma.productCategory.create({
        data: {
          tenantId: tenant.id,
          name,
          sortOrder: index + 1,
        },
      }),
    ),
  );
  const categoryByName = Object.fromEntries(
    categories.map((category) => [category.name, category]),
  );

  const inventoryItems = await Promise.all(
    [
      ['Flour', InventoryItemType.RAW_MATERIAL, 'kg', 1.8, 30, 20, false],
      ['Sugar', InventoryItemType.RAW_MATERIAL, 'kg', 1.4, 60, 15, false],
      ['Cocoa Powder', InventoryItemType.RAW_MATERIAL, 'kg', 6.5, 90, 5, false],
      ['Butter', InventoryItemType.RAW_MATERIAL, 'kg', 5.9, 21, 8, true],
      ['Cream', InventoryItemType.RAW_MATERIAL, 'l', 3.8, 10, 6, true],
      ['Yeast', InventoryItemType.RAW_MATERIAL, 'kg', 4.2, 60, 3, false],
      ['Eggs', InventoryItemType.RAW_MATERIAL, 'dozen', 3.2, 14, 8, true],
      ['Milk', InventoryItemType.RAW_MATERIAL, 'l', 1.6, 7, 12, true],
      [
        'Vanilla Essence',
        InventoryItemType.RAW_MATERIAL,
        'l',
        12,
        180,
        1,
        false,
      ],
      ['Chocolate', InventoryItemType.RAW_MATERIAL, 'kg', 7.4, 120, 4, false],
      [
        'Cake Box 500g',
        InventoryItemType.PACKAGING,
        'each',
        0.55,
        365,
        50,
        false,
      ],
      [
        'Cupcake Box',
        InventoryItemType.PACKAGING,
        'each',
        0.32,
        365,
        80,
        false,
      ],
      ['Paper Bag', InventoryItemType.PACKAGING, 'each', 0.08, 365, 120, false],
      [
        'Chocolate Cake 500g Finished Good',
        InventoryItemType.FINISHED_GOOD,
        'each',
        0,
        2,
        10,
        true,
      ],
      [
        'Butter Croissant Finished Good',
        InventoryItemType.FINISHED_GOOD,
        'each',
        0,
        1,
        20,
        true,
      ],
      [
        'Vanilla Cupcake Finished Good',
        InventoryItemType.FINISHED_GOOD,
        'each',
        0,
        1,
        20,
        true,
      ],
      [
        'Sourdough Loaf Finished Good',
        InventoryItemType.FINISHED_GOOD,
        'each',
        0,
        2,
        15,
        true,
      ],
    ].map(
      ([
        name,
        type,
        defaultUom,
        unitCost,
        shelfLifeDays,
        reorderLevel,
        isPerishable,
      ]) =>
        prisma.inventoryItem.create({
          data: {
            tenantId: tenant.id,
            name: name as string,
            type: type as InventoryItemType,
            defaultUom: defaultUom as string,
            unitCost: money(unitCost as number),
            shelfLifeDays: shelfLifeDays as number,
            reorderLevel: money(reorderLevel as number),
            isPerishable: isPerishable as boolean,
          },
        }),
    ),
  );
  const inventoryItemByName = Object.fromEntries(
    inventoryItems.map((item) => [item.name, item]),
  );

  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: 'FreshMill Flour Co.',
        contactName: 'Mia Collins',
        email: 'orders@freshmill.example',
        phone: '+1-415-555-0200',
        paymentTerms: 'Net 30',
        leadTimeDays: 3,
        status: SupplierStatus.ACTIVE,
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: 'DairyPure Supplier',
        contactName: 'Aaron Bell',
        email: 'supply@dairypure.example',
        phone: '+1-415-555-0201',
        paymentTerms: 'Net 14',
        leadTimeDays: 2,
        status: SupplierStatus.ACTIVE,
      },
    }),
    prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        name: 'SweetBase Ingredients',
        contactName: 'Lina Patel',
        email: 'hello@sweetbase.example',
        phone: '+1-415-555-0202',
        paymentTerms: 'Net 21',
        leadTimeDays: 4,
        status: SupplierStatus.ACTIVE,
      },
    }),
  ]);
  const supplierByName = Object.fromEntries(
    suppliers.map((supplier) => [supplier.name, supplier]),
  );

  const supplierMappings = [
    ['FreshMill Flour Co.', 'Flour', 'FLOUR-25KG', 'kg', 25, 1.8, 25],
    ['SweetBase Ingredients', 'Sugar', 'SUGAR-20KG', 'kg', 20, 1.4, 20],
    ['SweetBase Ingredients', 'Cocoa Powder', 'COCOA-10KG', 'kg', 10, 6.5, 10],
    ['DairyPure Supplier', 'Butter', 'BUTTER-5KG', 'kg', 5, 5.9, 5],
    ['DairyPure Supplier', 'Cream', 'CREAM-10L', 'l', 10, 3.8, 10],
    ['DairyPure Supplier', 'Milk', 'MILK-20L', 'l', 20, 1.6, 20],
    ['FreshMill Flour Co.', 'Yeast', 'YEAST-1KG', 'kg', 1, 4.2, 1],
    [
      'SweetBase Ingredients',
      'Vanilla Essence',
      'VAN-500ML',
      'l',
      0.5,
      12,
      0.5,
    ],
    ['SweetBase Ingredients', 'Chocolate', 'CHOCO-5KG', 'kg', 5, 7.4, 5],
  ] as const;

  await prisma.supplierItem.createMany({
    data: supplierMappings.map(
      ([
        supplierName,
        inventoryName,
        supplierSku,
        purchaseUom,
        packSize,
        currentPrice,
        minOrderQty,
      ]) => ({
        tenantId: tenant.id,
        supplierId: supplierByName[supplierName].id,
        inventoryItemId: inventoryItemByName[inventoryName].id,
        supplierSku,
        purchaseUom,
        packSize: money(packSize),
        currentPrice: money(currentPrice),
        minOrderQty: money(minOrderQty),
      }),
    ),
  });

  const products = await Promise.all([
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: categoryByName.Cakes.id,
        name: 'Chocolate Cake',
        description: 'Internal finished cake for cafe and catering',
        status: ProductStatus.ACTIVE,
        shelfLifeHours: 48,
        variants: {
          create: {
            tenantId: tenant.id,
            sku: 'CAKE-CHOCO-500',
            name: 'Chocolate Cake 500g',
            unit: 'each',
            defaultSellingPrice: '18.50',
            status: ProductStatus.ACTIVE,
            inventoryItemId:
              inventoryItemByName['Chocolate Cake 500g Finished Good'].id,
          },
        },
      },
      include: { variants: true },
    }),
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: categoryByName.Pastries.id,
        name: 'Croissant',
        description: 'Butter croissant for morning service',
        status: ProductStatus.ACTIVE,
        shelfLifeHours: 12,
        variants: {
          create: {
            tenantId: tenant.id,
            sku: 'PASTRY-CROISSANT',
            name: 'Butter Croissant',
            unit: 'each',
            defaultSellingPrice: '4.50',
            status: ProductStatus.ACTIVE,
            inventoryItemId:
              inventoryItemByName['Butter Croissant Finished Good'].id,
          },
        },
      },
      include: { variants: true },
    }),
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: categoryByName.Cakes.id,
        name: 'Vanilla Cupcake',
        description: 'Cupcake for front counter display',
        status: ProductStatus.ACTIVE,
        shelfLifeHours: 24,
        variants: {
          create: {
            tenantId: tenant.id,
            sku: 'CUPCAKE-VANILLA',
            name: 'Vanilla Cupcake',
            unit: 'each',
            defaultSellingPrice: '3.80',
            status: ProductStatus.ACTIVE,
            inventoryItemId:
              inventoryItemByName['Vanilla Cupcake Finished Good'].id,
          },
        },
      },
      include: { variants: true },
    }),
    prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: categoryByName.Breads.id,
        name: 'Sourdough Bread',
        description: 'Daily fermented bread loaf',
        status: ProductStatus.ACTIVE,
        shelfLifeHours: 36,
        variants: {
          create: {
            tenantId: tenant.id,
            sku: 'BREAD-SOURDOUGH',
            name: 'Sourdough Loaf',
            unit: 'each',
            defaultSellingPrice: '7.20',
            status: ProductStatus.ACTIVE,
            inventoryItemId:
              inventoryItemByName['Sourdough Loaf Finished Good'].id,
          },
        },
      },
      include: { variants: true },
    }),
  ]);
  const variantByName = Object.fromEntries(
    products.flatMap((product) =>
      product.variants.map((variant) => [variant.name, variant]),
    ),
  );

  const recipes = await Promise.all([
    prisma.recipe.create({
      data: {
        tenantId: tenant.id,
        productVariantId: variantByName['Chocolate Cake 500g'].id,
        name: 'Chocolate Cake 500g',
        version: 1,
        batchYieldQty: '10',
        yieldUom: 'each',
        status: RecipeStatus.ACTIVE,
        isActive: true,
        createdById: baker.id,
        components: {
          create: [
            ['Flour', 2.2, 'kg', 2],
            ['Sugar', 1.2, 'kg', 0],
            ['Cocoa Powder', 0.55, 'kg', 0],
            ['Butter', 0.9, 'kg', 2],
            ['Cream', 1.1, 'l', 1],
            ['Eggs', 1, 'dozen', 0],
            ['Cake Box 500g', 10, 'each', 0],
          ].map(([itemName, quantity, uom, lossFactorPercent]) => ({
            tenantId: tenant.id,
            inventoryItemId: inventoryItemByName[itemName as string].id,
            quantity: money(quantity as number),
            uom: uom as string,
            lossFactorPercent: money(lossFactorPercent as number),
          })),
        },
      },
      include: { components: true },
    }),
    prisma.recipe.create({
      data: {
        tenantId: tenant.id,
        productVariantId: variantByName['Butter Croissant'].id,
        name: 'Butter Croissant',
        version: 1,
        batchYieldQty: '24',
        yieldUom: 'each',
        status: RecipeStatus.ACTIVE,
        isActive: true,
        createdById: baker.id,
        components: {
          create: [
            ['Flour', 3.5, 'kg', 3],
            ['Butter', 1.6, 'kg', 2],
            ['Yeast', 0.12, 'kg', 0],
            ['Milk', 1.4, 'l', 1],
            ['Sugar', 0.25, 'kg', 0],
            ['Paper Bag', 24, 'each', 0],
          ].map(([itemName, quantity, uom, lossFactorPercent]) => ({
            tenantId: tenant.id,
            inventoryItemId: inventoryItemByName[itemName as string].id,
            quantity: money(quantity as number),
            uom: uom as string,
            lossFactorPercent: money(lossFactorPercent as number),
          })),
        },
      },
    }),
    prisma.recipe.create({
      data: {
        tenantId: tenant.id,
        productVariantId: variantByName['Vanilla Cupcake'].id,
        name: 'Vanilla Cupcake',
        version: 1,
        batchYieldQty: '24',
        yieldUom: 'each',
        status: RecipeStatus.ACTIVE,
        isActive: true,
        createdById: baker.id,
        components: {
          create: [
            ['Flour', 1.8, 'kg', 2],
            ['Sugar', 0.95, 'kg', 0],
            ['Butter', 0.75, 'kg', 2],
            ['Eggs', 0.75, 'dozen', 0],
            ['Vanilla Essence', 0.08, 'l', 0],
            ['Cupcake Box', 24, 'each', 0],
          ].map(([itemName, quantity, uom, lossFactorPercent]) => ({
            tenantId: tenant.id,
            inventoryItemId: inventoryItemByName[itemName as string].id,
            quantity: money(quantity as number),
            uom: uom as string,
            lossFactorPercent: money(lossFactorPercent as number),
          })),
        },
      },
    }),
    prisma.recipe.create({
      data: {
        tenantId: tenant.id,
        productVariantId: variantByName['Sourdough Loaf'].id,
        name: 'Sourdough Loaf',
        version: 1,
        batchYieldQty: '12',
        yieldUom: 'each',
        status: RecipeStatus.ACTIVE,
        isActive: true,
        createdById: baker.id,
        components: {
          create: [
            ['Flour', 4.5, 'kg', 4],
            ['Yeast', 0.05, 'kg', 0],
            ['Paper Bag', 12, 'each', 0],
          ].map(([itemName, quantity, uom, lossFactorPercent]) => ({
            tenantId: tenant.id,
            inventoryItemId: inventoryItemByName[itemName as string].id,
            quantity: money(quantity as number),
            uom: uom as string,
            lossFactorPercent: money(lossFactorPercent as number),
          })),
        },
      },
    }),
  ]);

  const openingStocks = [
    ['Flour', 120, 1.8, 45],
    ['Sugar', 80, 1.4, 60],
    ['Cocoa Powder', 24, 6.5, 120],
    ['Butter', 40, 5.9, 10],
    ['Cream', 30, 3.8, 5],
    ['Yeast', 12, 4.2, 60],
    ['Eggs', 36, 3.2, 7],
    ['Milk', 45, 1.6, 5],
    ['Vanilla Essence', 6, 12, 180],
    ['Chocolate', 25, 7.4, 180],
    ['Cake Box 500g', 300, 0.55, 365],
    ['Cupcake Box', 400, 0.32, 365],
    ['Paper Bag', 600, 0.08, 365],
  ] as const;

  for (const [itemName, quantity, unitCost, shelfLifeDays] of openingStocks) {
    const lot = await prisma.inventoryLot.create({
      data: {
        tenantId: tenant.id,
        inventoryItemId: inventoryItemByName[itemName].id,
        supplierId:
          itemName === 'Flour'
            ? supplierByName['FreshMill Flour Co.'].id
            : itemName === 'Butter' ||
                itemName === 'Cream' ||
                itemName === 'Milk'
              ? supplierByName['DairyPure Supplier'].id
              : supplierByName['SweetBase Ingredients'].id,
        supplierBatchNo: `OPEN-${itemName.replace(/\s+/g, '-').toUpperCase()}`,
        receivedAt: new Date(),
        expiryAt: new Date(
          Date.now() + Number(shelfLifeDays) * 24 * 60 * 60 * 1000,
        ),
      },
    });

    await prisma.inventoryBalance.create({
      data: {
        tenantId: tenant.id,
        locationId: mainKitchen.id,
        inventoryItemId: inventoryItemByName[itemName].id,
        lotId: lot.id,
        onHandQty: money(quantity),
        reservedQty: money(0),
        availableQty: money(quantity),
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        tenantId: tenant.id,
        locationId: mainKitchen.id,
        inventoryItemId: inventoryItemByName[itemName].id,
        lotId: lot.id,
        movementType: InventoryMovementType.OPENING_STOCK,
        quantity: money(quantity),
        unitCost: money(unitCost),
        totalCost: moneyMinor(quantity * unitCost),
        referenceType: 'SeedOpeningStock',
        reason: 'Initial seeded opening stock',
        createdById: inventoryClerk.id,
      },
    });
  }

  const productionPlan = await prisma.productionPlan.create({
    data: {
      tenantId: tenant.id,
      locationId: mainKitchen.id,
      planDate: new Date(),
      status: ProductionPlanStatus.DRAFT,
      notes: 'Tomorrow morning bakes and prep',
      createdById: baker.id,
    },
  });

  const chocolateRecipe = recipes[0];
  const chocolateVariant = variantByName['Chocolate Cake 500g'];
  const requiredForBatch = chocolateRecipe.components.map((component) => ({
    component,
    requiredQty:
      (Number(component.quantity) * 20) / Number(chocolateRecipe.batchYieldQty),
  }));

  const approvedBatch = await prisma.productionBatch.create({
    data: {
      tenantId: tenant.id,
      locationId: mainKitchen.id,
      recipeId: chocolateRecipe.id,
      batchNumber: 'BATCH-DEMO-001',
      status: ProductionBatchStatus.APPROVED,
      plannedQty: '20',
      approvedById: manager.id,
      createdById: baker.id,
      items: {
        create: {
          tenantId: tenant.id,
          productVariantId: chocolateVariant.id,
          quantityPlanned: '20',
          quantityCompleted: '0',
        },
      },
      consumptions: {
        create: requiredForBatch.map(({ component, requiredQty }) => ({
          tenantId: tenant.id,
          inventoryItemId: component.inventoryItemId,
          requiredQty: money(requiredQty),
          consumedQty: money(0),
          uom: component.uom,
          unitCost:
            inventoryItemByName[
              inventoryItems.find(
                (item) => item.id === component.inventoryItemId,
              )!.name
            ].unitCost,
          totalCost: 0,
        })),
      },
    },
    include: {
      consumptions: true,
    },
  });

  await prisma.dailyClose.create({
    data: {
      tenantId: tenant.id,
      locationId: frontCafe.id,
      businessDate: new Date(),
      status: 'DRAFT',
      salesTotal: moneyMinor(2450),
      cogsTotal: moneyMinor(780),
      wasteTotal: moneyMinor(90),
      grossProfit: moneyMinor(1580),
      labourCost: moneyMinor(420),
      netEstimate: moneyMinor(1160),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        actorId: owner.id,
        action: 'seed.tenant_initialized',
        entityType: 'Tenant',
        entityId: tenant.id,
        correlationId: 'seed-run',
      },
      {
        tenantId: tenant.id,
        actorId: baker.id,
        action: 'seed.production_plan_created',
        entityType: 'ProductionPlan',
        entityId: productionPlan.id,
        correlationId: 'seed-run',
      },
      {
        tenantId: tenant.id,
        actorId: manager.id,
        action: 'seed.production_batch_approved',
        entityType: 'ProductionBatch',
        entityId: approvedBatch.id,
        correlationId: 'seed-run',
      },
    ],
  });

  console.log('BakeStack backend seed completed.');
}

void main()
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
