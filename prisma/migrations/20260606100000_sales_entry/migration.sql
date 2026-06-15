-- Per-SKU sales capture. One row per (tenant, location, businessDate, productVariant)
-- enforces idempotent upserts. lineRevenue is an integer minor-unit amount (paise);
-- unitSellPrice is a per-unit rate kept as Decimal (consistent with selling prices).

-- CreateTable
CREATE TABLE "SalesEntry" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "productVariantId" UUID NOT NULL,
    "units" DECIMAL(14,4) NOT NULL,
    "unitSellPrice" DECIMAL(14,2) NOT NULL,
    "lineRevenue" INTEGER NOT NULL,
    "currencyCode" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesEntry_tenantId_idx" ON "SalesEntry"("tenantId");

-- CreateIndex
CREATE INDEX "SalesEntry_tenantId_locationId_businessDate_idx" ON "SalesEntry"("tenantId", "locationId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalesEntry_loc_date_variant_key" ON "SalesEntry"("tenantId", "locationId", "businessDate", "productVariantId");

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
