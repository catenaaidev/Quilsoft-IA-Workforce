CREATE TABLE IF NOT EXISTS customer_price_lists (
 id TEXT PRIMARY KEY,
 client_name TEXT NOT NULL,
 market TEXT NOT NULL DEFAULT '',
 country TEXT NOT NULL DEFAULT '',
 owner TEXT NOT NULL DEFAULT '',
 primary_list_code TEXT NOT NULL,
 secondary_list_code TEXT,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 source TEXT NOT NULL DEFAULT 'Dashboard Reporte de Ventas ME',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_price_lists_client ON customer_price_lists(client_name);
CREATE TABLE IF NOT EXISTS order_price_list_assignments (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 list_code TEXT NOT NULL,
 matched_client_id TEXT REFERENCES customer_price_lists(id),
 confirmed_by TEXT NOT NULL,
 confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
