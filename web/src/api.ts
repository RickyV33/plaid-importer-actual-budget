// Typed calls to the server. Page types come straight from the server's view
// builders, so the app and the API can't drift apart without the typecheck noticing.

import type { BannerView } from "../../src/api/banners";
import type { ConnectionsView } from "../../src/api/connections";
import type { HistoryView, OrphanView } from "../../src/api/history";
import type { OverviewView } from "../../src/api/overview";
import type { ProfileFormView, ProfilesView } from "../../src/api/profiles";
import type { ScheduleFormView, SchedulesView } from "../../src/api/schedules";
import type { SettingsView } from "../../src/api/settings";

export type { BannerView, ConnectionsView, HistoryView, OrphanView, OverviewView, ProfileFormView, ProfilesView, ScheduleFormView, SchedulesView, SettingsView };
export type { ConnectionView, ConnectionAccountView } from "../../src/api/connections";
export type { ProfileView, ProfileAccountView } from "../../src/api/profiles";
export type { ScheduleView } from "../../src/api/schedules";
export type { HistoryRunView } from "../../src/api/history";

export type Me = { username: string; isAdmin: boolean; version: string };
export type SyncResult = {
  status: string;
  totalImported: number;
  synced: { itemId: string; imported: number; lastSyncedAt: number | null }[];
  skipped: { itemId: string; name: string; retryAfterMinutes: number }[];
};
export type ProfileInput = { name: string; serverUrl: string; budgetId: string; serverPassword: string; encryptionPassword: string };
export type ScheduleInput = { name: string; daysOfWeek: number[]; timeOfDay: string; repeatWeeks: number; timezone: string; plaidItemIds: string[] };

/** A failed call: `code` is the server's error (a catalog key, or a code like "plaid_link_token_failed"). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const viewerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      // Only send a content type with a body: the server rejects an empty JSON body.
      ...(init.body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  if (res.status === 401) {
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new ApiError("unauthenticated", 401);
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(typeof body?.error === "string" ? body.error : `http_${res.status}`, res.status);
  return body as T;
}

const withTz = (path: string, extra = "") => `${path}?tz=${encodeURIComponent(viewerZone())}${extra}`;

export const api = {
  me: () => call<Me>("/api/me"),
  banners: () => call<{ banners: BannerView[] }>("/api/banners"),
  dismissBanner: (key: string) => call<null>(`/banners/${encodeURIComponent(key)}/dismiss`, { method: "POST" }),

  overview: () => call<OverviewView>(withTz("/api/overview")),

  connections: () => call<ConnectionsView>("/api/connections"),
  sync: (body: { scope: "all" } | { scope: "selected"; plaidAccountIds: string[] }) => call<SyncResult>("/sync", { method: "POST", body }),
  linkToken: () => call<{ link_token: string }>("/link/token", { method: "POST" }),
  exchange: (publicToken: string) => call<{ ok: true }>("/link/exchange", { method: "POST", body: { public_token: publicToken } }),
  updateToken: (itemId: string) => call<{ link_token: string }>(`/link/items/${encodeURIComponent(itemId)}/update-token`, { method: "POST" }),
  markActive: (itemId: string) => call<{ ok: true }>(`/link/items/${encodeURIComponent(itemId)}/mark-active`, { method: "POST" }),
  accountSelectToken: (itemId: string) => call<{ link_token: string }>(`/link/items/${encodeURIComponent(itemId)}/account-select-token`, { method: "POST" }),
  refreshAccounts: (itemId: string) => call<{ ok: true }>(`/link/items/${encodeURIComponent(itemId)}/refresh-accounts`, { method: "POST" }),
  removeItem: (itemId: string) => call<null>(`/link/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }),
  removeAccount: (itemId: string, plaidAccountId: string) =>
    call<null>(`/link/items/${encodeURIComponent(itemId)}/accounts/${encodeURIComponent(plaidAccountId)}`, { method: "DELETE" }),

  profiles: () => call<ProfilesView>("/api/profiles"),
  profileForm: (id: string | null) => call<ProfileFormView>(id === null ? "/api/profiles/new" : `/api/profiles/${encodeURIComponent(id)}`),
  createProfile: (body: ProfileInput) => call<{ id: number }>("/api/profiles", { method: "POST", body }),
  updateProfile: (id: number, body: ProfileInput) => call<{ id: number }>(`/api/profiles/${id}`, { method: "PUT", body }),
  deleteProfile: (id: number) => call<null>(`/profiles/${id}/delete`, { method: "POST" }),
  budgets: (serverUrl: string, serverPassword: string) =>
    call<{ budgets: { syncId: string; name: string }[] }>("/profiles/budgets", { method: "POST", body: { serverUrl, serverPassword } }),
  setMapping: (profileId: number, plaidAccountId: string, actualAccountId: string | null) =>
    actualAccountId === null
      ? call<null>(`/profiles/${profileId}/mappings/${encodeURIComponent(plaidAccountId)}`, { method: "DELETE" })
      : call<{ ok: true }>(`/profiles/${profileId}/mappings/${encodeURIComponent(plaidAccountId)}`, { method: "POST", body: { actualAccountId } }),
  setPendingVisible: (profileId: number, plaidAccountId: string, value: boolean) =>
    call<{ ok: true }>(`/profiles/${profileId}/mappings/${encodeURIComponent(plaidAccountId)}/pending-visible`, { method: "POST", body: { value } }),

  schedules: () => call<SchedulesView>(withTz("/api/schedules")),
  scheduleForm: (id: string | null) => call<ScheduleFormView>(id === null ? "/api/schedules/new" : `/api/schedules/${encodeURIComponent(id)}`),
  createSchedule: (body: ScheduleInput) => call<{ id: number }>("/api/schedules", { method: "POST", body }),
  updateSchedule: (id: number, body: ScheduleInput) => call<{ id: number }>(`/api/schedules/${id}`, { method: "PUT", body }),
  toggleSchedule: (id: number) => call<{ enabled: boolean }>(`/api/schedules/${id}/toggle`, { method: "POST" }),
  deleteSchedule: (id: number) => call<null>(`/schedules/${id}/delete`, { method: "POST" }),

  history: (offset: number) => call<HistoryView>(withTz("/api/history", `&offset=${offset}`)),
  ackOrphan: (id: number) => call<{ orphans: OrphanView[] }>(`/api/history/orphans/${id}/ack`, { method: "POST" }),

  settings: () => call<SettingsView>("/api/settings"),
  setRegistrationSecret: (secret: string) => call<SettingsView>("/api/settings/registration-secret", { method: "PUT", body: { secret } }),
  setSyncLimit: (max: string, windowHours: string) => call<SettingsView>("/api/settings/sync-limit", { method: "PUT", body: { max, windowHours } }),
  setInitialHistory: (days: string) => call<SettingsView>("/api/settings/initial-history", { method: "PUT", body: { days } }),
  adminDeleteProfile: (id: number) => call<null>(`/admin/profiles/${id}/delete`, { method: "POST" }),
};
