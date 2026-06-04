import { withActual, type ActualConnection } from "./client.js";

export type ActualAccountSummary = {
  id: string;
  name: string;
};

type CacheEntry = {
  fetchedAt: number;
  data: ActualAccountSummary[];
};

const TTL_MS = 60_000;
const cacheByProfile = new Map<number, CacheEntry>();

/** List the Actual accounts for a single profile's budget (cached per profile). */
export async function listAccountsForProfile(
  profileId: number,
  conn: ActualConnection,
  opts?: { force?: boolean },
): Promise<ActualAccountSummary[]> {
  const cached = cacheByProfile.get(profileId);
  if (!opts?.force && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.data;
  }

  const data = await withActual(conn, async (api) => {
    const accounts = (await api.getAccounts()) as Array<{ id: string; name: string }>;
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  });

  cacheByProfile.set(profileId, { fetchedAt: Date.now(), data });
  return data;
}

export function invalidateAccountsCache(profileId?: number): void {
  if (profileId === undefined) cacheByProfile.clear();
  else cacheByProfile.delete(profileId);
}
