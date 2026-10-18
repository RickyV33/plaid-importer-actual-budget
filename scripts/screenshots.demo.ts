// Demo API responses for scripts/screenshots.ts: the same shapes the server's
// view builders return, filled with made-up banks, budgets, and runs. Built with
// the real insight functions, so the figures are consistent with each other.

import type { BannerView } from "../src/api/banners.js";
import type { ConnectionsView } from "../src/api/connections.js";
import type { HistoryRunView, HistoryView } from "../src/api/history.js";
import type { OverviewView } from "../src/api/overview.js";
import type { ProfileView, ProfilesView } from "../src/api/profiles.js";
import type { SchedulesView } from "../src/api/schedules.js";
import type { SettingsView } from "../src/api/settings.js";
import type { ScheduleRow } from "../src/db/queries.js";
import { freshness, rateLimitUsage } from "../src/insights/connections.js";
import { coverage } from "../src/insights/coverage.js";
import { byConnection, dailySeries } from "../src/insights/imports.js";
import { outcomeSummary } from "../src/insights/runs.js";
import { upcomingWeek } from "../src/insights/week.js";
import { nextOccurrence } from "../src/scheduler/recurrence.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const TZ = "America/Chicago";

/** Same numbers on every run, so screenshots only change when the UI does. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const BANKS = [
  { id: "item-harbor", name: "Harbor Bank", lastSync: 3 * HOUR, status: "active", pulls: 4 },
  { id: "item-northwind", name: "Northwind Credit Union", lastSync: 3 * HOUR, status: "active", pulls: 2 },
  { id: "item-summit", name: "Summit Card Services", lastSync: 4 * DAY, status: "active", pulls: 0 },
  { id: "item-lakeside", name: "Lakeside Savings", lastSync: 9 * DAY, status: "requires_relink", pulls: 0 },
];

const ACCOUNTS = [
  { item: "item-harbor", id: "acct-hb-chk", name: "Everyday Checking", mask: "4821", type: "depository", share: 0.3, off: false },
  { item: "item-harbor", id: "acct-hb-sav", name: "High-Yield Savings", mask: "0937", type: "depository", share: 0.04, off: false },
  { item: "item-harbor", id: "acct-hb-old", name: "Holiday Club", mask: "1150", type: "depository", share: 0, off: true },
  { item: "item-northwind", id: "acct-nw-chk", name: "Shared Checking", mask: "3304", type: "depository", share: 0.25, off: false },
  { item: "item-northwind", id: "acct-nw-auto", name: "Auto Loan", mask: "7712", type: "loan", share: 0.01, off: false },
  { item: "item-summit", id: "acct-sm-cash", name: "Cashback Card", mask: "6620", type: "credit", share: 0.3, off: false },
  { item: "item-summit", id: "acct-sm-trv", name: "Travel Card", mask: "9081", type: "credit", share: 0.1, off: false },
  { item: "item-lakeside", id: "acct-ls-sav", name: "Emergency Fund", mask: "2245", type: "depository", share: 0, off: false },
  { item: "item-lakeside", id: "acct-ls-cd", name: "12-Month CD", mask: "5068", type: "depository", share: 0, off: false },
];

const PROFILES = [
  {
    id: 1,
    name: "Household",
    serverUrl: "https://actual.example.com",
    budgetId: "6f2c1d0e-household",
    actual: ["Checking", "Savings", "Visa Rewards", "Travel Visa", "Rainy Day"],
    map: { "acct-hb-chk": "Checking", "acct-hb-sav": "Savings", "acct-sm-cash": "Visa Rewards", "acct-sm-trv": "Travel Visa", "acct-ls-sav": "Rainy Day" } as Record<string, string>,
    pending: ["acct-hb-chk"],
  },
  {
    id: 2,
    name: "Shared expenses",
    serverUrl: "https://actual.example.com",
    budgetId: "a91b3e44-shared",
    actual: ["Joint Checking", "Car Loan"],
    map: { "acct-nw-chk": "Joint Checking", "acct-hb-chk": "Joint Checking" } as Record<string, string>,
    pending: [] as string[],
  },
];

/** Twice-daily scheduled runs for 90 days, a few manual ones, and two failures. */
function demoRuns(now: number) {
  const rand = seeded(42);
  const runs: { id: number; started_at: number; status: string; total_imported: number; triggered_by: string }[] = [];
  let id = 1;
  const midnight = now - (now % DAY);
  for (let d = 89; d >= 0; d--) {
    for (const hour of [12, 24]) {
      const at = midnight - d * DAY + hour * HOUR;
      if (at > now) continue;
      const weekend = new Date(at).getUTCDay() % 6 === 0;
      const failed = (d === 12 && hour === 12) || (d === 41 && hour === 24);
      runs.push({ id: id++, started_at: at, status: failed ? "failure" : "success", total_imported: failed ? 0 : Math.round(rand() * (weekend ? 4 : 11)), triggered_by: "scheduled" });
    }
    if (d % 9 === 3) runs.push({ id: id++, started_at: midnight - d * DAY + 17 * HOUR, status: "success", total_imported: Math.round(rand() * 6), triggered_by: "manual" });
  }
  return runs.sort((a, b) => a.started_at - b.started_at);
}

