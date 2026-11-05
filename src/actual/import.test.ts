import { test } from "node:test";
import assert from "node:assert/strict";
import type { Transaction } from "plaid";
import type { ActualApi } from "./client.js";
import { importBatch } from "./import.js";

const txns = [{ transaction_id: "t1", amount: 1.23, date: "2026-10-30", name: "Test", pending: false },
  { transaction_id: "t2", amount: 2.34, date: "2026-10-30", name: "Test 2", pending: false }] as Transaction[];

test("partial success fails delivery and retry preserves deduplication identifiers", async () => {
  const seen = new Map<string, string>();
  let attempt = 0;
  const api = { importTransactions: async (_account: string, mapped: Array<{ imported_id: string }>) => {
    attempt++;
    const added: string[] = [];
    for (const txn of mapped) {
      if (attempt === 1 && txn.imported_id === "t2") continue;
      if (!seen.has(txn.imported_id)) { seen.set(txn.imported_id, txn.imported_id); added.push(txn.imported_id); }
    }
    return { added, updated: [], errors: attempt === 1 ? [{ sensitive: "do not log" }] : [] };
  } } as unknown as ActualApi;
  await assert.rejects(importBatch(api, "a1", txns), /1 transaction.*retained for retry/);
  assert.equal(seen.size, 1);
  assert.deepEqual((await importBatch(api, "a1", txns)).added, ["t2"]);
  assert.equal(seen.size, 2);
  assert.deepEqual((await importBatch(api, "a1", txns)).added, []);
});

test("malformed outcomes fail closed", async () => {
  const api = { importTransactions: async () => ({ added: [], updated: [] }) } as unknown as ActualApi;
  await assert.rejects(importBatch(api, "a1", txns), /invalid import outcome/);
});
