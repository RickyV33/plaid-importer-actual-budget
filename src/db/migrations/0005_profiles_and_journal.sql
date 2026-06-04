CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  server_password_enc TEXT NOT NULL,
  encryption_password_enc TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_profiles_owner ON profiles(owner_user_id);

CREATE TABLE profile_account_mappings (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL REFERENCES plaid_accounts(plaid_account_id) ON DELETE CASCADE,
  actual_account_id TEXT NOT NULL,
  actual_account_name TEXT NOT NULL,
  pending_visible INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, plaid_account_id)
);

CREATE INDEX idx_pam_plaid_account ON profile_account_mappings(plaid_account_id);

CREATE TABLE plaid_txn_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('added', 'modified', 'removed')),
  plaid_txn_id TEXT NOT NULL,
  payload_enc TEXT,
  pulled_at INTEGER NOT NULL
);

CREATE INDEX idx_txn_events_item ON plaid_txn_events(item_id, id);

CREATE TABLE profile_item_delivery (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  last_delivered_event_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, item_id)
);

-- Per-account sync results become per (profile, account) in the fan-out model.
ALTER TABLE sync_account_results ADD COLUMN profile_id INTEGER REFERENCES profiles(id);
