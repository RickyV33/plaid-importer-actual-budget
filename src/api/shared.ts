// Small pieces several page view models share.

import { schedules, type PlaidAccountRow, type PlaidItemRow } from "../db/queries.js";

export const DAY_MS = 86_400_000;

export type AccountView = {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  type: string | null;
  accessStatus: "active" | "deselected";
};

export function toAccountView(a: PlaidAccountRow): AccountView {
  return { plaidAccountId: a.plaid_account_id, name: a.name, mask: a.mask, type: a.type, accessStatus: a.access_status };
}

export function accountsForItem(all: PlaidAccountRow[], item: PlaidItemRow): PlaidAccountRow[] {
  return all.filter((a) => a.item_id === item.id);
}

/** The connection ids a schedule targets; a malformed row targets none. */
export function scheduleItemIds(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/** Per connection, the soonest next run among the owner's enabled schedules that target it. */
export function nextRunByItem(userId: number): Map<string, number> {
  const next = new Map<string, number>();
  for (const s of schedules.listByOwner(userId)) {
    if (s.enabled !== 1 || s.next_run_at === null) continue;
    for (const id of scheduleItemIds(s.plaid_item_ids)) {
      const prev = next.get(id);
      if (prev === undefined || s.next_run_at < prev) next.set(id, s.next_run_at);
    }
  }
  return next;
}
