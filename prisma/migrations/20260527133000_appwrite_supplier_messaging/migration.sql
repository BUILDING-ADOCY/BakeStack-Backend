ALTER TYPE "SupplierMessageStatus" ADD VALUE IF NOT EXISTS 'READY_TO_SEND';
ALTER TYPE "SupplierMessageStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "SupplierMessageStatus" ADD VALUE IF NOT EXISTS 'FAILED_PROVIDER_NOT_CONFIGURED';
ALTER TYPE "SupplierMessageStatus" ADD VALUE IF NOT EXISTS 'FAILED_TARGET_NOT_FOUND';

ALTER TABLE "Supplier"
  ADD COLUMN "whatsappNumber" TEXT,
  ADD COLUMN "preferredChannel" "SupplierMessageChannel" DEFAULT 'EMAIL',
  ADD COLUMN "appwriteUserId" TEXT,
  ADD COLUMN "emailTargetId" TEXT,
  ADD COLUMN "smsTargetId" TEXT,
  ADD COLUMN "messagingStatus" TEXT,
  ADD COLUMN "lastMessageSentAt" TIMESTAMP(3);

ALTER TABLE "SupplierRequest"
  ADD COLUMN "messageStatus" "SupplierMessageStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "lastReminderAt" TIMESTAMP(3),
  ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SupplierMessage"
  ADD COLUMN "supplierId" UUID,
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "messageBodyText" TEXT,
  ADD COLUMN "messageBodyHtml" TEXT,
  ADD COLUMN "appwriteMessageId" TEXT,
  ADD COLUMN "appwriteProviderId" TEXT,
  ADD COLUMN "appwriteTargetId" TEXT,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "readAt" TIMESTAMP(3);

UPDATE "SupplierMessage" message
SET "supplierId" = request."supplierId",
    "messageBodyText" = message."messageBody"
FROM "SupplierRequest" request
WHERE message."supplierRequestId" = request."id";

UPDATE "SupplierRequest" request
SET "messageStatus" = CASE
  WHEN request."sentAt" IS NOT NULL THEN 'SENT'::"SupplierMessageStatus"
  ELSE 'DRAFT'::"SupplierMessageStatus"
END
FROM "Supplier" supplier
WHERE request."supplierId" = supplier."id";

CREATE INDEX "SupplierRequest_tenantId_messageStatus_idx"
  ON "SupplierRequest"("tenantId", "messageStatus");

CREATE INDEX "SupplierMessage_tenantId_supplierId_idx"
  ON "SupplierMessage"("tenantId", "supplierId");

ALTER TABLE "SupplierMessage"
  ADD CONSTRAINT "SupplierMessage_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
