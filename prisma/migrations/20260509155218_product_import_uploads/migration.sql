-- CreateEnum
CREATE TYPE "ProductImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateTable
CREATE TABLE "ProductImport" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "uploadedById" UUID,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "sourceFileText" TEXT,
    "status" "ProductImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createdCategoriesCount" INTEGER NOT NULL DEFAULT 0,
    "createdProductsCount" INTEGER NOT NULL DEFAULT 0,
    "updatedProductsCount" INTEGER NOT NULL DEFAULT 0,
    "createdVariantsCount" INTEGER NOT NULL DEFAULT 0,
    "updatedVariantsCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImport_tenantId_idx" ON "ProductImport"("tenantId");

-- CreateIndex
CREATE INDEX "ProductImport_tenantId_status_idx" ON "ProductImport"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProductImport_tenantId_createdAt_idx" ON "ProductImport"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductImport" ADD CONSTRAINT "ProductImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImport" ADD CONSTRAINT "ProductImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
