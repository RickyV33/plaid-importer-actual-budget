-- Optional, owner-supplied display name for a schedule.
-- Nullable: a blank/absent name falls back to the joined connection names in the UI.
ALTER TABLE schedules ADD COLUMN name TEXT;
