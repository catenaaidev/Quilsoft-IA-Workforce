-- Catalogo de productos Worknet: datos de referencia. Version Worknet NO valida Loyal.
CREATE TABLE IF NOT EXISTS worknet_product_catalog (
 code TEXT PRIMARY KEY NOT NULL, description TEXT NOT NULL, product_type TEXT, business_line TEXT, family TEXT, product_line TEXT,
 units_per_box TEXT, presentation TEXT, grouping_code TEXT, sales_description TEXT, market TEXT, vintage TEXT, color TEXT, varietal TEXT,
 barcode_unit TEXT, barcode_box TEXT, client_code TEXT, client_name TEXT, destination_country TEXT, version_label TEXT, version_approved_at TEXT,
 discontinued TEXT, source_file TEXT NOT NULL, source_date TEXT NOT NULL, original_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_worknet_catalog_description ON worknet_product_catalog(description COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_worknet_catalog_client ON worknet_product_catalog(client_name);
CREATE INDEX IF NOT EXISTS idx_worknet_catalog_market ON worknet_product_catalog(market);
CREATE INDEX IF NOT EXISTS idx_worknet_catalog_group ON worknet_product_catalog(grouping_code);
