import { db } from "./client.js";

export type PlaidItemRow = {
  id: string;
  institution_id: string | null;
  institution_name: string | null;
  access_token_enc: string;
  cursor: string | null;
  status: "active" | "requires_relink" | "disabled" | "removed";
  last_synced_at: number | null;
  owner_user_id: number | null;
  created_at: number;
  updated_at: number;
};

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "member";
  created_at: number;
  updated_at: number;
};

export type PlaidAccountRow = {
  id: number;
  item_id: string;
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  created_at: number;
  updated_at: number;
};

export type AccountMappingRow = {
  plaid_account_id: string;
  actual_account_id: string;
  actual_account_name: string;
  pending_visible: number;
  created_at: number;
  updated_at: number;
};

export type SyncOrphanDeleteRow = {
  id: number;
  sync_run_id: number;
  plaid_account_id: string;
  plaid_transaction_id: string;
  payee_name: string | null;
  amount_cents: number | null;
  date: string | null;
  error_reason: string;
  created_at: number;
  acknowledged_at: number | null;
};

export type SyncRunRow = {
  id: number;
  started_at: number;
  finished_at: number | null;
  status: "running" | "success" | "failure";
  triggered_by: "manual" | "scheduled";
  scope: "all" | "selected";
  total_imported: number;
  owner_user_id: number | null;
};

export type SyncAccountResultRow = {
  id: number;
  sync_run_id: number;
  plaid_account_id: string;
  status: "success" | "failure" | "skipped";
  txns_imported: number;
  reason: string | null;
  profile_id: number | null;
};

const now = () => Date.now();

