CREATE TYPE "ProcurementSourceType" AS ENUM (
  'MANUAL',
  'LOW_STOCK',
  'PRODUCTION_PLAN',
  'FORECAST',
  'RECURRING'
);

CREATE TYPE "ProcurementRequestStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'SUPPLIER_REQUEST_CREATED',
  'SUPPLIER_MESSAGE_SENT',
  'SUPPLIER_RESPONDED',
  'QUOTATION_RECEIVED',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'FULLY_RECEIVED',
  'CANCELLED',
  'CLOSED'
);

CREATE TYPE "ProcurementRequestItemStatus" AS ENUM (
  'PENDING',
  'ASSIGNED',
  'UNASSIGNED',
  'QUOTED',
  'ACCEPTED',
  'REJECTED',
  'RECEIVED'
);

CREATE TYPE "SupplierRequestStatus" AS ENUM (
  'DRAFT',
  'READY_TO_SEND',
  'SENT',
  'DELIVERED',
  'SEEN',
  'AWAITING_REPLY',
  'SUPPLIER_REPLIED',
  'QUOTATION_RECEIVED',
  'NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'PO_CREATED',
  'DELIVERY_PENDING',
  'PARTIALLY_RECEIVED',
  'FULLY_RECEIVED',
  'CLOSED',
  'ESCALATED'
);

CREATE TYPE "SupplierMessageSenderType" AS ENUM (
  'BAKERY_USER',
  'SUPPLIER',
  'SYSTEM',
  'AI_ASSISTANT'
);

CREATE TYPE "SupplierMessageChannel" AS ENUM (
  'EMAIL',
  'WHATSAPP',
  'SMS',
  'PORTAL',
  'IN_APP'
);

CREATE TYPE "SupplierMessageStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'DELIVERED',
  'FAILED',
  'READ',
  'RECEIVED'
);

CREATE TYPE "SupplierQuotationStatus" AS ENUM (
  'DRAFT',
  'RECEIVED',
  'NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'PO_CREATED'
);

