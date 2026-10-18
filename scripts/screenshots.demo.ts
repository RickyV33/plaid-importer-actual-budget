// Demo view data for scripts/screenshots.ts: the same shapes the routes pass to
// each template, filled with made-up banks, budgets, and runs.

import { freshness, rateLimitUsage } from "../src/insights/connections.js";
import { byConnection, dailySeries } from "../src/insights/imports.js";
import { outcomeSummary } from "../src/insights/runs.js";

export type DemoPage = { name: string; template: string; url: string; data: Record<string, unknown> };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = "America/Chicago";

/** Same numbers on every run, so screenshots only change when the UI does. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const BANKS = [
  { id: "item-harbor", name: "Harbor Bank", lastSync: 3 * HOUR, status: "active" },
  { id: "item-northwind", name: "Northwind Credit Union", lastSync: 3 * HOUR, status: "active" },
  { id: "item-summit", name: "Summit Card Services", lastSync: 4 * DAY, status: "active" },
  { id: "item-lakeside", name: "Lakeside Savings", lastSync: 9 * DAY, status: "requires_relink" },
];

/** Twice-daily scheduled runs for 90 days, with a few manual ones and two failures. */
function demoRuns(now: number) {
  const rand = seeded(42);
  const runs: { started_at: number; status: string; total_imported: number; triggered_by: string }[] = [];
  for (let d = 89; d >= 0; d--) {
    for (const hour of [7, 19]) {
      const at = now - d * DAY - ((now / HOUR) % 24) * HOUR + hour * HOUR;
      if (at > now) continue;
      const weekend = new Date(at).getUTCDay() % 6 === 0;
      const failed = (d === 12 && hour === 7) || (d === 41 && hour === 19);
      runs.push({
        started_at: at,
        status: failed ? "failure" : "success",
        total_imported: failed ? 0 : Math.round(rand() * (weekend ? 4 : 11)),
        triggered_by: "scheduled",
      });
    }
    if (d % 9 === 3) runs.push({ started_at: now - d * DAY - 2 * HOUR, status: "success", total_imported: Math.round(rand() * 6), triggered_by: "manual" });
  }
  return runs.sort((a, b) => a.started_at - b.started_at);
}

export function demoPages(now: number): DemoPage[] {
  const signedIn = { title: "plaid-importer", authed: true, isAdmin: true };
  const runs = demoRuns(now);
  const since = (days: number) => runs.filter((r) => r.started_at >= now - days * DAY);
  const importedIn = (days: number) => since(days).reduce((n, r) => n + r.total_imported, 0);
  const imported30 = importedIn(30);
  const split = [0.46, 0.33, 0.21, 0];

  return [
    { name: "login", template: "login", url: "/login", data: { title: "plaid-importer", authed: false, next: "/" } },
    { name: "register", template: "register", url: "/register", data: { title: "plaid-importer", authed: false, usersExist: true } },
    {
      name: "overview",
      template: "dashboard",
      url: "/",
      data: {
        ...signedIn,
        connectionCount: BANKS.length,
        accountCount: 9,
        relinkCount: 1,
        connectionSyncs: BANKS.map((b, i) => ({
          id: b.id,
          institutionName: b.name,
          lastSyncedAt: now - b.lastSync,
          nextRunAt: i < 3 ? now + 5 * HOUR : null,
          freshness: freshness({ status: b.status, last_synced_at: now - b.lastSync }, now),
        })),
        nextSyncAt: now + 5 * HOUR,
        importedTotals: { d7: importedIn(7), d30: imported30, d60: importedIn(60), d90: importedIn(90) },
        outcomes: outcomeSummary(since(30)),
        daily: dailySeries(runs, 30, now, TZ),
        byConnection: byConnection(
          BANKS.map((b, i) => ({ item_id: b.id, imported: Math.round(imported30 * split[i]!) })),
          BANKS.map((b) => ({ id: b.id, label: b.name })),
        ),
        coverage: { routed: 7, total: 9 },
        profileCount: 2,
        otherUsers: 2,
      },
    },
    {
      name: "connections",
      template: "connections",
      url: "/connections",
      data: {
        ...signedIn,
        items: BANKS.map((b, i) => ({
          id: b.id,
          institutionName: b.name,
          status: b.status,
          lastSyncedAt: now - b.lastSync,
          freshness: freshness({ status: b.status, last_synced_at: now - b.lastSync }, now),
          rateLimit: rateLimitUsage([4, 1, 0, 0][i]!, now - 20 * HOUR, { max: 4, windowHours: 24 }, now),
          accounts: ACCOUNTS.filter((a) => a.item === b.id).map((a) => ({
            plaidAccountId: a.id,
            name: a.name,
            mask: a.mask,
            type: a.type,
            accessStatus: a.off ? "deselected" : "active",
            budgets: a.budgets,
            imported30: a.imported,
          })),
        })),
      },
    },
  ];
}

export const ACCOUNTS = [
  { item: "item-harbor", id: "acct-hb-chk", name: "Everyday Checking", mask: "4821", type: "depository", budgets: 2, imported: 71, off: false },
  { item: "item-harbor", id: "acct-hb-sav", name: "High-Yield Savings", mask: "0937", type: "depository", budgets: 1, imported: 9, off: false },
  { item: "item-harbor", id: "acct-hb-old", name: "Holiday Club", mask: "1150", type: "depository", budgets: 0, imported: 0, off: true },
  { item: "item-northwind", id: "acct-nw-chk", name: "Shared Checking", mask: "3304", type: "depository", budgets: 1, imported: 58, off: false },
  { item: "item-northwind", id: "acct-nw-auto", name: "Auto Loan", mask: "7712", type: "loan", budgets: 0, imported: 2, off: false },
  { item: "item-summit", id: "acct-sm-cash", name: "Cashback Card", mask: "6620", type: "credit", budgets: 1, imported: 44, off: false },
  { item: "item-summit", id: "acct-sm-trv", name: "Travel Card", mask: "9081", type: "credit", budgets: 1, imported: 13, off: false },
  { item: "item-lakeside", id: "acct-ls-sav", name: "Emergency Fund", mask: "2245", type: "depository", budgets: 1, imported: 0, off: false },
  { item: "item-lakeside", id: "acct-ls-cd", name: "12-Month CD", mask: "5068", type: "depository", budgets: 0, imported: 0, off: false },
];
