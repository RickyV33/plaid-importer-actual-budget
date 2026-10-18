// How many syncable bank accounts are routed to an Actual account.

export type Coverage = { routed: number; total: number };

/**
 * Deselected accounts can't sync, so they count in neither figure. `mapped` is
 * the set of Plaid account ids that have a mapping (in one profile, or in any).
 */
export function coverage(
  accounts: { plaid_account_id: string; access_status: string }[],
  mapped: ReadonlySet<string>,
): Coverage {
  const syncable = accounts.filter((a) => a.access_status !== "deselected");
  return { routed: syncable.filter((a) => mapped.has(a.plaid_account_id)).length, total: syncable.length };
}
