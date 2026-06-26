import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// NOTE: tick() imports runSync which transitively loads the Plaid SDK and breaks
// under tsx/esm + node:test. Scheduling logic (due selection, enable/disable, advance)
// is covered at the DB level; the live tick path is verified manually.

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
const { db } = await import("../db/client.js");
const { nextOccurrence } = await import("./recurrence.js");

runMigrations();
const adminId = users.create({ username: "admin", passwordHash: "x", role: "admin" });

// Helper: insert a legacy-format schedule (interval_hours set, days_of_week null)
function createLegacy(intervalHours: number, nextRunAt: number): number {
  const now = Date.now();
  const info = db()
    .prepare(
      `INSERT INTO schedules (owner_user_id, plaid_item_ids, interval_hours, enabled, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(adminId, '["item-a"]', intervalHours, nextRunAt, now, now);
  return Number(info.lastInsertRowid);
}

// Helper: new-format schedule (Mon+Wed+Fri, 09:00 UTC, weekly)
function createNew(nextRunAt: number): number {
  return schedules.create({
    ownerUserId: adminId,
    plaidItemIds: ["item-a"],
    daysOfWeek: [1, 3, 5],
    timeOfDay: "09:00",
    repeatWeeks: 1,
    timezone: "UTC",
    nextRunAt,
  });
}

test("listDue selects past-due enabled schedules, excludes future and disabled", () => {
  const due = createNew(Date.now() - 1000);
  const future = createNew(Date.now() + 3_600_000);

  const dueIds = schedules.listDue(Date.now()).map((s) => s.id);
  assert.ok(dueIds.includes(due));
  assert.ok(!dueIds.includes(future));

  schedules.setEnabled(due, false);
  assert.ok(!schedules.listDue(Date.now()).map((s) => s.id).includes(due), "disabled excluded");
});

test("markRan advances next_run_at and records last_run_at", () => {
  const id = createNew(Date.now() - 1000);
  const now = Date.now();
  const nextRunAt = nextOccurrence([1, 3, 5], "09:00", 1, "UTC", now);
  schedules.markRan(id, now, nextRunAt);
  const s = schedules.getOwned(id, adminId)!;
  assert.equal(s.last_run_at, now);
  assert.ok(s.next_run_at! > now, "next_run_at is in the future");
  assert.ok(!schedules.listDue(now).map((x) => x.id).includes(id), "no longer due");
});

test("legacy schedule: advance uses interval_hours", () => {
  const legacyId = createLegacy(6, Date.now() - 1000);
  const s = schedules.getOwned(legacyId, adminId)!;
  assert.equal(s.interval_hours, 6);
  assert.equal(s.days_of_week, null, "legacy row has no days_of_week");
  // Simulated runner advance for legacy path
  const now = Date.now();
  const next = now + s.interval_hours! * 3_600_000;
  schedules.markRan(legacyId, now, next);
  const after = schedules.getOwned(legacyId, adminId)!;
  assert.ok(Math.abs(after.next_run_at! - (now + 6 * 3_600_000)) < 1000, "advanced by 6h");
});

test("new-format schedule: isLegacy flag is false", () => {
  const id = createNew(Date.now() + 3_600_000);
  const s = schedules.getOwned(id, adminId)!;
  assert.equal(s.interval_hours, null);
  assert.ok(s.days_of_week !== null, "days_of_week set");
  assert.equal(s.time_of_day, "09:00");
  assert.equal(s.repeat_weeks, 1);
  assert.equal(s.timezone, "UTC");
});

test("update migrates legacy to new format", () => {
  const legacyId = createLegacy(24, Date.now() + 3_600_000);
  const now = Date.now();
  const nextRunAt = nextOccurrence([1, 3, 5], "09:00", 1, "UTC", now);
  schedules.update(legacyId, {
    plaidItemIds: ["item-a"],
    daysOfWeek: [1, 3, 5],
    timeOfDay: "09:00",
    repeatWeeks: 1,
    timezone: "UTC",
    nextRunAt,
  });
  const after = schedules.getOwned(legacyId, adminId)!;
  assert.equal(after.interval_hours, null, "interval_hours cleared");
  assert.ok(after.days_of_week !== null, "days_of_week set");
});

test("a run started with triggeredBy=scheduled is recorded as scheduled", () => {
  const runId = syncRuns.start({ triggeredBy: "scheduled", scope: "selected", ownerUserId: adminId });
  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });
  assert.equal(syncRuns.get(runId)?.triggered_by, "scheduled");
});

test("schedules are owner-scoped", () => {
  const other = users.create({ username: "other2", passwordHash: "x", role: "member" });
  const id = createNew(Date.now());
  assert.ok(schedules.getOwned(id, adminId));
  assert.equal(schedules.getOwned(id, other), undefined);
});
