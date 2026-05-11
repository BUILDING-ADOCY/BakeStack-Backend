-- CreateEnum
CREATE TYPE "InventoryImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateTable
CREATE TABLE "InventoryImport" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "uploadedById" UUID,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "sourceFileText" TEXT,
    "status" "InventoryImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createdItemsCount" INTEGER NOT NULL DEFAULT 0,
    "updatedItemsCount" INTEGER NOT NULL DEFAULT 0,
    "openingStockRowsCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryImport_tenantId_idx" ON "InventoryImport"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryImport_tenantId_locationId_idx" ON "InventoryImport"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryImport_tenantId_status_idx" ON "InventoryImport"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InventoryImport_tenantId_createdAt_idx" ON "InventoryImport"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryImport" ADD CONSTRAINT "InventoryImport_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryImport" ADD CONSTRAINT "InventoryImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryImport" ADD CONSTRAINT "InventoryImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
