-- EXPO AI Agent: métricas de IA, presupuestos y control del buzón.
-- Migración ADITIVA: no borra ni modifica datos existentes.

-- Consumo real por ejecución (tokens informados por el proveedor o estimados, marcados).
ALTER TABLE executions ADD COLUMN tokens_input INTEGER;
ALTER TABLE executions ADD COLUMN tokens_output INTEGER;
ALTER TABLE executions ADD COLUMN tokens_estimated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE executions ADD COLUMN model_tier TEXT;
ALTER TABLE executions ADD COLUMN escalation_reason TEXT;
ALTER TABLE executions ADD COLUMN cache_hit INTEGER NOT NULL DEFAULT 0;

-- Presupuestos configurables (tokens). scope: 'document', 'day', 'month' u otro alcance futuro.
CREATE TABLE IF NOT EXISTS ai_budgets (
  scope TEXT PRIMARY KEY,
  max_tokens INTEGER NOT NULL CHECK (max_tokens > 0),
  updated_by TEXT NOT NULL DEFAULT 'sistema',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO ai_budgets(scope, max_tokens) VALUES ('document', 24000), ('day', 400000), ('month', 6000000);

-- Precios por modelo: vacío por defecto. Sin precio cargado no se informa costo (no se inventa).
CREATE TABLE IF NOT EXISTS ai_model_prices (
  model TEXT PRIMARY KEY,
  usd_per_million_input REAL NOT NULL CHECK (usd_per_million_input >= 0),
  usd_per_million_output REAL NOT NULL CHECK (usd_per_million_output >= 0),
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Cada consulta al buzón (para "Última consulta" y errores reales).
CREATE TABLE IF NOT EXISTS mail_poll_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  result TEXT NOT NULL CHECK (result IN ('ok','not_configured','error')),
  messages_seen INTEGER NOT NULL DEFAULT 0,
  orders_created INTEGER NOT NULL DEFAULT 0,
  attachments_queued INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_mail_poll_runs_started ON mail_poll_runs(started_at DESC);

-- Formato Worknet de 22 columnas. Nace NO validado: se valida solo cuando un
-- administrador registra una prueba de importación autorizada en Worknet.
-- No es "active" para no alterar el mecanismo de mapeos existente.
INSERT OR IGNORE INTO erp_csv_mappings(id, name, version, config, validated, active)
VALUES ('worknet-22-v1', 'Worknet 22 columnas', 1, '{"format":"worknet-22","delimiter":";","decimal":",","date":"DD/MM/AAAA","bom":false,"eol":"CRLF"}', 0, 0);
