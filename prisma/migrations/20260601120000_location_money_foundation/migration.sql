-- Location money foundation rollout notes:
-- 1. Legacy locations predate countryCode/currencyCode and are backfilled to IN/INR.
-- 2. Review the preflight notice before deploy if any legacy location country text is not India.
-- 3. Transaction snapshot columns remain nullable so existing writers can be upgraded independently.

-- Preflight check: this is intentionally a notice, not a blocker, because the legacy model
-- allowed free-form country text. Resolve any reported rows before relying on derived currency.
DO $$
DECLARE
  legacy_non_india_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO legacy_non_india_count
    FROM "Location"
   WHERE LOWER(TRIM(COALESCE("country", ''))) NOT IN ('', 'india');

  IF legacy_non_india_count > 0 THEN
    RAISE NOTICE 'Location money foundation: % legacy location row(s) have non-India country text and will receive the safe IN/INR backfill. Review and correct them through the location API before operational activity locks currency.', legacy_non_india_count;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Location"
  ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'IN',
  ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'INR';

-- AlterTable
ALTER TABLE "ComplianceProfile"
  ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'IN',
  ADD COLUMN "taxRegistrationNumber" TEXT,
  ADD COLUMN "foodSafetyLicenseNumber" TEXT,
  ADD COLUMN "metadataJson" JSONB;

-- AlterTable
ALTER TABLE "LocationProfile" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "SupplierItem" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "ProcurementRequestItem" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "SupplierRequestItem" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "SupplierQuotation" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "GoodsReceipt" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "GoodsReceiptLine" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "SupplierInvoice" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "ProductionBatch"
  ADD COLUMN "estimatedCost" DECIMAL(14,4),
  ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "ProductionConsumption" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "ProductionOutput" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "WasteEvent" ADD COLUMN "currencyCode" TEXT;

-- AlterTable
ALTER TABLE "DailyClose" ADD COLUMN "currencyCode" TEXT;

-- Safe legacy backfill: all pre-foundation locations and compliance profiles were India-first.
UPDATE "Location"
   SET "countryCode" = 'IN',
       "currencyCode" = 'INR';

UPDATE "ComplianceProfile"
   SET "countryCode" = 'IN';

UPDATE "LocationProfile" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "Location" AS location
 WHERE entity."locationId" = location."id"
   AND entity."currencyCode" IS NULL;

-- Backfill global monetary defaults from the tenant currency where possible.
UPDATE "ProductVariant" AS entity
   SET "currencyCode" = COALESCE(NULLIF(tenant."currency", ''), 'INR')
  FROM "Tenant" AS tenant
 WHERE entity."tenantId" = tenant."id"
   AND entity."currencyCode" IS NULL;

UPDATE "InventoryItem" AS entity
   SET "currencyCode" = COALESCE(NULLIF(tenant."currency", ''), 'INR')
  FROM "Tenant" AS tenant
 WHERE entity."tenantId" = tenant."id"
   AND entity."currencyCode" IS NULL;

UPDATE "SupplierItem" AS entity
   SET "currencyCode" = COALESCE(NULLIF(tenant."currency", ''), 'INR')
  FROM "Tenant" AS tenant
 WHERE entity."tenantId" = tenant."id"
   AND entity."currencyCode" IS NULL;

-- Backfill location-aware snapshots from the location currency.
UPDATE "InventoryMovement" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "Location" AS location
 WHERE entity."locationId" = location."id"
   AND entity."currencyCode" IS NULL;

UPDATE "PurchaseOrder" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "Location" AS location
 WHERE entity."locationId" = location."id"
   AND entity."currencyCode" IS NULL;

UPDATE "ProcurementRequestItem" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "ProcurementRequest" AS request
  JOIN "Location" AS location ON location."id" = request."locationId"
 WHERE entity."procurementRequestId" = request."id"
   AND entity."currencyCode" IS NULL;

UPDATE "SupplierRequestItem" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "SupplierRequest" AS supplier_request
  JOIN "ProcurementRequest" AS request ON request."id" = supplier_request."procurementRequestId"
  JOIN "Location" AS location ON location."id" = request."locationId"
 WHERE entity."supplierRequestId" = supplier_request."id"
   AND entity."currencyCode" IS NULL;

UPDATE "SupplierQuotation" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "SupplierRequest" AS supplier_request
  JOIN "ProcurementRequest" AS request ON request."id" = supplier_request."procurementRequestId"
  JOIN "Location" AS location ON location."id" = request."locationId"
 WHERE entity."supplierRequestId" = supplier_request."id"
   AND entity."currencyCode" IS NULL;

UPDATE "PurchaseOrderLine" AS entity
   SET "currencyCode" = purchase_order."currencyCode"
  FROM "PurchaseOrder" AS purchase_order
 WHERE entity."purchaseOrderId" = purchase_order."id"
   AND entity."currencyCode" IS NULL;

UPDATE "GoodsReceipt" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "Location" AS location
 WHERE entity."locationId" = location."id"
   AND entity."currencyCode" IS NULL;

UPDATE "GoodsReceiptLine" AS entity
   SET "currencyCode" = goods_receipt."currencyCode"
  FROM "GoodsReceipt" AS goods_receipt
 WHERE entity."goodsReceiptId" = goods_receipt."id"
   AND entity."currencyCode" IS NULL;

