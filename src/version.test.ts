import { test } from "node:test";
import assert from "node:assert/strict";

import { FALLBACK_VERSION, formatVersion, resolveVersion } from "./version.js";

/** A file reader that must never be called. */
const unreadable = () => {
  throw new Error("ENOENT: no such file or directory");
};

test("resolveVersion: APP_VERSION wins over the VERSION file", () => {
  assert.equal(resolveVersion({ APP_VERSION: "2.8.0" }, () => "1.0.0"), "2.8.0");
});

test("resolveVersion: APP_VERSION is trimmed", () => {
  assert.equal(resolveVersion({ APP_VERSION: " 2.8.0\n" }, unreadable), "2.8.0");
});

test("resolveVersion: empty or whitespace-only APP_VERSION falls through", () => {
  for (const value of ["", "   ", "\n"]) {
    assert.equal(resolveVersion({ APP_VERSION: value }, () => "2.8.0"), "2.8.0");
  }
});

test("resolveVersion: unset APP_VERSION reads the VERSION file, trimming the newline", () => {
  assert.equal(resolveVersion({}, () => "2.8.0\n"), "2.8.0");
  assert.equal(resolveVersion({ APP_VERSION: undefined }, () => "2.8.0\n"), "2.8.0");
});

test("resolveVersion: a missing or unreadable VERSION file falls back to dev", () => {
  assert.equal(resolveVersion({}, unreadable), FALLBACK_VERSION);
});

test("resolveVersion: an empty VERSION file falls back to dev", () => {
  for (const contents of ["", "   ", "\n"]) {
    assert.equal(resolveVersion({}, () => contents), FALLBACK_VERSION);
  }
});

test("resolveVersion: never throws, so a bad lookup cannot stop startup", () => {
  assert.doesNotThrow(() => resolveVersion({}, unreadable));
});

test("formatVersion: numeric versions get the v prefix", () => {
  assert.equal(formatVersion("2.8.0"), "v2.8.0");
  assert.equal(formatVersion("2.9.0-rc1"), "v2.9.0-rc1");
  assert.equal(formatVersion("10.0.0"), "v10.0.0");
});

test("formatVersion: the dev fallback renders verbatim, not 'vdev'", () => {
  assert.equal(formatVersion(FALLBACK_VERSION), "dev");
});
