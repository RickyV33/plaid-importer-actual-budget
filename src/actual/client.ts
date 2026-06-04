import fs from "node:fs";
import path from "node:path";

import * as actual from "@actual-app/api";

import { config } from "../config.js";
import { decrypt } from "../crypto/tokens.js";
import type { ProfileRow } from "../db/queries.js";

export type ActualApi = typeof actual;

export type ActualConnection = {
  serverUrl: string;
  serverPassword: string;
  budgetId: string;
  encryptionPassword: string | null;
  cacheDir: string;
};

let inFlight = false;

export function profileCacheDir(profileId: number): string {
  return path.join(config.ACTUAL_CACHE_DIR, String(profileId));
}

/** Build a connection (with decrypted secrets) from a stored profile row. */
export function connectionForProfile(profile: ProfileRow): ActualConnection {
  return {
    serverUrl: profile.server_url,
    serverPassword: decrypt(profile.server_password_enc),
    budgetId: profile.budget_id,
    encryptionPassword: profile.encryption_password_enc
      ? decrypt(profile.encryption_password_enc)
      : null,
    cacheDir: profileCacheDir(profile.id),
  };
}

export type BudgetSummary = { syncId: string; name: string; hasKey: boolean };

/**
 * List the budgets available on an Actual server (name + Sync ID). Only needs
 * server auth — no budget download. Used to offer a budget dropdown when
 * creating a profile. Serialized via the same singleton guard as syncs.
 */
export async function listBudgets(conn: {
  serverUrl: string;
  serverPassword: string;
  cacheDir: string;
}): Promise<BudgetSummary[]> {
  if (inFlight) {
    throw new Error("Actual client busy — try again in a moment.");
  }
  inFlight = true;
  fs.mkdirSync(conn.cacheDir, { recursive: true });
  try {
    await actual.init({
      serverURL: conn.serverUrl,
      password: conn.serverPassword,
      dataDir: conn.cacheDir,
    });
    const files = (await actual.getBudgets()) as Array<{
      cloudFileId?: string;
      name?: string;
      hasKey?: boolean;
    }>;
    return files
      .filter((f): f is { cloudFileId: string; name?: string; hasKey?: boolean } => Boolean(f.cloudFileId))
      .map((f) => ({ syncId: f.cloudFileId, name: f.name ?? f.cloudFileId, hasKey: Boolean(f.hasKey) }));
  } finally {
    try {
      await actual.shutdown();
    } catch {
      // non-fatal
    }
    try {
      fs.rmSync(conn.cacheDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    inFlight = false;
  }
}

/**
 * Run `fn` against an initialized Actual client for a specific profile's budget.
 * The local cache dir holds a *plaintext* copy of the budget while this runs, so
 * it is wiped afterward to minimize at-rest exposure on shared hosts. Because
 * `@actual-app/api` is a process singleton, calls are serialized via `inFlight`.
 */
export async function withActual<T>(
  conn: ActualConnection,
  fn: (api: ActualApi) => Promise<T>,
): Promise<T> {
  if (inFlight) {
    throw new Error(
      "Actual client busy — another sync is in progress. Try again in a moment.",
    );
  }
  inFlight = true;

  fs.mkdirSync(conn.cacheDir, { recursive: true });

  try {
    await actual.init({
      serverURL: conn.serverUrl,
      password: conn.serverPassword,
      dataDir: conn.cacheDir,
    });

    if (conn.encryptionPassword && conn.encryptionPassword.length > 0) {
      await actual.downloadBudget(conn.budgetId, { password: conn.encryptionPassword });
    } else {
      await actual.downloadBudget(conn.budgetId);
    }

    const result = await fn(actual);

    await actual.sync();
    return result;
  } finally {
    try {
      await actual.shutdown();
    } catch {
      // shutdown errors are non-fatal; we're tearing down anyway
    }
    // Wipe the plaintext budget cache so it does not persist between syncs.
    try {
      fs.rmSync(conn.cacheDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    inFlight = false;
  }
}