UPDATE "SupplierInvoice" AS entity
   SET "currencyCode" = purchase_order."currencyCode"
  FROM "PurchaseOrder" AS purchase_order
 WHERE entity."purchaseOrderId" = purchase_order."id"
   AND entity."currencyCode" IS NULL;

UPDATE "SupplierInvoice" AS entity
   SET "currencyCode" = COALESCE(NULLIF(tenant."currency", ''), 'INR')
  FROM "Tenant" AS tenant
 WHERE entity."tenantId" = tenant."id"
   AND entity."currencyCode" IS NULL;

UPDATE "ProductionBatch" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "Location" AS location
 WHERE entity."locationId" = location."id"
   AND entity."currencyCode" IS NULL;

UPDATE "ProductionConsumption" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "ProductionBatch" AS batch
  JOIN "Location" AS location ON location."id" = batch."locationId"
 WHERE entity."productionBatchId" = batch."id"
   AND entity."currencyCode" IS NULL;

UPDATE "ProductionOutput" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "ProductionBatch" AS batch
  JOIN "Location" AS location ON location."id" = batch."locationId"
 WHERE entity."productionBatchId" = batch."id"
   AND entity."currencyCode" IS NULL;

UPDATE "WasteEvent" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "Location" AS location
 WHERE entity."locationId" = location."id"
   AND entity."currencyCode" IS NULL;

UPDATE "DailyClose" AS entity
   SET "currencyCode" = location."currencyCode"
  FROM "Location" AS location
 WHERE entity."locationId" = location."id"
   AND entity."currencyCode" IS NULL;

-- CreateTable
CREATE TABLE "LocationProductVariantSetting" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "productVariantId" UUID NOT NULL,
  "sellingPrice" DECIMAL(14,2),
  "currencyCode" TEXT NOT NULL,
  "isAvailable" BOOLEAN,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationProductVariantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationInventoryItemSetting" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "unitCost" DECIMAL(14,4),
  "reorderLevel" DECIMAL(14,4),
  "currencyCode" TEXT NOT NULL,
  "isStocked" BOOLEAN,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationInventoryItemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationSupplierItemSetting" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "supplierItemId" UUID NOT NULL,
  "currentPrice" DECIMAL(14,4),
  "minOrderQty" DECIMAL(14,4),
  "currencyCode" TEXT NOT NULL,
  "isAvailable" BOOLEAN,
  "isPreferred" BOOLEAN,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationSupplierItemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_tenantId_countryCode_idx" ON "Location"("tenantId", "countryCode");

-- CreateIndex
CREATE INDEX "ComplianceProfile_tenantId_countryCode_idx" ON "ComplianceProfile"("tenantId", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "LocationProductVariantSetting_tenantId_locationId_productVariantId_key"
  ON "LocationProductVariantSetting"("tenantId", "locationId", "productVariantId");

-- CreateIndex
CREATE INDEX "LocationProductVariantSetting_tenantId_locationId_idx"
  ON "LocationProductVariantSetting"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "LocationProductVariantSetting_tenantId_productVariantId_idx"
  ON "LocationProductVariantSetting"("tenantId", "productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationInventoryItemSetting_tenantId_locationId_inventoryItemId_key"
  ON "LocationInventoryItemSetting"("tenantId", "locationId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "LocationInventoryItemSetting_tenantId_locationId_idx"
  ON "LocationInventoryItemSetting"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "LocationInventoryItemSetting_tenantId_inventoryItemId_idx"
  ON "LocationInventoryItemSetting"("tenantId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationSupplierItemSetting_tenantId_locationId_supplierItemId_key"
  ON "LocationSupplierItemSetting"("tenantId", "locationId", "supplierItemId");

-- CreateIndex
CREATE INDEX "LocationSupplierItemSetting_tenantId_locationId_idx"
  ON "LocationSupplierItemSetting"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "LocationSupplierItemSetting_tenantId_supplierItemId_idx"
  ON "LocationSupplierItemSetting"("tenantId", "supplierItemId");

-- AddForeignKey
ALTER TABLE "LocationProductVariantSetting"
  ADD CONSTRAINT "LocationProductVariantSetting_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationProductVariantSetting"
  ADD CONSTRAINT "LocationProductVariantSetting_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationProductVariantSetting"
  ADD CONSTRAINT "LocationProductVariantSetting_productVariantId_fkey"
  FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationInventoryItemSetting"
  ADD CONSTRAINT "LocationInventoryItemSetting_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationInventoryItemSetting"
  ADD CONSTRAINT "LocationInventoryItemSetting_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationInventoryItemSetting"
  ADD CONSTRAINT "LocationInventoryItemSetting_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSupplierItemSetting"
  ADD CONSTRAINT "LocationSupplierItemSetting_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSupplierItemSetting"
  ADD CONSTRAINT "LocationSupplierItemSetting_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSupplierItemSetting"
  ADD CONSTRAINT "LocationSupplierItemSetting_supplierItemId_fkey"
  FOREIGN KEY ("supplierItemId") REFERENCES "SupplierItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Postflight check: defaults and the explicit backfill must leave every location usable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "Location"
     WHERE "countryCode" IS NULL
        OR "currencyCode" IS NULL
        OR LENGTH("countryCode") <> 2
        OR LENGTH("currencyCode") <> 3
  ) THEN
    RAISE EXCEPTION 'Location money foundation backfill left invalid location market data';
  END IF;
END $$;
