-- Money minor-units rollout (spine amount columns).
--
-- Amount columns (totals/derived costs) move from Decimal(14,4) major units to
-- integer minor units (paise): one major unit = 100 minor units. Per-unit RATE
-- columns (unitCost, sellingPrice, currentPrice, ...) intentionally stay Decimal
-- so sub-paise precision is preserved; only amounts become integers.
--
-- Existing rows are backfilled in place by multiplying by 100 and rounding to the
-- nearest whole minor unit. This is a type-narrowing change: any fractional paise
-- in legacy data is rounded (amounts should already be whole paise in practice).

-- AlterTable: InventoryMovement.totalCost (signed; consumption deltas are negative)
ALTER TABLE "InventoryMovement"
  ALTER COLUMN "totalCost" TYPE INTEGER USING ROUND("totalCost" * 100)::integer;

-- AlterTable: ProductionConsumption.totalCost
ALTER TABLE "ProductionConsumption"
  ALTER COLUMN "totalCost" TYPE INTEGER USING ROUND("totalCost" * 100)::integer;

-- AlterTable: ProductionOutput.totalCost
ALTER TABLE "ProductionOutput"
  ALTER COLUMN "totalCost" TYPE INTEGER USING ROUND("totalCost" * 100)::integer;

-- AlterTable: ProductionBatch.estimatedCost (nullable)
ALTER TABLE "ProductionBatch"
  ALTER COLUMN "estimatedCost" TYPE INTEGER USING ROUND("estimatedCost" * 100)::integer;

-- AlterTable: WasteEvent.costImpact
ALTER TABLE "WasteEvent"
  ALTER COLUMN "costImpact" TYPE INTEGER USING ROUND("costImpact" * 100)::integer;

-- AlterTable: DailyClose money totals
ALTER TABLE "DailyClose"
  ALTER COLUMN "salesTotal" TYPE INTEGER USING ROUND("salesTotal" * 100)::integer,
  ALTER COLUMN "cogsTotal" TYPE INTEGER USING ROUND("cogsTotal" * 100)::integer,
  ALTER COLUMN "wasteTotal" TYPE INTEGER USING ROUND("wasteTotal" * 100)::integer,
  ALTER COLUMN "grossProfit" TYPE INTEGER USING ROUND("grossProfit" * 100)::integer,
  ALTER COLUMN "labourCost" TYPE INTEGER USING ROUND("labourCost" * 100)::integer,
  ALTER COLUMN "netEstimate" TYPE INTEGER USING ROUND("netEstimate" * 100)::integer;
