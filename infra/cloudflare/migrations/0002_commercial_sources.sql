-- Fuente comercial: datos importados como referencias, NO como órdenes aprobadas.
CREATE TABLE IF NOT EXISTS workforce_import_sources (
 id TEXT PRIMARY KEY, filename TEXT NOT NULL, kind TEXT NOT NULL,
 sheet_name TEXT NOT NULL, headers_json TEXT NOT NULL, imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workforce_import_rows (
 source_id TEXT NOT NULL REFERENCES workforce_import_sources(id),
 row_number INTEGER NOT NULL, values_json TEXT NOT NULL,
 PRIMARY KEY(source_id,row_number)
);
CREATE INDEX IF NOT EXISTS idx_workforce_import_rows_source ON workforce_import_rows(source_id,row_number);
