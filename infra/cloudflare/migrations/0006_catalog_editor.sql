-- EXPO: ajustes independientes de los datos originales de Worknet.
-- Los archivos SQL del proveedor pueden reimportarse sin borrar estas correcciones.
CREATE TABLE IF NOT EXISTS worknet_product_catalog_overrides (
  code TEXT PRIMARY KEY NOT NULL,
  description TEXT,
  market TEXT,
  client_name TEXT,
  presentation TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  edited_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(code) REFERENCES worknet_product_catalog(code)
);
CREATE INDEX IF NOT EXISTS idx_worknet_overrides_active ON worknet_product_catalog_overrides(is_active);
