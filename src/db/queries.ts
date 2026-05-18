import { db } from "./client.js";

export type PlaidItemRow = {
  id: string;
  institution_id: string | null;
  institution_name: string | null;
  access_token_enc: string;
  cursor: string | null;
  status: "active" | "requires_relink" | "disabled" | "removed";
  last_synced_at: number | null;
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
};

export type SyncAccountResultRow = {
  id: number;
  sync_run_id: number;
  plaid_account_id: string;
  status: "success" | "failure" | "skipped";
  txns_imported: number;
  reason: string | null;
};

const now = () => Date.now();

export const plaidItems = {
  upsert(row: {
    id: string;
    institutionId: string | null;
    institutionName: string | null;
    accessTokenEnc: string;
  }): void {
    db()
      .prepare(
        `INSERT INTO plaid_items
           (id, institution_id, institution_name, access_token_enc, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)
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
        now(),
        now(),
      );
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

  listAll(): PlaidItemRow[] {
    return db()
      .prepare<[], PlaidItemRow>(
        "SELECT * FROM plaid_items WHERE status != 'removed' ORDER BY created_at ASC",
      )
      .all();
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

  getByPlaidId(plaidAccountId: string): PlaidAccountRow | undefined {
    return db()
      .prepare<[string], PlaidAccountRow>(
        "SELECT * FROM plaid_accounts WHERE plaid_account_id = ?",
      )
      .get(plaidAccountId);
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
  }): number {
    const info = db()
      .prepare(
        `INSERT INTO sync_runs
           (started_at, status, triggered_by, scope, total_imported)
         VALUES (?, 'running', ?, ?, 0)`,
      )
      .run(now(), args.triggeredBy, args.scope);
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
};

export const syncAccountResults = {
  record(row: {
    syncRunId: number;
    plaidAccountId: string;
    status: SyncAccountResultRow["status"];
    txnsImported: number;
    reason: string | null;
  }): void {
    db()
      .prepare(
        `INSERT INTO sync_account_results
           (sync_run_id, plaid_account_id, status, txns_imported, reason)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        row.syncRunId,
        row.plaidAccountId,
        row.status,
        row.txnsImported,
        row.reason,
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
