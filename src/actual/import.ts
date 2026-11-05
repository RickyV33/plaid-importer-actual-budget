import type { Transaction as PlaidTxn } from "plaid";

import type { ActualApi } from "./client.js";

export type ActualTransaction = {
  account: string;
  date: string;
  amount: number;
  payee_name: string;
  imported_payee: string;
  imported_id: string;
  cleared: boolean;
  notes?: string;
};

export function mapTransaction(
  plaidTxn: PlaidTxn,
  actualAccountId: string,
): ActualTransaction {
  const payee = plaidTxn.merchant_name ?? plaidTxn.name ?? "Unknown";
  const amountCents = Math.round(plaidTxn.amount * 100) * -1;

  return {
    account: actualAccountId,
    date: plaidTxn.date,
    amount: amountCents,
    payee_name: payee,
    imported_payee: payee,
    imported_id: plaidTxn.transaction_id,
    cleared: !plaidTxn.pending,
  };
}

export type ImportOutcome = {
  errors: unknown[];
  added: string[];
  updated: string[];
};

export async function importBatch(
  api: ActualApi,
  actualAccountId: string,
  plaidTxns: PlaidTxn[],
): Promise<ImportOutcome> {
  if (plaidTxns.length === 0) {
    return { errors: [], added: [], updated: [] };
  }
  const mapped = plaidTxns.map((t) => mapTransaction(t, actualAccountId));
  const result = (await api.importTransactions(actualAccountId, mapped)) as ImportOutcome;
  // A normal API return can still contain per-transaction failures. Throw so
  // the sync engine retains the journal and does not advance the item watermark.
  // Retrying uses the same imported_id values, allowing Actual to deduplicate.
  if (!result || !Array.isArray(result.errors) || !Array.isArray(result.added) || !Array.isArray(result.updated)) {
    throw new Error("Actual returned an invalid import outcome");
  }
  if (result.errors.length > 0) {
    // Do not include raw errors: they may contain transaction data or secrets.
    throw new Error(`Actual import failed for ${result.errors.length} transaction(s); delivery retained for retry`);
  }
  return result;
}
