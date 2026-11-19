CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, customer TEXT NOT NULL,
 received_at TEXT NOT NULL, updated_at TEXT NOT NULL, source_name TEXT NOT NULL,
 source_csv TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'blocked', reviewed_by TEXT,
 reviewed_at TEXT, exported_at TEXT, exported_by TEXT, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS order_lines (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), idx INTEGER NOT NULL,
 fields_json TEXT NOT NULL, sku TEXT NOT NULL, loyal_status TEXT NOT NULL DEFAULT 'unknown',
 loyal_checked_at TEXT, loyal_evidence TEXT,
 UNIQUE(order_id, idx)
);
CREATE TABLE IF NOT EXISTS audit (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
 details TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lines_order ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_order ON audit(order_id,created_at);
