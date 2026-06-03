import bcrypt from "bcrypt";

import { config } from "../config.js";
import { plaidItems, users, type UserRow } from "../db/queries.js";

const BCRYPT_ROUNDS = 12;

// Precomputed hash of a random string, compared against on unknown usernames so
// that login timing does not reveal whether a username exists.
let dummyHash: string | undefined;

export async function initCredentials(): Promise<void> {
  dummyHash = await bcrypt.hash(`dummy:${Date.now()}:${Math.random()}`, BCRYPT_ROUNDS);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function createUser(
  username: string,
  password: string,
  role: UserRow["role"],
): Promise<number> {
  const passwordHash = await hashPassword(password);
  return users.create({ username, passwordHash, role });
}

/**
 * Verify a submitted credential against the `users` table. Returns the matched
 * user on success, or null. On an unknown username we still perform a bcrypt
 * comparison against a dummy hash to keep timing constant.
 */
export async function verify(
  username: string,
  password: string,
): Promise<UserRow | null> {
  if (dummyHash === undefined) {
    throw new Error("credentials not initialized");
  }
  const user = users.getByUsername(username);
  if (!user) {
    await bcrypt.compare(password, dummyHash);
    return null;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

/**
 * Idempotent boot seed: if no users exist and APP_USER/APP_PASSWORD are set,
 * create one admin from the env credential and claim any unowned Plaid items.
 * No-op once any user exists, so it never fights the DB on later boots.
 */
export async function seedAdminFromEnv(): Promise<void> {
  if (users.count() > 0) return;
  const username = config.APP_USER;
  const password = config.APP_PASSWORD;
  if (!username || !password) return;

  const adminId = await createUser(username, password, "admin");
  const claimed = plaidItems.backfillOwner(adminId);
  process.stdout.write(
    `seeded admin '${username}' (id=${adminId}); claimed ${claimed} existing item(s)\n`,
  );
}
