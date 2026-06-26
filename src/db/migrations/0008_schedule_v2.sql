-- Add structured recurrence fields to schedules.
-- interval_hours is kept as a nullable legacy field for backwards compatibility.
-- TODO: remove interval_hours column in a future migration once all legacy rows are migrated.
ALTER TABLE schedules ADD COLUMN days_of_week TEXT;
ALTER TABLE schedules ADD COLUMN time_of_day  TEXT;
ALTER TABLE schedules ADD COLUMN repeat_weeks INTEGER;
ALTER TABLE schedules ADD COLUMN timezone     TEXT;

-- Make interval_hours nullable so new schedules can leave it unset.
-- SQLite does not support DROP COLUMN in older versions, so we leave the column in place.
-- New rows set interval_hours = NULL; legacy rows retain their existing value.

CREATE TABLE dismissed_banners (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banner_key  TEXT    NOT NULL,
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, banner_key)
);
