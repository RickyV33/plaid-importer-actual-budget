import { test } from "node:test";
import assert from "node:assert/strict";

import { activeTab } from "./nav.js";

test("activeTab: top-level pages", () => {
  assert.equal(activeTab("/"), "overview");
  assert.equal(activeTab("/connections"), "connections");
  assert.equal(activeTab("/history?offset=25"), "history");
});

test("activeTab: sub-pages belong to their section", () => {
  assert.equal(activeTab("/profiles/3/edit"), "profiles");
  assert.equal(activeTab("/schedules/new"), "schedules");
});

test("activeTab: paths outside the tabs have none", () => {
  assert.equal(activeTab("/login"), null);
  assert.equal(activeTab("/historyx"), null);
  assert.equal(activeTab(undefined), null);
});
