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
  return result;
}
