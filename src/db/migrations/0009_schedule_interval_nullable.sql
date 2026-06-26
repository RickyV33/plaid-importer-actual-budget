-- Make interval_hours nullable. SQLite doesn't support ALTER COLUMN, so we
-- recreate the table with the constraint removed.
PRAGMA foreign_keys = OFF;

CREATE TABLE schedules_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  plaid_item_ids TEXT NOT NULL,
  interval_hours INTEGER,
  days_of_week  TEXT,
  time_of_day   TEXT,
  repeat_weeks  INTEGER,
  timezone      TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   INTEGER,
  next_run_at   INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

INSERT INTO schedules_new
  SELECT id, owner_user_id, plaid_item_ids, interval_hours,
         days_of_week, time_of_day, repeat_weeks, timezone,
         enabled, last_run_at, next_run_at, created_at, updated_at
  FROM schedules;

DROP TABLE schedules;
ALTER TABLE schedules_new RENAME TO schedules;

CREATE INDEX idx_schedules_due ON schedules(enabled, next_run_at);

PRAGMA foreign_keys = ON;