function schedule(over: Partial<ScheduleRow> & { id: number }, now: number): ScheduleRow {
  const row: ScheduleRow = {
    owner_user_id: 1,
    name: null,
    plaid_item_ids: "[]",
    interval_hours: null,
    days_of_week: "[1,2,3,4,5]",
    time_of_day: "07:00",
    repeat_weeks: 1,
    timezone: TZ,
    enabled: 1,
    last_run_at: now - 5 * HOUR,
    next_run_at: null,
    created_at: now - 60 * DAY,
    updated_at: now - 60 * DAY,
    ...over,
  };
  // The next run the scheduler itself would compute.
  row.next_run_at = nextOccurrence(JSON.parse(row.days_of_week!) as number[], row.time_of_day!, row.repeat_weeks ?? 1, row.timezone!, now);
  return row;
}

export function demoApi(now: number): Record<string, unknown> {
  const runs = demoRuns(now);
  const since = (days: number) => runs.filter((r) => r.started_at >= now - days * DAY);
  const importedIn = (days: number) => since(days).reduce((n, r) => n + r.total_imported, 0);
  const imported30 = importedIn(30);
  const accountImported = (a: (typeof ACCOUNTS)[number]) => Math.round(imported30 * a.share);
  const itemImported = (itemId: string) => ACCOUNTS.filter((a) => a.item === itemId).reduce((n, a) => n + accountImported(a), 0);
  const mappedAnywhere = new Set(PROFILES.flatMap((p) => Object.keys(p.map)));
  const accountRows = ACCOUNTS.map((a) => ({ plaid_account_id: a.id, access_status: a.off ? "deselected" : "active" }));
  const nextRun = now + 5 * HOUR;

  const overview: OverviewView = {
    connectionCount: BANKS.length,
    accountCount: ACCOUNTS.filter((a) => !a.off).length,
    relinkCount: BANKS.filter((b) => b.status === "requires_relink").length,
    connectionSyncs: BANKS.map((b, i) => ({
      id: b.id,
      institutionName: b.name,
      lastSyncedAt: now - b.lastSync,
      nextRunAt: i < 3 ? nextRun : null,
      freshness: freshness({ status: b.status, last_synced_at: now - b.lastSync }, now),
    })),
    nextSyncAt: nextRun,
    importedTotals: { d7: importedIn(7), d30: imported30, d60: importedIn(60), d90: importedIn(90) },
    outcomes: outcomeSummary(since(30)),
    daily: dailySeries(runs, 30, now, TZ),
    byConnection: byConnection(
      BANKS.map((b) => ({ item_id: b.id, imported: itemImported(b.id) })),
      BANKS.map((b) => ({ id: b.id, label: b.name })),
    ),
    coverage: coverage(accountRows, mappedAnywhere),
    profileCount: PROFILES.length,
    otherUsers: 2,
  };

  const connections: ConnectionsView = {
    items: BANKS.map((b) => ({
      id: b.id,
      institutionName: b.name,
      status: b.status,
      lastSyncedAt: now - b.lastSync,
      freshness: freshness({ status: b.status, last_synced_at: now - b.lastSync }, now),
      rateLimit: rateLimitUsage(b.pulls, now - 20 * HOUR, { max: 4, windowHours: 24 }, now),
      accounts: ACCOUNTS.filter((a) => a.item === b.id).map((a) => ({
        plaidAccountId: a.id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        accessStatus: a.off ? ("deselected" as const) : ("active" as const),
        budgets: PROFILES.filter((p) => a.id in p.map).length,
        imported30: accountImported(a),
      })),
    })),
  };

  const profiles: ProfilesView = {
    profiles: PROFILES.map((p): ProfileView => {
      const actualAccounts = p.actual.map((name, i) => ({ id: `${p.id}-${i}`, name }));
      const idOf = (name: string | undefined) => actualAccounts.find((a) => a.name === name)?.id ?? null;
      return {
        id: p.id,
        name: p.name,
        serverUrl: p.serverUrl,
        budgetId: p.budgetId,
        actualError: false,
        actualAccounts,
        coverage: coverage(accountRows, new Set(Object.keys(p.map))),
        connections: BANKS.map((b) => ({
          itemId: b.id,
          institutionName: b.name,
          accounts: ACCOUNTS.filter((a) => a.item === b.id).map((a) => ({
            plaidAccountId: a.id,
            name: a.name,
            mask: a.mask,
            type: a.type,
            accessStatus: a.off ? ("deselected" as const) : ("active" as const),
            mappedActualId: idOf(p.map[a.id]),
            pendingVisible: p.pending.includes(a.id),
          })),
        })),
      };
    }),
  };

  const scheduleRows = [
    schedule({ id: 1, name: "Weekday mornings", plaid_item_ids: '["item-harbor","item-northwind"]' }, now),
    schedule({ id: 2, name: "Card statements", plaid_item_ids: '["item-summit"]', days_of_week: "[0,3]", time_of_day: "19:30" }, now),
    schedule({ id: 3, name: "Savings check-in", plaid_item_ids: '["item-lakeside"]', days_of_week: "[6]", time_of_day: "09:00", repeat_weeks: 2, enabled: 0 }, now),
  ];
  const bankName = new Map(BANKS.map((b) => [b.id, b.name]));
  const banksOf = (s: ScheduleRow) => (JSON.parse(s.plaid_item_ids) as string[]).map((id) => bankName.get(id) ?? id);
  const schedules: SchedulesView = {
    schedules: scheduleRows.map((s) => ({
      id: s.id,
      name: s.name,
      isLegacy: false,
      intervalHours: null,
      daysOfWeek: JSON.parse(s.days_of_week!) as number[],
      timeOfDay: s.time_of_day,
      repeatWeeks: s.repeat_weeks,
      timezone: s.timezone,
      enabled: s.enabled === 1,
      lastRunAt: s.last_run_at,
      nextRunAt: s.next_run_at,
      connectionNames: banksOf(s),
    })),
    connections: BANKS.map((b) => ({ id: b.id, name: b.name })),
    week: upcomingWeek(scheduleRows, (s) => s.name ?? banksOf(s).join(", "), now, TZ),
  };

  const page = runs.slice(-25).reverse();
  const history: HistoryView = {
    runs: page.map((r): HistoryRunView => ({
      id: r.id,
      startedAt: r.started_at,
      finishedAt: r.started_at + 40_000,
      status: r.status,
      triggeredBy: r.triggered_by,
      scope: r.triggered_by === "manual" ? "selected" : "all",
      totalImported: r.total_imported,
      results:
        r.total_imported > 0 || r.status === "failure"
          ? ACCOUNTS.filter((a) => !a.off && a.share > 0).map((a, i) => ({
              id: r.id * 100 + i,
              sync_run_id: r.id,
              plaid_account_id: a.id,
              status: r.status === "failure" ? ("failure" as const) : ("success" as const),
              txns_imported: r.status === "failure" ? 0 : Math.round(r.total_imported * a.share),
              reason: r.status === "failure" ? "actual_unreachable: connect ECONNREFUSED" : null,
              profile_id: 1,
              accountName: a.name,
            }))
          : [],
    })),
    orphans: [],
    hasMore: true,
    offset: 0,
    nextOffset: 25,
    prevOffset: 0,
    summary: outcomeSummary(since(30)),
    daily: dailySeries(runs, 90, now, TZ),
  };

  const settings: SettingsView = {
    currentSecret: "harbor-lantern-42",
    syncMax: "4",
    syncWindowHours: "24",
    initialHistoryDays: 180,
    minHistoryDays: 90,
    maxHistoryDays: 730,
    allProfiles: [
      ...PROFILES.map((p) => ({ id: p.id, name: p.name, owner: "alex", serverUrl: p.serverUrl, budgetId: p.budgetId })),
      { id: 3, name: "Studio", owner: "sam", serverUrl: "https://budget.example.net", budgetId: "c5d7e9f1-studio" },
    ],
  };

  // Banners would repeat at the top of every shot; set DEMO_BANNERS=1 to show the relink one.
  const banners: { banners: BannerView[] } = {
    banners: process.env.DEMO_BANNERS
      ? [{ key: "health:relink:item-lakeside:1", type: "error", message: "health.relink", vars: { name: "Lakeside Savings" }, href: "/connections", link: "health.fixRelink" }]
      : [],
  };

  return {
    me: { username: "alex", isAdmin: true, version: "v2.9.0" },
    banners,
    overview,
    connections,
    profiles,
    schedules,
    history,
    settings,
    profiles_new: { profile: null, defaults: { serverUrl: "https://actual.example.com", hasServerPassword: true } },
    schedules_new: { scheduleId: null, connections: schedules.connections, prefill: null },
  };
}
