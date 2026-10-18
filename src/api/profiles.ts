// The Profiles page and the profile form. Listing fetches each profile's Actual
// accounts (for the mapping selects); a budget it can't reach is flagged, not fatal.

import { z } from "zod";

import { connectionForProfile } from "../actual/client.js";
import { invalidateAccountsCache, listAccountsForProfile } from "../actual/accounts.js";
import { config } from "../config.js";
import { encrypt } from "../crypto/tokens.js";
import { plaidAccounts, plaidItems, profileAccountMappings, profiles } from "../db/queries.js";
import { coverage, type Coverage } from "../insights/coverage.js";
import { assertSafeServerUrl } from "../profiles/hostname.js";
import { fail, type Result } from "./result.js";
import { accountsForItem, toAccountView, type AccountView } from "./shared.js";

export type ProfileAccountView = AccountView & {
  mappedActualId: string | null;
  pendingVisible: boolean;
};

export type ProfileConnectionView = {
  itemId: string;
  institutionName: string | null;
  accounts: ProfileAccountView[];
};

export type ProfileView = {
  id: number;
  name: string;
  serverUrl: string;
  budgetId: string;
  actualError: boolean;
  actualAccounts: { id: string; name: string }[];
  connections: ProfileConnectionView[];
  coverage: Coverage;
};

export type ProfilesView = { profiles: ProfileView[] };

export async function profilesFor(
  userId: number,
  warn: (obj: object, msg: string) => void,
): Promise<ProfilesView> {
  const items = plaidItems.listByOwner(userId);
  const accounts = plaidAccounts.listByOwnerAll(userId);

  const views: ProfileView[] = [];
  for (const p of profiles.listByOwner(userId)) {
    const mappings = new Map(profileAccountMappings.listByProfile(p.id).map((m) => [m.plaid_account_id, m]));
    let actualAccounts: { id: string; name: string }[] = [];
    let actualError = false;
    if (accounts.length > 0) {
      try {
        actualAccounts = await listAccountsForProfile(p.id, connectionForProfile(p));
      } catch (err) {
        warn({ err, profileId: p.id }, "actual_accounts_fetch_failed_profiles");
        actualError = true;
      }
    }
    views.push({
      id: p.id,
      name: p.name,
      serverUrl: p.server_url,
      budgetId: p.budget_id,
      actualError,
      actualAccounts,
      coverage: coverage(accounts, new Set(mappings.keys())),
      connections: items
        .map((item) => ({
          itemId: item.id,
          institutionName: item.institution_name,
          accounts: accountsForItem(accounts, item).map((a) => {
            const m = mappings.get(a.plaid_account_id);
            return { ...toAccountView(a), mappedActualId: m?.actual_account_id ?? null, pendingVisible: Boolean(m?.pending_visible) };
          }),
        }))
        .filter((c) => c.accounts.length > 0),
    });
  }
  return { profiles: views };
}

export type ProfileFormView = {
  /** Null for a new profile. Secrets are never included. */
  profile: { id: number; name: string; serverUrl: string; budgetId: string } | null;
  /** New-profile defaults from the environment; the server password itself is never sent. */
  defaults: { serverUrl: string; hasServerPassword: boolean };
};

/** Undefined when `id` names a profile the user doesn't own. */
export function profileFormFor(userId: number, id: number | null): ProfileFormView | undefined {
  const defaults = { serverUrl: config.ACTUAL_SERVER_URL ?? "", hasServerPassword: Boolean(config.ACTUAL_SERVER_PASSWORD) };
  if (id === null) return { profile: null, defaults };
  const p = profiles.getOwned(id, userId);
  if (!p) return undefined;
  return { profile: { id: p.id, name: p.name, serverUrl: p.server_url, budgetId: p.budget_id }, defaults };
}

// ── writes ──────────────────────────────────────────────────────────

const profileInput = z.object({
  name: z.string().trim().min(1),
  serverUrl: z.string().trim().min(1),
  budgetId: z.string().trim().min(1),
  serverPassword: z.string().optional().default(""),
  encryptionPassword: z.string().optional().default(""),
});

async function checkedInput(userId: number, body: unknown, id: number | null): Promise<Result<{ input: z.infer<typeof profileInput> }>> {
  const parsed = profileInput.safeParse(body);
  if (!parsed.success) return fail(400, "profile.errRequired");
  const d = parsed.data;
  try {
    await assertSafeServerUrl(d.serverUrl, { blockPrivate: config.blockPrivateActualHosts });
  } catch {
    return fail(400, "profile.errServerUrl");
  }
  const dup = profiles.findByOwnerServerBudget(userId, d.serverUrl, d.budgetId);
  if (dup && dup.id !== id) return fail(409, "profile.errDuplicate");
  return { ok: true, input: d };
}

/** A blank server password falls back to the configured default (never echoed). */
export async function createProfile(userId: number, body: unknown): Promise<Result<{ id: number }>> {
  const checked = await checkedInput(userId, body, null);
  if (!checked.ok) return checked;
  const d = checked.input;
  const serverPassword = d.serverPassword.length > 0 ? d.serverPassword : config.ACTUAL_SERVER_PASSWORD ?? "";
  if (serverPassword.length === 0) return fail(400, "profile.errServerPw");
  const id = profiles.create({
    ownerUserId: userId,
    name: d.name,
    serverUrl: d.serverUrl,
    budgetId: d.budgetId,
    serverPasswordEnc: encrypt(serverPassword),
    encryptionPasswordEnc: d.encryptionPassword.length > 0 ? encrypt(d.encryptionPassword) : null,
  });
  return { ok: true, id };
}

/** Blank secret fields keep the stored values. */
export async function updateProfile(userId: number, id: number, body: unknown): Promise<Result<{ id: number }>> {
  if (!profiles.getOwned(id, userId)) return fail(404, "not_found");
  const checked = await checkedInput(userId, body, id);
  if (!checked.ok) return checked;
  const d = checked.input;
  profiles.update(id, {
    name: d.name,
    serverUrl: d.serverUrl,
    budgetId: d.budgetId,
    serverPasswordEnc: d.serverPassword.length > 0 ? encrypt(d.serverPassword) : undefined,
    encryptionPasswordEnc: d.encryptionPassword.length > 0 ? encrypt(d.encryptionPassword) : undefined,
  });
  invalidateAccountsCache(id);
  return { ok: true, id };
}
