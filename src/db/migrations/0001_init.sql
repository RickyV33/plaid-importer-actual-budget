CREATE TABLE plaid_items (
  id TEXT PRIMARY KEY,
  institution_id TEXT,
  institution_name TEXT,
  access_token_enc TEXT NOT NULL,
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE plaid_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  official_name TEXT,
  mask TEXT,
  type TEXT,
  subtype TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_plaid_accounts_item ON plaid_accounts(item_id);

CREATE TABLE account_mappings (
  plaid_account_id TEXT PRIMARY KEY REFERENCES plaid_accounts(plaid_account_id) ON DELETE CASCADE,
  actual_account_id TEXT NOT NULL,
  actual_account_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  scope TEXT NOT NULL,
  total_imported INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sync_runs_started ON sync_runs(started_at DESC);

CREATE TABLE sync_account_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  txns_imported INTEGER NOT NULL DEFAULT 0,
  reason TEXT
);

CREATE INDEX idx_sync_account_results_run ON sync_account_results(sync_run_id);
