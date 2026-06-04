-- Schedules now target connections (Plaid items), not accounts: Plaid bills per
-- item, and a pull fans out to every profile mapping the connection's accounts,
-- so a per-profile/per-account schedule was the wrong unit. Recreate the table
-- (the feature is unreleased, so there is no production data to preserve).
DROP TABLE IF EXISTS schedules;

CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  plaid_item_ids TEXT NOT NULL,
  interval_hours INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_schedules_due ON schedules(enabled, next_run_at);
