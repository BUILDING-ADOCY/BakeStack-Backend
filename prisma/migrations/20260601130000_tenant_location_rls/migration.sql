-- Runtime requests must use a login granted membership in bakestack_runtime.
-- Migration and seed jobs continue to use the owning migration credential.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bakestack_runtime') THEN
    CREATE ROLE bakestack_runtime
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO bakestack_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bakestack_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bakestack_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bakestack_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bakestack_runtime;

CREATE OR REPLACE FUNCTION app_tenant_matches(row_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT row_tenant_id = NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
$$;

CREATE OR REPLACE FUNCTION app_location_matches(
  row_tenant_id UUID,
  row_location_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT
    app_tenant_matches(row_tenant_id)
    AND (
      COALESCE(NULLIF(current_setting('app.tenant_wide_access', TRUE), ''), 'false')::BOOLEAN
      OR row_location_id::TEXT = ANY(
        string_to_array(
          COALESCE(current_setting('app.allowed_location_ids', TRUE), ''),
          ','
        )
      )
    )
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User',
    'Role',
    'UserRoleAssignment',
    'BusinessProfile',
    'ComplianceProfile',
    'Product',
    'ProductVariant',
    'ProductImport',
    'InventoryItem',
    'InventoryLot',
    'Supplier',
    'SupplierItem',
    'SupplierRequest',
    'SupplierRequestItem',
    'SupplierMessageThread',
    'SupplierMessage',
    'SupplierQuotation',
    'PurchaseOrderLine',
    'GoodsReceiptLine',
    'SupplierInvoice',
    'Recipe',
    'RecipeComponent',
    'ProductionBatchItem',
    'ProductionConsumption',
    'ProductionOutput',
    'AuditLog',
    'IdempotencyKey'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %I USING (app_tenant_matches("tenantId")) WITH CHECK (app_tenant_matches("tenantId"))',
      table_name
    );
  END LOOP;
END $$;

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_root_scope ON "Tenant"
  USING (app_tenant_matches("id"))
  WITH CHECK (app_tenant_matches("id"));

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Location',
    'LocationProfile',
    'OpeningHour',
    'LocationProductVariantSetting',
    'LocationInventoryItemSetting',
    'LocationSupplierItemSetting',
    'InventoryBalance',
    'InventoryMovement',
    'InventoryImport',
    'ProcurementRequest',
    'PurchaseOrder',
    'GoodsReceipt',
    'ProductionPlan',
    'ProductionBatch',
    'WasteEvent',
    'QCCheck',
    'DailyClose'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY location_scope ON %I USING (app_location_matches("tenantId", %s)) WITH CHECK (app_location_matches("tenantId", %s))',
      table_name,
      CASE WHEN table_name = 'Location' THEN '"id"' ELSE '"locationId"' END,
      CASE WHEN table_name = 'Location' THEN '"id"' ELSE '"locationId"' END
    );
  END LOOP;
END $$;
