import { test } from "node:test";
import assert from "node:assert/strict";

import { assertSafeServerUrl, isBlockedIp, UnsafeServerUrlError } from "./hostname.js";

test("isBlockedIp: private/loopback/link-local IPv4 are blocked", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255", "169.254.1.1", "0.0.0.0", "100.64.0.1"]) {
    assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`);
  }
});

test("isBlockedIp: public IPv4 is allowed", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1"]) {
    assert.equal(isBlockedIp(ip), false, `${ip} should be allowed`);
  }
});

test("isBlockedIp: IPv6 loopback/unique-local/link-local blocked, public allowed", () => {
  assert.equal(isBlockedIp("::1"), true);
  assert.equal(isBlockedIp("fd00::1"), true);
  assert.equal(isBlockedIp("fe80::1"), true);
  assert.equal(isBlockedIp("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
});

test("isBlockedIp: non-IP strings are refused", () => {
  assert.equal(isBlockedIp("not-an-ip"), true);
});

test("assertSafeServerUrl: rejects non-https", async () => {
  await assert.rejects(() => assertSafeServerUrl("http://example.com"), UnsafeServerUrlError);
});

test("assertSafeServerUrl: rejects a private IP literal host when blockPrivate is on", async () => {
  await assert.rejects(() => assertSafeServerUrl("https://127.0.0.1", { blockPrivate: true }), UnsafeServerUrlError);
  await assert.rejects(() => assertSafeServerUrl("https://192.168.0.10:5006", { blockPrivate: true }), UnsafeServerUrlError);
});

test("assertSafeServerUrl: allows a private host by default (self-hosted LAN)", async () => {
  const url = await assertSafeServerUrl("https://192.168.0.10:5006");
  assert.equal(url.hostname, "192.168.0.10");
});

test("assertSafeServerUrl: accepts an https public IP literal host", async () => {
  const url = await assertSafeServerUrl("https://8.8.8.8");
  assert.equal(url.protocol, "https:");
});

test("assertSafeServerUrl: rejects a malformed URL", async () => {
  await assert.rejects(() => assertSafeServerUrl("not a url"), UnsafeServerUrlError);
});
