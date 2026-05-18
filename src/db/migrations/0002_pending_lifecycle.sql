ALTER TABLE account_mappings
  ADD COLUMN pending_visible INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sync_orphan_deletes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL,
  plaid_transaction_id TEXT NOT NULL,
  payee_name TEXT,
  amount_cents INTEGER,
  date TEXT,
  error_reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  acknowledged_at INTEGER
);

CREATE INDEX idx_orphan_unack
  ON sync_orphan_deletes(acknowledged_at)
  WHERE acknowledged_at IS NULL;
