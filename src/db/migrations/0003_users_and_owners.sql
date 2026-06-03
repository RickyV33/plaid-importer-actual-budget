CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE plaid_items ADD COLUMN owner_user_id INTEGER REFERENCES users(id);

CREATE INDEX idx_plaid_items_owner ON plaid_items(owner_user_id);

ALTER TABLE sync_runs ADD COLUMN owner_user_id INTEGER REFERENCES users(id);

CREATE INDEX idx_sync_runs_owner ON sync_runs(owner_user_id, started_at DESC);