export const plaidItems = {
  upsert(row: {
    id: string;
    institutionId: string | null;
    institutionName: string | null;
    accessTokenEnc: string;
    ownerUserId: number;
  }): void {
    db()
      .prepare(
        `INSERT INTO plaid_items
           (id, institution_id, institution_name, access_token_enc, status, owner_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           institution_id = excluded.institution_id,
           institution_name = excluded.institution_name,
           access_token_enc = excluded.access_token_enc,
           status = 'active',
           updated_at = excluded.updated_at`,
      )
      .run(
        row.id,
        row.institutionId,
        row.institutionName,
        row.accessTokenEnc,
        row.ownerUserId,
        now(),
        now(),
      );
  },

  backfillOwner(ownerUserId: number): number {
    const info = db()
      .prepare(
        "UPDATE plaid_items SET owner_user_id = ?, updated_at = ? WHERE owner_user_id IS NULL",
      )
      .run(ownerUserId, now());
    return info.changes;
  },

  setCursor(id: string, cursor: string): void {
    db()
      .prepare(
        "UPDATE plaid_items SET cursor = ?, last_synced_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(cursor, now(), now(), id);
  },

  setStatus(id: string, status: PlaidItemRow["status"]): void {
    db()
      .prepare("UPDATE plaid_items SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now(), id);
  },

  get(id: string): PlaidItemRow | undefined {
    return db()
      .prepare<[string], PlaidItemRow>("SELECT * FROM plaid_items WHERE id = ?")
      .get(id);
  },

  getOwned(id: string, ownerUserId: number): PlaidItemRow | undefined {
    return db()
      .prepare<[string, number], PlaidItemRow>(
        "SELECT * FROM plaid_items WHERE id = ? AND owner_user_id = ?",
      )
      .get(id, ownerUserId);
  },

  listAll(): PlaidItemRow[] {
    return db()
      .prepare<[], PlaidItemRow>(
        "SELECT * FROM plaid_items WHERE status != 'removed' ORDER BY created_at ASC",
      )
      .all();
  },

  listByOwner(ownerUserId: number): PlaidItemRow[] {
    return db()
      .prepare<[number], PlaidItemRow>(
        "SELECT * FROM plaid_items WHERE status != 'removed' AND owner_user_id = ? ORDER BY created_at ASC",
      )
      .all(ownerUserId);
  },
};

export const plaidAccounts = {
  upsert(row: {
    itemId: string;
    plaidAccountId: string;
    name: string;
    officialName: string | null;
    mask: string | null;
    type: string | null;
    subtype: string | null;
  }): void {
    db()
      .prepare(
        `INSERT INTO plaid_accounts
           (item_id, plaid_account_id, name, official_name, mask, type, subtype, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(plaid_account_id) DO UPDATE SET
           item_id = excluded.item_id,
           name = excluded.name,
           official_name = excluded.official_name,
           mask = excluded.mask,
           type = excluded.type,
           subtype = excluded.subtype,
           updated_at = excluded.updated_at`,
      )
      .run(
        row.itemId,
        row.plaidAccountId,
        row.name,
        row.officialName,
        row.mask,
        row.type,
        row.subtype,
        now(),
        now(),
      );
  },

  listByItem(itemId: string): PlaidAccountRow[] {
    return db()
      .prepare<[string], PlaidAccountRow>(
        "SELECT * FROM plaid_accounts WHERE item_id = ? ORDER BY name",
      )
      .all(itemId);
  },

  listAll(): PlaidAccountRow[] {
    return db()
      .prepare<[], PlaidAccountRow>("SELECT * FROM plaid_accounts ORDER BY name")
      .all();
  },

  listByOwner(ownerUserId: number): PlaidAccountRow[] {
    return db()
      .prepare<[number], PlaidAccountRow>(
        `SELECT a.* FROM plaid_accounts a
           JOIN plaid_items i ON i.id = a.item_id
         WHERE i.owner_user_id = ?
         ORDER BY a.name`,
      )
      .all(ownerUserId);
  },

  getByPlaidId(plaidAccountId: string): PlaidAccountRow | undefined {
    return db()
      .prepare<[string], PlaidAccountRow>(
        "SELECT * FROM plaid_accounts WHERE plaid_account_id = ?",
      )
      .get(plaidAccountId);
  },

  getByPlaidIdOwned(
    plaidAccountId: string,
    ownerUserId: number,
  ): PlaidAccountRow | undefined {
    return db()
      .prepare<[string, number], PlaidAccountRow>(
        `SELECT a.* FROM plaid_accounts a
           JOIN plaid_items i ON i.id = a.item_id
         WHERE a.plaid_account_id = ? AND i.owner_user_id = ?`,
      )
      .get(plaidAccountId, ownerUserId);
  },
};

export const accountMappings = {
  upsert(row: {
    plaidAccountId: string;
    actualAccountId: string;
    actualAccountName: string;
  }): void {
    db()
      .prepare(
        `INSERT INTO account_mappings
           (plaid_account_id, actual_account_id, actual_account_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(plaid_account_id) DO UPDATE SET
           actual_account_id = excluded.actual_account_id,
           actual_account_name = excluded.actual_account_name,
           updated_at = excluded.updated_at`,
      )
      .run(
        row.plaidAccountId,
        row.actualAccountId,
        row.actualAccountName,
        now(),
        now(),
      );
  },

  setPendingVisible(plaidAccountId: string, value: boolean): number {
    const info = db()
      .prepare(
        "UPDATE account_mappings SET pending_visible = ?, updated_at = ? WHERE plaid_account_id = ?",
      )
      .run(value ? 1 : 0, now(), plaidAccountId);
    return info.changes;
  },

  remove(plaidAccountId: string): void {
    db()
      .prepare("DELETE FROM account_mappings WHERE plaid_account_id = ?")
      .run(plaidAccountId);
  },

  getByPlaidId(plaidAccountId: string): AccountMappingRow | undefined {
    return db()
      .prepare<[string], AccountMappingRow>(
        "SELECT * FROM account_mappings WHERE plaid_account_id = ?",
      )
      .get(plaidAccountId);
  },

  listAll(): AccountMappingRow[] {
    return db()
      .prepare<[], AccountMappingRow>("SELECT * FROM account_mappings")
      .all();
  },

  listByOwner(ownerUserId: number): AccountMappingRow[] {
    return db()
      .prepare<[number], AccountMappingRow>(
        `SELECT m.* FROM account_mappings m
           JOIN plaid_accounts a ON a.plaid_account_id = m.plaid_account_id
           JOIN plaid_items i ON i.id = a.item_id
         WHERE i.owner_user_id = ?`,
      )
      .all(ownerUserId);
  },
};

export const syncOrphanDeletes = {
  insert(row: {
    syncRunId: number;
    plaidAccountId: string;
    plaidTransactionId: string;
    payeeName: string | null;
    amountCents: number | null;
    date: string | null;
    errorReason: string;
  }): number {
    const info = db()
      .prepare(
        `INSERT INTO sync_orphan_deletes
           (sync_run_id, plaid_account_id, plaid_transaction_id,
            payee_name, amount_cents, date, error_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.syncRunId,
        row.plaidAccountId,
        row.plaidTransactionId,
        row.payeeName,
        row.amountCents,
        row.date,
        row.errorReason,
        now(),
      );
    return Number(info.lastInsertRowid);
  },

  listUnacknowledged(): SyncOrphanDeleteRow[] {
    return db()
      .prepare<[], SyncOrphanDeleteRow>(
        "SELECT * FROM sync_orphan_deletes WHERE acknowledged_at IS NULL ORDER BY created_at DESC",
      )
      .all();
  },

  getById(id: number): SyncOrphanDeleteRow | undefined {
    return db()
      .prepare<[number], SyncOrphanDeleteRow>(
        "SELECT * FROM sync_orphan_deletes WHERE id = ?",
      )
      .get(id);
  },

  ack(id: number): number {
    const info = db()
      .prepare(
        "UPDATE sync_orphan_deletes SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL",
      )
      .run(now(), id);
    return info.changes;
  },

  countUnacknowledged(): number {
    const row = db()
      .prepare<[], { c: number }>(
        "SELECT COUNT(*) AS c FROM sync_orphan_deletes WHERE acknowledged_at IS NULL",
      )
      .get();
    return row?.c ?? 0;
  },
};

export const syncRuns = {
  start(args: {
    triggeredBy: SyncRunRow["triggered_by"];
    scope: SyncRunRow["scope"];
    ownerUserId: number;
  }): number {
    const info = db()
      .prepare(
        `INSERT INTO sync_runs
           (started_at, status, triggered_by, scope, total_imported, owner_user_id)
         VALUES (?, 'running', ?, ?, 0, ?)`,
      )
      .run(now(), args.triggeredBy, args.scope, args.ownerUserId);
    return Number(info.lastInsertRowid);
  },

  finish(args: {
    id: number;
    status: "success" | "failure";
    totalImported: number;
  }): void {
    db()
      .prepare(
        "UPDATE sync_runs SET finished_at = ?, status = ?, total_imported = ? WHERE id = ?",
      )
      .run(now(), args.status, args.totalImported, args.id);
  },

  get(id: number): SyncRunRow | undefined {
    return db()
      .prepare<[number], SyncRunRow>("SELECT * FROM sync_runs WHERE id = ?")
      .get(id);
  },

  listRecent(limit: number, offset: number): SyncRunRow[] {
    return db()
      .prepare<[number, number], SyncRunRow>(
        "SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ? OFFSET ?",
      )
      .all(limit, offset);
  },

  listRecentByOwner(ownerUserId: number, limit: number, offset: number): SyncRunRow[] {
    return db()
      .prepare<[number, number, number], SyncRunRow>(
        "SELECT * FROM sync_runs WHERE owner_user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?",
      )
      .all(ownerUserId, limit, offset);
  },

  // Number of distinct runs since `sinceTs` that pulled the given connection
  // (touched at least one of its accounts). Used by the per-connection ceiling.
  countPullsForItemSince(itemId: string, sinceTs: number): number {
    const row = db()
      .prepare<[string, number], { c: number }>(
        `SELECT COUNT(DISTINCT sr.id) AS c
           FROM sync_runs sr
           JOIN sync_account_results sar ON sar.sync_run_id = sr.id
           JOIN plaid_accounts pa ON pa.plaid_account_id = sar.plaid_account_id
         WHERE pa.item_id = ? AND sr.started_at >= ?`,
      )
      .get(itemId, sinceTs);
    return row?.c ?? 0;
  },

  oldestPullForItemSince(itemId: string, sinceTs: number): number | null {
    const row = db()
      .prepare<[string, number], { m: number | null }>(
        `SELECT MIN(sr.started_at) AS m
           FROM sync_runs sr
           JOIN sync_account_results sar ON sar.sync_run_id = sr.id
           JOIN plaid_accounts pa ON pa.plaid_account_id = sar.plaid_account_id
         WHERE pa.item_id = ? AND sr.started_at >= ?`,
      )
      .get(itemId, sinceTs);
    return row?.m ?? null;
  },

  backfillOwner(ownerUserId: number): number {
    const info = db()
      .prepare("UPDATE sync_runs SET owner_user_id = ? WHERE owner_user_id IS NULL")
      .run(ownerUserId);
    return info.changes;
  },
};

export const syncAccountResults = {
  record(row: {
    syncRunId: number;
    plaidAccountId: string;
    status: SyncAccountResultRow["status"];
    txnsImported: number;
    reason: string | null;
    profileId?: number | null;
  }): void {
    db()
      .prepare(
        `INSERT INTO sync_account_results
           (sync_run_id, plaid_account_id, status, txns_imported, reason, profile_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.syncRunId,
        row.plaidAccountId,
        row.status,
        row.txnsImported,
        row.reason,
        row.profileId ?? null,
      );
  },

  listForRun(syncRunId: number): SyncAccountResultRow[] {
    return db()
      .prepare<[number], SyncAccountResultRow>(
        "SELECT * FROM sync_account_results WHERE sync_run_id = ? ORDER BY id ASC",
      )
      .all(syncRunId);
  },
};

export const users = {
  create(row: {
    username: string;
    passwordHash: string;
    role: UserRow["role"];
  }): number {
    const info = db()
      .prepare(
        `INSERT INTO users (username, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(row.username, row.passwordHash, row.role, now(), now());
    return Number(info.lastInsertRowid);
  },

  getByUsername(username: string): UserRow | undefined {
    return db()
      .prepare<[string], UserRow>("SELECT * FROM users WHERE username = ?")
      .get(username);
  },

  getById(id: number): UserRow | undefined {
    return db()
      .prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?")
      .get(id);
  },

  count(): number {
    const row = db()
      .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM users")
      .get();
    return row?.c ?? 0;
  },

  firstAdmin(): UserRow | undefined {
    return db()
      .prepare<[], UserRow>(
        "SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1",
      )
      .get();
  },
};

export const settings = {
  get(key: string): string | undefined {
    const row = db()
      .prepare<[string], { value: string }>(
        "SELECT value FROM settings WHERE key = ?",
      )
      .get(key);
    return row?.value;
  },

  set(key: string, value: string): void {
    db()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, now());
  },
};

export const REGISTRATION_SECRET_KEY = "registration_secret";
export const SYNC_RATELIMIT_MAX_KEY = "sync_ratelimit_max";
export const SYNC_RATELIMIT_WINDOW_HOURS_KEY = "sync_ratelimit_window_hours";

export type ProfileRow = {
  id: number;
  owner_user_id: number;
  name: string;
  server_url: string;
  budget_id: string;
  server_password_enc: string;
  encryption_password_enc: string | null;
  created_at: number;
  updated_at: number;
};

export type ProfileAccountMappingRow = {
  profile_id: number;
  plaid_account_id: string;
  actual_account_id: string;
  actual_account_name: string;
  pending_visible: number;
  created_at: number;
  updated_at: number;
};

export type PlaidTxnEventRow = {
  id: number;
  item_id: string;
  plaid_account_id: string;
  event_type: "added" | "modified" | "removed";
  plaid_txn_id: string;
  payload_enc: string | null;
  pulled_at: number;
};

export const profiles = {
  create(row: {
    ownerUserId: number;
    name: string;
    serverUrl: string;
    budgetId: string;
    serverPasswordEnc: string;
    encryptionPasswordEnc: string | null;
  }): number {
    const info = db()
      .prepare(
        `INSERT INTO profiles
           (owner_user_id, name, server_url, budget_id, server_password_enc, encryption_password_enc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.ownerUserId,
        row.name,
        row.serverUrl,
        row.budgetId,
        row.serverPasswordEnc,
        row.encryptionPasswordEnc,
        now(),
        now(),
      );
    return Number(info.lastInsertRowid);
  },

  update(
    id: number,
    row: {
      name: string;
      serverUrl: string;
      budgetId: string;
      serverPasswordEnc?: string | undefined; // omit to keep existing
      encryptionPasswordEnc?: string | null | undefined; // omit to keep existing
    },
  ): void {
    // Build a dynamic SET so blank secret fields keep the existing values.
    const sets = ["name = ?", "server_url = ?", "budget_id = ?", "updated_at = ?"];
    const args: unknown[] = [row.name, row.serverUrl, row.budgetId, now()];
    if (row.serverPasswordEnc !== undefined) {
      sets.push("server_password_enc = ?");
      args.push(row.serverPasswordEnc);
    }
    if (row.encryptionPasswordEnc !== undefined) {
      sets.push("encryption_password_enc = ?");
      args.push(row.encryptionPasswordEnc);
    }
    args.push(id);
    db().prepare(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`).run(...args);
  },

  get(id: number): ProfileRow | undefined {
    return db().prepare<[number], ProfileRow>("SELECT * FROM profiles WHERE id = ?").get(id);
  },

  getOwned(id: number, ownerUserId: number): ProfileRow | undefined {
    return db()
      .prepare<[number, number], ProfileRow>(
        "SELECT * FROM profiles WHERE id = ? AND owner_user_id = ?",
      )
      .get(id, ownerUserId);
  },

  listByOwner(ownerUserId: number): ProfileRow[] {
    return db()
      .prepare<[number], ProfileRow>(
        "SELECT * FROM profiles WHERE owner_user_id = ? ORDER BY name",
      )
      .all(ownerUserId);
  },

  // Another profile owned by the same user pointing at the same budget, if any.
  findByOwnerServerBudget(
    ownerUserId: number,
    serverUrl: string,
    budgetId: string,
  ): ProfileRow | undefined {
    return db()
      .prepare<[number, string, string], ProfileRow>(
        "SELECT * FROM profiles WHERE owner_user_id = ? AND server_url = ? AND budget_id = ?",
      )
      .get(ownerUserId, serverUrl, budgetId);
  },

  remove(id: number): void {
    db().prepare("DELETE FROM profiles WHERE id = ?").run(id);
  },

  count(): number {
    const row = db().prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM profiles").get();
    return row?.c ?? 0;
  },

  // Profiles that have at least one mapped account belonging to the given item.
  listConnectedToItem(itemId: string): ProfileRow[] {
    return db()
      .prepare<[string], ProfileRow>(
        `SELECT DISTINCT p.* FROM profiles p
           JOIN profile_account_mappings pam ON pam.profile_id = p.id
           JOIN plaid_accounts a ON a.plaid_account_id = pam.plaid_account_id
         WHERE a.item_id = ?
         ORDER BY p.id`,
      )
      .all(itemId);
  },
};

export const profileAccountMappings = {
  upsert(row: {
    profileId: number;
    plaidAccountId: string;
    actualAccountId: string;
    actualAccountName: string;
  }): void {
    db()
      .prepare(
        `INSERT INTO profile_account_mappings
           (profile_id, plaid_account_id, actual_account_id, actual_account_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, plaid_account_id) DO UPDATE SET
           actual_account_id = excluded.actual_account_id,
           actual_account_name = excluded.actual_account_name,
           updated_at = excluded.updated_at`,
      )
      .run(row.profileId, row.plaidAccountId, row.actualAccountId, row.actualAccountName, now(), now());
  },

  setPendingVisible(profileId: number, plaidAccountId: string, value: boolean): number {
    const info = db()
      .prepare(
        "UPDATE profile_account_mappings SET pending_visible = ?, updated_at = ? WHERE profile_id = ? AND plaid_account_id = ?",
      )
      .run(value ? 1 : 0, now(), profileId, plaidAccountId);
    return info.changes;
  },

  remove(profileId: number, plaidAccountId: string): void {
    db()
      .prepare(
        "DELETE FROM profile_account_mappings WHERE profile_id = ? AND plaid_account_id = ?",
      )
      .run(profileId, plaidAccountId);
  },

  get(profileId: number, plaidAccountId: string): ProfileAccountMappingRow | undefined {
    return db()
      .prepare<[number, string], ProfileAccountMappingRow>(
        "SELECT * FROM profile_account_mappings WHERE profile_id = ? AND plaid_account_id = ?",
      )
      .get(profileId, plaidAccountId);
  },

  listByProfile(profileId: number): ProfileAccountMappingRow[] {
    return db()
      .prepare<[number], ProfileAccountMappingRow>(
        "SELECT * FROM profile_account_mappings WHERE profile_id = ?",
      )
      .all(profileId);
  },

  listByPlaidAccount(plaidAccountId: string): ProfileAccountMappingRow[] {
    return db()
      .prepare<[string], ProfileAccountMappingRow>(
        "SELECT * FROM profile_account_mappings WHERE plaid_account_id = ?",
      )
      .all(plaidAccountId);
  },

  // Mappings for a profile, restricted to accounts belonging to the given item.
  listForProfileAndItem(profileId: number, itemId: string): ProfileAccountMappingRow[] {
    return db()
      .prepare<[number, string], ProfileAccountMappingRow>(
        `SELECT pam.* FROM profile_account_mappings pam
           JOIN plaid_accounts a ON a.plaid_account_id = pam.plaid_account_id
         WHERE pam.profile_id = ? AND a.item_id = ?`,
      )
      .all(profileId, itemId);
  },
};

export const plaidTxnEvents = {
  // Append a pulled delta and advance the item cursor atomically.
  appendDeltaAndAdvanceCursor(args: {
    itemId: string;
    events: Array<{
      plaidAccountId: string;
      eventType: PlaidTxnEventRow["event_type"];
      plaidTxnId: string;
      payloadEnc: string | null;
    }>;
    nextCursor: string;
  }): void {
    const conn = db();
    const insert = conn.prepare(
      `INSERT INTO plaid_txn_events
         (item_id, plaid_account_id, event_type, plaid_txn_id, payload_enc, pulled_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const tx = conn.transaction(() => {
      const ts = now();
      for (const e of args.events) {
        insert.run(args.itemId, e.plaidAccountId, e.eventType, e.plaidTxnId, e.payloadEnc, ts);
      }
      conn
        .prepare(
          "UPDATE plaid_items SET cursor = ?, last_synced_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(args.nextCursor, ts, ts, args.itemId);
    });
    tx();
  },

  listForItemSince(itemId: string, sinceEventId: number): PlaidTxnEventRow[] {
    return db()
      .prepare<[string, number], PlaidTxnEventRow>(
        "SELECT * FROM plaid_txn_events WHERE item_id = ? AND id > ? ORDER BY id ASC",
      )
      .all(itemId, sinceEventId);
  },

  maxEventIdForItem(itemId: string): number {
    const row = db()
      .prepare<[string], { m: number | null }>(
        "SELECT MAX(id) AS m FROM plaid_txn_events WHERE item_id = ?",
      )
      .get(itemId);
    return row?.m ?? 0;
  },

  // Delete events at or below the given id for an item (prune delivered).
  pruneForItem(itemId: string, maxDeliveredId: number): number {
    const info = db()
      .prepare("DELETE FROM plaid_txn_events WHERE item_id = ? AND id <= ?")
      .run(itemId, maxDeliveredId);
    return info.changes;
  },
};

export type ScheduleRow = {
  id: number;
  owner_user_id: number;
  profile_id: number;
  plaid_account_ids: string; // JSON array of plaid_account_id
  interval_hours: number;
  enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
};

export const schedules = {
  create(row: {
    ownerUserId: number;
    profileId: number;
    plaidAccountIds: string[];
    intervalHours: number;
    nextRunAt: number;
  }): number {
    const info = db()
      .prepare(
        `INSERT INTO schedules
           (owner_user_id, profile_id, plaid_account_ids, interval_hours, enabled, next_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        row.ownerUserId,
        row.profileId,
        JSON.stringify(row.plaidAccountIds),
        row.intervalHours,
        row.nextRunAt,
        now(),
        now(),
      );
    return Number(info.lastInsertRowid);
  },

  setEnabled(id: number, enabled: boolean): void {
    db()
      .prepare("UPDATE schedules SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, now(), id);
  },

  markRan(id: number, lastRunAt: number, nextRunAt: number): void {
    db()
      .prepare("UPDATE schedules SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?")
      .run(lastRunAt, nextRunAt, now(), id);
  },

  remove(id: number): void {
    db().prepare("DELETE FROM schedules WHERE id = ?").run(id);
  },

  getOwned(id: number, ownerUserId: number): ScheduleRow | undefined {
    return db()
      .prepare<[number, number], ScheduleRow>(
        "SELECT * FROM schedules WHERE id = ? AND owner_user_id = ?",
      )
      .get(id, ownerUserId);
  },

  listByOwner(ownerUserId: number): ScheduleRow[] {
    return db()
      .prepare<[number], ScheduleRow>(
        "SELECT * FROM schedules WHERE owner_user_id = ? ORDER BY id DESC",
      )
      .all(ownerUserId);
  },

  listDue(nowTs: number): ScheduleRow[] {
    return db()
      .prepare<[number], ScheduleRow>(
        "SELECT * FROM schedules WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY next_run_at ASC",
      )
      .all(nowTs);
  },
};

export const profileItemDelivery = {
  getWatermark(profileId: number, itemId: string): number {
    const row = db()
      .prepare<[number, string], { last_delivered_event_id: number }>(
        "SELECT last_delivered_event_id FROM profile_item_delivery WHERE profile_id = ? AND item_id = ?",
      )
      .get(profileId, itemId);
    return row?.last_delivered_event_id ?? 0;
  },

  // Create a delivery row at the given starting watermark if none exists.
  ensure(profileId: number, itemId: string, startAt: number): void {
    db()
      .prepare(
        `INSERT INTO profile_item_delivery (profile_id, item_id, last_delivered_event_id)
         VALUES (?, ?, ?)
         ON CONFLICT(profile_id, item_id) DO NOTHING`,
      )
      .run(profileId, itemId, startAt);
  },

  setWatermark(profileId: number, itemId: string, lastDeliveredEventId: number): void {
    db()
      .prepare(
        `INSERT INTO profile_item_delivery (profile_id, item_id, last_delivered_event_id)
         VALUES (?, ?, ?)
         ON CONFLICT(profile_id, item_id) DO UPDATE SET last_delivered_event_id = excluded.last_delivered_event_id`,
      )
      .run(profileId, itemId, lastDeliveredEventId);
  },

  deleteForProfileItem(profileId: number, itemId: string): void {
    db()
      .prepare("DELETE FROM profile_item_delivery WHERE profile_id = ? AND item_id = ?")
      .run(profileId, itemId);
  },

  // Minimum delivered watermark across active (connected) profiles for an item.
  // Returns null when no profile is connected (caller may prune everything).
  minDeliveredForItem(itemId: string): number | null {
    const row = db()
      .prepare<[string], { m: number | null; c: number }>(
        "SELECT MIN(last_delivered_event_id) AS m, COUNT(*) AS c FROM profile_item_delivery WHERE item_id = ?",
      )
      .get(itemId);
    if (!row || row.c === 0) return null;
    return row.m ?? 0;
  },
};
