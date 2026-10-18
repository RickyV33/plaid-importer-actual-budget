import { test } from "node:test";
import assert from "node:assert/strict";

import { healthIncidents } from "./health.js";

const profiles = [
  { id: 1, name: "Household" },
  { id: 2, name: "Business" },
];
const row = (profile_id: number, sync_run_id: number, status: string, reason: string | null = null) => ({
  profile_id,
  sync_run_id,
  status,
  reason,
});

test("healthIncidents: an unreachable budget is reported by name", () => {
  const out = healthIncidents([row(1, 7, "failure", "actual_unreachable: ECONNREFUSED")], profiles, [], "?");
  assert.deepEqual(out, [{ kind: "actual_unreachable", key: "health:actual:1:7", subject: "Household" }]);
});

test("healthIncidents: other failures are import errors", () => {
  const out = healthIncidents([row(2, 7, "success"), row(2, 7, "failure", "duplicate id")], profiles, [], "?");
  assert.deepEqual(out, [{ kind: "import_failed", key: "health:import:2:7", subject: "Business" }]);
});

test("healthIncidents: unreachable wins when a run has both kinds", () => {
  const out = healthIncidents([row(1, 7, "failure", "boom"), row(1, 7, "failure", "actual_unreachable: x")], profiles, [], "?");
  assert.equal(out.length, 1);
  assert.equal(out[0]!.kind, "actual_unreachable");
});

test("healthIncidents: a successful latest run means no incident", () => {
  assert.deepEqual(healthIncidents([row(1, 8, "success"), row(2, 8, "success")], profiles, [], "?"), []);
});

test("healthIncidents: a relink item is reported, keyed by when it was flagged", () => {
  const out = healthIncidents([], profiles, [{ id: "item-1", institution_name: "Harbor Bank", updated_at: 1234 }], "?");
  assert.deepEqual(out, [{ kind: "relink", key: "health:relink:item-1:1234", subject: "Harbor Bank" }]);
  const unnamed = healthIncidents([], profiles, [{ id: "item-2", institution_name: null, updated_at: 1 }], "a bank");
  assert.equal(unnamed[0]!.subject, "a bank");
});

test("healthIncidents: the key changes with a new failing run, so a dismissal covers one incident", () => {
  const first = healthIncidents([row(1, 7, "failure", "actual_unreachable: x")], profiles, [], "?");
  const later = healthIncidents([row(1, 9, "failure", "actual_unreachable: x")], profiles, [], "?");
  assert.notEqual(first[0]!.key, later[0]!.key);
});

test("healthIncidents: errors come before warnings; unknown profiles are skipped", () => {
  const out = healthIncidents(
    [row(2, 7, "failure", "boom"), row(1, 7, "failure", "actual_unreachable: x"), row(99, 7, "failure", "boom")],
    profiles,
    [{ id: "i", institution_name: "Harbor Bank", updated_at: 1 }],
    "?",
  );
  assert.deepEqual(
    out.map((i) => i.kind),
    ["actual_unreachable", "relink", "import_failed"],
  );
});
