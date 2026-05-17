import crypto from "node:crypto";

import { config } from "../config.js";

const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;

export function encrypt(plain: string): string {
  const nonce = crypto.randomBytes(NONCE_LEN);
  const cipher = crypto.createCipheriv(ALGO, config.encryptionKeyBytes, nonce);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, enc]).toString("base64");
}

export function decrypt(b64: string): string {
  const raw = Buffer.from(b64, "base64");
  if (raw.length < NONCE_LEN + TAG_LEN + 1) {
    throw new Error("ciphertext too short");
  }
  const nonce = raw.subarray(0, NONCE_LEN);
  const tag = raw.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const enc = raw.subarray(NONCE_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, config.encryptionKeyBytes, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
