ALTER TABLE "WasteEvent"
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedById" UUID,
  ADD COLUMN "voidReason" TEXT;

ALTER TABLE "WasteEvent"
  ADD CONSTRAINT "WasteEvent_voidedById_fkey"
    FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WasteEvent_tenantId_voidedAt_idx"
  ON "WasteEvent"("tenantId", "voidedAt");
