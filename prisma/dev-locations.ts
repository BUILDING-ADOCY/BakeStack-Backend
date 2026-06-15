/**
 * Dev fixture: add one location per supported region to the logged-in user's
 * tenant (India, Australia, North America, South America, Europe), each with its
 * own currency + per-location ingredient costs and variant price so the
 * sales -> COGS -> margin flow works (and All-locations shows the mixed-currency
 * handling). Idempotent. Run after dev-fixture.ts:  npx tsx prisma/dev-locations.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = process.env.FIXTURE_USER_EMAIL ?? 'surajmahapatra2003@gmail.com';
const d = (v: string) => new Prisma.Decimal(v);

const regions = [
  {
    name: 'Mumbai Flagship',
    type: 'BAKERY',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    countryCode: 'IN',
    currencyCode: 'INR',
    timezone: 'Asia/Kolkata',
  },
  {
    name: 'Sydney Store',
    type: 'CAFE',
    city: 'Sydney',
    state: 'New South Wales',
    country: 'Australia',
    countryCode: 'AU',
    currencyCode: 'AUD',
    timezone: 'Australia/Sydney',
  },
  {
    name: 'New York Store',
    type: 'CAFE',
    city: 'New York',
    state: 'New York',
    country: 'United States',
    countryCode: 'US',
    currencyCode: 'USD',
    timezone: 'America/New_York',
  },
  {
    name: 'Sao Paulo Store',
    type: 'CAFE',
    city: 'Sao Paulo',
    state: 'Sao Paulo',
    country: 'Brazil',
    countryCode: 'BR',
    currencyCode: 'BRL',
    timezone: 'America/Sao_Paulo',
  },
  {
    name: 'Berlin Store',
    type: 'CAFE',
    city: 'Berlin',
    state: 'Berlin',
    country: 'Germany',
    countryCode: 'DE',
    currencyCode: 'EUR',
    timezone: 'Europe/Berlin',
  },
] as const;

async function main() {
  const user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (!user) throw new Error(`User not found: ${EMAIL}`);
  const tenantId = user.tenantId;

  const flour = await prisma.inventoryItem.findFirst({
    where: { tenantId, name: 'Flour' },
  });
  const choc = await prisma.inventoryItem.findFirst({
    where: { tenantId, name: 'Dark Chocolate' },
  });
  const variant = await prisma.productVariant.findFirst({
    where: { tenantId, sku: 'CAKE-CHOCO-500' },
  });
  if (!flour || !choc || !variant) {
    throw new Error(
      'Run prisma/dev-fixture.ts first (needs Flour, Dark Chocolate, CAKE-CHOCO-500).',
    );
  }

  for (const r of regions) {
    let location = await prisma.location.findFirst({
      where: { tenantId, name: r.name },
    });
    location ??= await prisma.location.create({
      data: {
        tenantId,
        name: r.name,
        type: r.type as Prisma.LocationCreateInput['type'],
        city: r.city,
        state: r.state,
        country: r.country,
        countryCode: r.countryCode,
        currencyCode: r.currencyCode,
        timezone: r.timezone,
        isPrimary: false,
        isActive: true,
      },
    });

    for (const [item, cost] of [
      [flour, '40'],
      [choc, '600'],
    ] as const) {
      const existing = await prisma.locationInventoryItemSetting.findFirst({
        where: { tenantId, locationId: location.id, inventoryItemId: item.id },
      });
      if (!existing) {
        await prisma.locationInventoryItemSetting.create({
          data: {
            tenantId,
            locationId: location.id,
            inventoryItemId: item.id,
            unitCost: d(cost),
            currencyCode: r.currencyCode,
            isStocked: true,
          },
        });
      }
    }

    const variantSetting = await prisma.locationProductVariantSetting.findFirst(
      {
        where: {
          tenantId,
          locationId: location.id,
          productVariantId: variant.id,
        },
      },
    );
    if (!variantSetting) {
      await prisma.locationProductVariantSetting.create({
        data: {
          tenantId,
          locationId: location.id,
          productVariantId: variant.id,
          sellingPrice: d('500'),
          currencyCode: r.currencyCode,
          isAvailable: true,
        },
      });
    }

    console.log('location:', r.name, '->', location.id, `(${r.currencyCode})`);
  }

  console.log('LOCATIONS_DONE');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
