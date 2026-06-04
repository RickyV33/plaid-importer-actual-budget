import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// NOTE: the scheduler's tick() imports runSync, which transitively loads the
// Plaid SDK — and that breaks under the tsx/esm + node:test loader (same .json
// issue that blocks Fastify-level tests). So we cover the scheduling *logic*
// (due selection, enable/disable, advance, and that a run can be recorded as
// "scheduled") at the DB level here; the live tick path is verified manually.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-sched-test-"));

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.ACTUAL_SERVER_URL ??= "https://budget.example.com";
process.env.ACTUAL_SERVER_PASSWORD ??= "pw";
process.env.ACTUAL_SYNC_ID ??= "sync-1";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.ACTUAL_CACHE_DIR = path.join(tmpDir, "actual-cache");

const { runMigrations } = await import("../db/migrate.js");
const { users, schedules, syncRuns } = await import("../db/queries.js");

runMigrations();
const adminId = users.create({ username: "admin", passwordHash: "x", role: "admin" });

test("listDue selects past-due enabled schedules, excludes future and disabled", () => {
  const due = schedules.create({ ownerUserId: adminId, plaidItemIds: ["item-a"], intervalHours: 24, nextRunAt: Date.now() - 1000 });
  const future = schedules.create({ ownerUserId: adminId, plaidItemIds: ["item-a"], intervalHours: 24, nextRunAt: Date.now() + 3600_000 });

  const dueIds = schedules.listDue(Date.now()).map((s) => s.id);
  assert.ok(dueIds.includes(due));
  assert.ok(!dueIds.includes(future));

  schedules.setEnabled(due, false);
  assert.ok(!schedules.listDue(Date.now()).map((s) => s.id).includes(due), "disabled excluded");
});

test("markRan advances next_run_at and records last_run_at", () => {
  const id = schedules.create({ ownerUserId: adminId, plaidItemIds: ["item-a"], intervalHours: 6, nextRunAt: Date.now() - 1000 });
  const now = Date.now();
  schedules.markRan(id, now, now + 6 * 3600_000);
  const s = schedules.getOwned(id, adminId)!;
  assert.equal(s.last_run_at, now);
  assert.ok(s.next_run_at! > now);
  assert.ok(!schedules.listDue(now).map((x) => x.id).includes(id), "no longer due after advancing");
});

test("a run started with triggeredBy=scheduled is recorded as scheduled", () => {
  const runId = syncRuns.start({ triggeredBy: "scheduled", scope: "selected", ownerUserId: adminId });
  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });
  assert.equal(syncRuns.get(runId)?.triggered_by, "scheduled");
});

test("schedules are owner-scoped", () => {
  const other = users.create({ username: "other", passwordHash: "x", role: "member" });
  const id = schedules.create({ ownerUserId: adminId, plaidItemIds: ["item-a"], intervalHours: 24, nextRunAt: Date.now() });
  assert.ok(schedules.getOwned(id, adminId));
  assert.equal(schedules.getOwned(id, other), undefined);
});
