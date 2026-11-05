import fs from "node:fs";
import path from "node:path";

import * as actual from "@actual-app/api";

import { sessionTokenFor } from "../profiles/endpoint.js";
import { assertSafeServerUrl } from "../profiles/hostname.js";
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

function actualAuth(serverUrl: string, serverPassword: string) {
  const sessionToken = sessionTokenFor(serverUrl, config.ACTUAL_SERVER_URL,
    config.ACTUAL_SESSION_TOKEN, config.ALLOW_HTTP_ACTUAL_SERVER === "true");
  return !serverPassword && sessionToken ? { sessionToken } : { password: serverPassword };
}


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
  await assertSafeServerUrl(conn.serverUrl, {
    blockPrivate: config.blockPrivateActualHosts,
    allowedServerUrl: config.ACTUAL_SERVER_URL,
    allowHttp: config.ALLOW_HTTP_ACTUAL_SERVER === "true",
  });
  if (inFlight) {
    throw new Error("Actual client busy — try again in a moment.");
  }
  inFlight = true;
  fs.mkdirSync(conn.cacheDir, { recursive: true });
  try {
    await actual.init({
      serverURL: conn.serverUrl,
      ...actualAuth(conn.serverUrl, conn.serverPassword),
      dataDir: conn.cacheDir,
      verbose: false,
    });
    // Actual's "Sync ID" (what downloadBudget matches on) is the budget's
    // groupId, NOT cloudFileId. See @actual-app/api downloadBudget:
    //   (await getBudgets()).find((b) => b.groupId === syncId)
    const files = (await actual.getBudgets()) as Array<{
      groupId?: string | null;
      name?: string;
      hasKey?: boolean;
    }>;
    return files
      .filter((f): f is { groupId: string; name?: string; hasKey?: boolean } => Boolean(f.groupId))
      .map((f) => ({ syncId: f.groupId, name: f.name ?? f.groupId, hasKey: Boolean(f.hasKey) }));
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
  await assertSafeServerUrl(conn.serverUrl, {
    blockPrivate: config.blockPrivateActualHosts,
    allowedServerUrl: config.ACTUAL_SERVER_URL,
    allowHttp: config.ALLOW_HTTP_ACTUAL_SERVER === "true",
  });
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
      ...actualAuth(conn.serverUrl, conn.serverPassword),
      dataDir: conn.cacheDir,
      verbose: false,
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
