-- Backfill owner_user_id for sync runs that predate multi-user-auth.
-- 0003 added the column as NULL for existing rows; the boot seed claimed
-- plaid_items but not sync_runs, leaving historical runs invisible to the
-- owner-scoped history view. On a pre-multi-user instance all history belonged
-- to the single user, so assign orphaned runs to the first admin.
UPDATE sync_runs
SET owner_user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1)
WHERE owner_user_id IS NULL
  AND (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1) IS NOT NULL;
