import fs from "node:fs";

import * as actual from "@actual-app/api";

import { config } from "../config.js";

export type ActualApi = typeof actual;

let inFlight = false;

export async function withActual<T>(fn: (api: ActualApi) => Promise<T>): Promise<T> {
  if (inFlight) {
    throw new Error(
      "Actual client busy — another sync is in progress. Try again in a moment.",
    );
  }
  inFlight = true;

  fs.mkdirSync(config.ACTUAL_CACHE_DIR, { recursive: true });

  try {
    await actual.init({
      serverURL: config.ACTUAL_SERVER_URL,
      password: config.ACTUAL_SERVER_PASSWORD,
      dataDir: config.ACTUAL_CACHE_DIR,
    });

    if (config.ACTUAL_ENCRYPTION_PASSWORD && config.ACTUAL_ENCRYPTION_PASSWORD.length > 0) {
      await actual.downloadBudget(config.ACTUAL_SYNC_ID, {
        password: config.ACTUAL_ENCRYPTION_PASSWORD,
      });
    } else {
      await actual.downloadBudget(config.ACTUAL_SYNC_ID);
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
    inFlight = false;
  }
}