CREATE TABLE "ProcurementRequest" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "sourceType" "ProcurementSourceType" NOT NULL DEFAULT 'MANUAL',
  "requiredDate" TIMESTAMP(3) NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" "ProcurementRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" UUID,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcurementRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementRequestItem" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "procurementRequestId" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "requiredQuantity" DECIMAL(14,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "estimatedPrice" DECIMAL(14,4),
  "preferredSupplierId" UUID,
  "status" "ProcurementRequestItemStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcurementRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierRequest" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "procurementRequestId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "supplierRequestNumber" TEXT NOT NULL,
  "status" "SupplierRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "messageChannel" "SupplierMessageChannel" NOT NULL DEFAULT 'EMAIL',
  "sentAt" TIMESTAMP(3),
  "lastReplyAt" TIMESTAMP(3),
  "requiredDeliveryDate" TIMESTAMP(3),
  "deliveryLocation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierRequestItem" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "supplierRequestId" UUID NOT NULL,
  "procurementRequestItemId" UUID,
  "inventoryItemId" UUID NOT NULL,
  "supplierItemId" UUID,
  "requestedQuantity" DECIMAL(14,4) NOT NULL,
  "quotedQuantity" DECIMAL(14,4),
  "availableQuantity" DECIMAL(14,4),
  "unitPrice" DECIMAL(14,4),
  "taxRate" DECIMAL(6,2),
  "deliveryDate" TIMESTAMP(3),
  "supplierNotes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierMessageThread" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "supplierRequestId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierMessageThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierMessage" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "threadId" UUID NOT NULL,
  "supplierRequestId" UUID NOT NULL,
  "senderType" "SupplierMessageSenderType" NOT NULL,
  "senderId" TEXT,
  "channel" "SupplierMessageChannel" NOT NULL,
  "messageBody" TEXT NOT NULL,
  "messageStatus" "SupplierMessageStatus" NOT NULL DEFAULT 'DRAFT',
  "externalMessageId" TEXT,
  "hasAttachment" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierQuotation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "supplierRequestId" UUID NOT NULL,
  "supplierId" UUID NOT NULL,
  "quotationNumber" TEXT NOT NULL,
  "totalAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "deliveryCharges" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "discount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "status" "SupplierQuotationStatus" NOT NULL DEFAULT 'RECEIVED',
  "validUntil" TIMESTAMP(3),
  "attachmentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierQuotation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "procurementRequestId" UUID,
  ADD COLUMN "supplierRequestId" UUID;

CREATE UNIQUE INDEX "ProcurementRequest_tenantId_requestNumber_key"
  ON "ProcurementRequest"("tenantId", "requestNumber");
CREATE INDEX "ProcurementRequest_tenantId_idx"
  ON "ProcurementRequest"("tenantId");
CREATE INDEX "ProcurementRequest_tenantId_locationId_idx"
  ON "ProcurementRequest"("tenantId", "locationId");
CREATE INDEX "ProcurementRequest_tenantId_status_idx"
  ON "ProcurementRequest"("tenantId", "status");
CREATE INDEX "ProcurementRequest_tenantId_requiredDate_idx"
  ON "ProcurementRequest"("tenantId", "requiredDate");

CREATE INDEX "ProcurementRequestItem_tenantId_idx"
  ON "ProcurementRequestItem"("tenantId");
CREATE INDEX "ProcurementRequestItem_tenantId_procurementRequestId_idx"
  ON "ProcurementRequestItem"("tenantId", "procurementRequestId");
CREATE INDEX "ProcurementRequestItem_tenantId_inventoryItemId_idx"
  ON "ProcurementRequestItem"("tenantId", "inventoryItemId");
CREATE INDEX "ProcurementRequestItem_tenantId_preferredSupplierId_idx"
  ON "ProcurementRequestItem"("tenantId", "preferredSupplierId");
CREATE INDEX "ProcurementRequestItem_tenantId_status_idx"
  ON "ProcurementRequestItem"("tenantId", "status");

CREATE UNIQUE INDEX "SupplierRequest_tenantId_supplierRequestNumber_key"
  ON "SupplierRequest"("tenantId", "supplierRequestNumber");
CREATE INDEX "SupplierRequest_tenantId_idx"
  ON "SupplierRequest"("tenantId");
CREATE INDEX "SupplierRequest_tenantId_procurementRequestId_idx"
  ON "SupplierRequest"("tenantId", "procurementRequestId");
CREATE INDEX "SupplierRequest_tenantId_supplierId_idx"
  ON "SupplierRequest"("tenantId", "supplierId");
CREATE INDEX "SupplierRequest_tenantId_status_idx"
  ON "SupplierRequest"("tenantId", "status");
CREATE INDEX "SupplierRequest_tenantId_lastReplyAt_idx"
  ON "SupplierRequest"("tenantId", "lastReplyAt");

CREATE INDEX "SupplierRequestItem_tenantId_idx"
  ON "SupplierRequestItem"("tenantId");
CREATE INDEX "SupplierRequestItem_tenantId_supplierRequestId_idx"
  ON "SupplierRequestItem"("tenantId", "supplierRequestId");
CREATE INDEX "SupplierRequestItem_tenantId_inventoryItemId_idx"
  ON "SupplierRequestItem"("tenantId", "inventoryItemId");
CREATE INDEX "SupplierRequestItem_tenantId_status_idx"
  ON "SupplierRequestItem"("tenantId", "status");

CREATE UNIQUE INDEX "SupplierMessageThread_supplierRequestId_key"
  ON "SupplierMessageThread"("supplierRequestId");
CREATE INDEX "SupplierMessageThread_tenantId_idx"
  ON "SupplierMessageThread"("tenantId");
CREATE INDEX "SupplierMessageThread_tenantId_supplierId_idx"
  ON "SupplierMessageThread"("tenantId", "supplierId");
CREATE INDEX "SupplierMessageThread_tenantId_status_idx"
  ON "SupplierMessageThread"("tenantId", "status");
CREATE INDEX "SupplierMessageThread_tenantId_lastMessageAt_idx"
  ON "SupplierMessageThread"("tenantId", "lastMessageAt");

CREATE INDEX "SupplierMessage_tenantId_idx"
  ON "SupplierMessage"("tenantId");
CREATE INDEX "SupplierMessage_tenantId_threadId_idx"
  ON "SupplierMessage"("tenantId", "threadId");
CREATE INDEX "SupplierMessage_tenantId_supplierRequestId_idx"
  ON "SupplierMessage"("tenantId", "supplierRequestId");
CREATE INDEX "SupplierMessage_tenantId_messageStatus_idx"
  ON "SupplierMessage"("tenantId", "messageStatus");
CREATE INDEX "SupplierMessage_tenantId_createdAt_idx"
  ON "SupplierMessage"("tenantId", "createdAt");

CREATE UNIQUE INDEX "SupplierQuotation_tenantId_quotationNumber_key"
  ON "SupplierQuotation"("tenantId", "quotationNumber");
CREATE INDEX "SupplierQuotation_tenantId_idx"
  ON "SupplierQuotation"("tenantId");
CREATE INDEX "SupplierQuotation_tenantId_supplierRequestId_idx"
  ON "SupplierQuotation"("tenantId", "supplierRequestId");
CREATE INDEX "SupplierQuotation_tenantId_supplierId_idx"
  ON "SupplierQuotation"("tenantId", "supplierId");
CREATE INDEX "SupplierQuotation_tenantId_status_idx"
  ON "SupplierQuotation"("tenantId", "status");

CREATE INDEX "PurchaseOrder_tenantId_procurementRequestId_idx"
  ON "PurchaseOrder"("tenantId", "procurementRequestId");
CREATE INDEX "PurchaseOrder_tenantId_supplierRequestId_idx"
  ON "PurchaseOrder"("tenantId", "supplierRequestId");

ALTER TABLE "ProcurementRequest"
  ADD CONSTRAINT "ProcurementRequest_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProcurementRequest_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProcurementRequest_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProcurementRequestItem"
  ADD CONSTRAINT "ProcurementRequestItem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProcurementRequestItem_procurementRequestId_fkey"
    FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProcurementRequestItem_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProcurementRequestItem_preferredSupplierId_fkey"
    FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierRequest"
  ADD CONSTRAINT "SupplierRequest_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierRequest_procurementRequestId_fkey"
    FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierRequest_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierRequestItem"
  ADD CONSTRAINT "SupplierRequestItem_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierRequestItem_supplierRequestId_fkey"
    FOREIGN KEY ("supplierRequestId") REFERENCES "SupplierRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierRequestItem_procurementRequestItemId_fkey"
    FOREIGN KEY ("procurementRequestItemId") REFERENCES "ProcurementRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierRequestItem_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierRequestItem_supplierItemId_fkey"
    FOREIGN KEY ("supplierItemId") REFERENCES "SupplierItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplierMessageThread"
  ADD CONSTRAINT "SupplierMessageThread_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierMessageThread_supplierRequestId_fkey"
    FOREIGN KEY ("supplierRequestId") REFERENCES "SupplierRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierMessageThread_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierMessage"
  ADD CONSTRAINT "SupplierMessage_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "SupplierMessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierMessage_supplierRequestId_fkey"
    FOREIGN KEY ("supplierRequestId") REFERENCES "SupplierRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierQuotation"
  ADD CONSTRAINT "SupplierQuotation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierQuotation_supplierRequestId_fkey"
    FOREIGN KEY ("supplierRequestId") REFERENCES "SupplierRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SupplierQuotation_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_procurementRequestId_fkey"
    FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseOrder_supplierRequestId_fkey"
    FOREIGN KEY ("supplierRequestId") REFERENCES "SupplierRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
