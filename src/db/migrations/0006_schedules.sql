CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plaid_account_ids TEXT NOT NULL,
  interval_hours INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_schedules_due ON schedules(enabled, next_run_at);
