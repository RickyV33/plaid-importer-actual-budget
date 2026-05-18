import crypto from "node:crypto";

import {
  CountryCode,
  Products,
  type AccountBase,
  type LinkTokenCreateRequest,
} from "plaid";

import { config } from "../config.js";
import { plaid } from "./client.js";

export type ExchangeResult = {
  itemId: string;
  accessToken: string;
  institutionId: string | null;
  institutionName: string | null;
  accounts: AccountBase[];
};

export async function createLinkToken(): Promise<{ link_token: string }> {
  const req: LinkTokenCreateRequest = {
    user: { client_user_id: stableClientUserId() },
    client_name: "plaid-importer",
    products: config.products.map((p) => p as Products),
    country_codes: config.countryCodes.map((c) => c as CountryCode),
    language: config.PLAID_LANGUAGE,
    ...(config.redirectUri !== undefined ? { redirect_uri: config.redirectUri } : {}),
  };

  const res = await plaid.linkTokenCreate(req);
  return { link_token: res.data.link_token };
}

export async function createUpdateLinkToken(accessToken: string): Promise<{ link_token: string }> {
  // Update mode: omit `products`, include `access_token`. Plaid Link will only
  // surface the re-authentication flow for this item — no institution picker.
  const req: LinkTokenCreateRequest = {
    user: { client_user_id: stableClientUserId() },
    client_name: "plaid-importer",
    country_codes: config.countryCodes.map((c) => c as CountryCode),
    language: config.PLAID_LANGUAGE,
    access_token: accessToken,
    ...(config.redirectUri !== undefined ? { redirect_uri: config.redirectUri } : {}),
  };

  const res = await plaid.linkTokenCreate(req);
  return { link_token: res.data.link_token };
}

export async function exchangePublicToken(publicToken: string): Promise<ExchangeResult> {
  const exchange = await plaid.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;

  const [itemRes, accountsRes] = await Promise.all([
    plaid.itemGet({ access_token: accessToken }),
    plaid.accountsGet({ access_token: accessToken }),
  ]);

  const institutionId = itemRes.data.item.institution_id ?? null;
  let institutionName: string | null = null;
  if (institutionId !== null) {
    try {
      const inst = await plaid.institutionsGetById({
        institution_id: institutionId,
        country_codes: config.countryCodes.map((c) => c as CountryCode),
      });
      institutionName = inst.data.institution.name;
    } catch {
      institutionName = null;
    }
  }

  return {
    itemId,
    accessToken,
    institutionId,
    institutionName,
    accounts: accountsRes.data.accounts,
  };
}

export async function fetchAccounts(accessToken: string): Promise<AccountBase[]> {
  const res = await plaid.accountsGet({ access_token: accessToken });
  return res.data.accounts;
}

export async function removeItem(accessToken: string): Promise<void> {
  await plaid.itemRemove({ access_token: accessToken });
}

function stableClientUserId(): string {
  // Single-user app — derive a stable per-deployment id from the configured user
  // so Plaid sees a consistent identity across Link sessions.
  return crypto.createHash("sha256").update(config.APP_USER).digest("hex").slice(0, 32);
}
