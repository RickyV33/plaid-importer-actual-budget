import { withActual } from "./client.js";

export type ActualAccountSummary = {
  id: string;
  name: string;
};

type CacheEntry = {
  fetchedAt: number;
  data: ActualAccountSummary[];
};

const TTL_MS = 60_000;
let cache: CacheEntry | undefined;

export async function listAccounts(opts?: { force?: boolean }): Promise<ActualAccountSummary[]> {
  if (!opts?.force && cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }

  const data = await withActual(async (api) => {
    const accounts = (await api.getAccounts()) as Array<{ id: string; name: string }>;
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  });

  cache = { fetchedAt: Date.now(), data };
  return data;
}

export function invalidateAccountsCache(): void {
  cache = undefined;
}
