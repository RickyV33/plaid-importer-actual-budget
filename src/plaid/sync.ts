import type { RemovedTransaction, Transaction } from "plaid";

import { plaid } from "./client.js";

export type ItemDelta = {
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
};

export async function syncItem(args: {
  accessToken: string;
  cursor: string | null;
}): Promise<ItemDelta> {
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];

  let cursor: string | undefined = args.cursor ?? undefined;
  let hasMore = true;

  while (hasMore) {
    const res = await plaid.transactionsSync({
      access_token: args.accessToken,
      ...(cursor !== undefined ? { cursor } : {}),
    });

    added.push(...res.data.added);
    modified.push(...res.data.modified);
    removed.push(...res.data.removed);

    cursor = res.data.next_cursor;
    hasMore = res.data.has_more;
  }

  return { added, modified, removed, nextCursor: cursor ?? "" };
}

export class PlaidItemLoginRequiredError extends Error {
  constructor() {
    super("ITEM_LOGIN_REQUIRED");
    this.name = "PlaidItemLoginRequiredError";
  }
}

export function classifyPlaidError(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const resp = (err as { response?: { data?: { error_code?: string } } }).response;
    return resp?.data?.error_code ?? "unknown";
  }
  return "unknown";
}
