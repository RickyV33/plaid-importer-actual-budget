import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.ACTUAL_SERVER_URL ??= "http://localhost:5006";
process.env.ACTUAL_SERVER_PASSWORD ??= "test";
process.env.ACTUAL_SYNC_ID ??= "test";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");

const { encrypt, decrypt } = await import("./tokens.js");

test("encrypt/decrypt round-trip preserves plaintext", () => {
  const plain = "access-sandbox-abc-12345";
  const cipher = encrypt(plain);
  assert.notEqual(cipher, plain);
  assert.equal(decrypt(cipher), plain);
});

test("different nonces produce different ciphertexts for the same plaintext", () => {
  const a = encrypt("same input");
  const b = encrypt("same input");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "same input");
  assert.equal(decrypt(b), "same input");
});

test("tampered ciphertext fails decryption", () => {
  const cipher = encrypt("sensitive");
  const raw = Buffer.from(cipher, "base64");
  const lastByte = raw[raw.length - 1];
  assert.notEqual(lastByte, undefined);
  raw[raw.length - 1] = (lastByte! ^ 0xff) & 0xff;
  const tampered = raw.toString("base64");
  assert.throws(() => decrypt(tampered));
});

test("short ciphertext fails fast", () => {
  assert.throws(() => decrypt("c2hvcnQ="));
});
