-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('BAKERY', 'CAFE', 'BAKERY_CAFE', 'CLOUD_KITCHEN', 'HOME_BAKER', 'PATISSERIE', 'BREAD_BAKERY', 'CENTRAL_KITCHEN', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessStage" AS ENUM ('IDEA_STAGE', 'PRE_LAUNCH', 'NEWLY_OPENED', 'RUNNING', 'SCALING', 'MULTI_LOCATION');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'PRE_ORDER', 'WHOLESALE', 'CATERING', 'CLOUD_KITCHEN');

-- CreateEnum
CREATE TYPE "SetupStepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('NOT_PROVIDED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- AlterEnum
ALTER TYPE "LocationType" ADD VALUE 'CLOUD_KITCHEN';

-- AlterTable
ALTER TABLE "Location"
ADD COLUMN "addressLine1" TEXT,
ADD COLUMN "addressLine2" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'India',
ADD COLUMN "email" TEXT,
ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "latitude" DECIMAL(10,6),
ADD COLUMN "longitude" DECIMAL(10,6),
ADD COLUMN "phone" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "state" TEXT,
ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "securityOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "securityUserId" TEXT;

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "legalName" TEXT,
    "brandName" TEXT,
    "businessType" "BusinessType" NOT NULL,
    "businessStage" "BusinessStage",
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "ownerEmail" TEXT,
    "websiteUrl" TEXT,
    "instagramUrl" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "defaultLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "storeDisplayName" TEXT,
    "storeManagerName" TEXT,
    "storeManagerPhone" TEXT,
    "seatingCapacity" INTEGER,
    "tableCount" INTEGER,
    "kitchenType" TEXT,
    "hasInHouseKitchen" BOOLEAN DEFAULT false,
    "hasCentralKitchen" BOOLEAN DEFAULT false,
    "hasDelivery" BOOLEAN DEFAULT false,
    "hasTakeaway" BOOLEAN DEFAULT false,
    "hasDineIn" BOOLEAN DEFAULT false,
    "hasWholesale" BOOLEAN DEFAULT false,
    "hasCatering" BOOLEAN DEFAULT false,
    "serviceModes" JSONB,
    "averageDailyOrders" INTEGER,
    "averageDailyRevenue" DECIMAL(14,2),
    "monthlyRent" DECIMAL(14,2),
    "staffCount" INTEGER,
    "productionStartTime" TEXT,
    "productionEndTime" TEXT,
    "peakHoursJson" JSONB,
    "cuisineOrProductFocus" TEXT,
    "signatureProductsJson" JSONB,
    "targetCustomersJson" JSONB,
    "pricePositioning" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID,
    "gstin" TEXT,
    "fssaiLicenseNumber" TEXT,
    "fssaiExpiryDate" TIMESTAMP(3),
    "panNumber" TEXT,
    "businessRegistrationNumber" TEXT,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'NOT_PROVIDED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessProfileStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "locationSetupStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "cafeProfileStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "complianceStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "productSetupStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "inventorySetupStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "recipeSetupStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "supplierSetupStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "productionSetupStatus" "SetupStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_tenantId_key" ON "BusinessProfile"("tenantId");

-- CreateIndex
CREATE INDEX "BusinessProfile_tenantId_idx" ON "BusinessProfile"("tenantId");

-- CreateIndex
CREATE INDEX "BusinessProfile_tenantId_businessType_idx" ON "BusinessProfile"("tenantId", "businessType");

-- CreateIndex
CREATE UNIQUE INDEX "LocationProfile_locationId_key" ON "LocationProfile"("locationId");

-- CreateIndex
CREATE INDEX "LocationProfile_tenantId_idx" ON "LocationProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationProfile_tenantId_locationId_key" ON "LocationProfile"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "OpeningHour_tenantId_idx" ON "OpeningHour"("tenantId");

-- CreateIndex
CREATE INDEX "OpeningHour_tenantId_locationId_idx" ON "OpeningHour"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHour_tenantId_locationId_dayOfWeek_key" ON "OpeningHour"("tenantId", "locationId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ComplianceProfile_tenantId_idx" ON "ComplianceProfile"("tenantId");

-- CreateIndex
CREATE INDEX "ComplianceProfile_tenantId_locationId_idx" ON "ComplianceProfile"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "ComplianceProfile_tenantId_status_idx" ON "ComplianceProfile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OnboardingProgress_tenantId_idx" ON "OnboardingProgress"("tenantId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_tenantId_isCompleted_idx" ON "OnboardingProgress"("tenantId", "isCompleted");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_tenantId_userId_key" ON "OnboardingProgress"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Location_tenantId_isPrimary_idx" ON "Location"("tenantId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_securityOrganizationId_key" ON "Tenant"("securityOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_securityUserId_key" ON "User"("securityUserId");

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationProfile" ADD CONSTRAINT "LocationProfile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationProfile" ADD CONSTRAINT "LocationProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfile" ADD CONSTRAINT "ComplianceProfile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfile" ADD CONSTRAINT "ComplianceProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
