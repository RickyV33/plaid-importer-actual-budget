import { test } from "node:test";
import assert from "node:assert/strict";

import { pulledItemsNeedingMarker } from "./run.js";

test("pulledItemsNeedingMarker: marks pulled connections with no recorded result", () => {
  // A, B, C targeted. A errored (already has failure rows), B drained results,
  // C pulled but recorded nothing (no-op / unmapped) → only C needs a marker.
  const targets = ["A", "B", "C"];
  const errored = new Set(["A"]);
  const withResults = new Set(["B"]);

  assert.deepEqual(pulledItemsNeedingMarker(targets, errored, withResults), ["C"]);
});

test("pulledItemsNeedingMarker: none needed when every pulled item already recorded", () => {
  assert.deepEqual(
    pulledItemsNeedingMarker(["A", "B"], new Set(), new Set(["A", "B"])),
    [],
  );
});

test("pulledItemsNeedingMarker: all no-op pulls need markers", () => {
  assert.deepEqual(
    pulledItemsNeedingMarker(["A", "B"], new Set(), new Set()),
    ["A", "B"],
  );
});
