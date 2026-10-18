// Turns a server error code into words. Codes that are catalog keys translate
// directly; the Plaid and network codes map to their messages; anything else
// gets a generic message that still names the code.

import type { I18n } from "./i18n";

const CODES: Record<string, string> = {
  network: "errors.network",
  plaid_link_token_failed: "home.linkTokenError",
  plaid_exchange_failed: "errors.exchange",
  plaid_refresh_accounts_failed: "errors.refreshAccounts",
  plaid_item_remove_failed: "home.removeFailed",
  account_not_deselected: "home.accountRemoveFailed",
  actual_unreachable: "home.actualUnreachable",
  actual_account_not_found: "home.mappingSaveError",
  sync_failed: "errors.sync",
  unreachable: "profile.budgetsError",
  password_required: "profile.errServerPw",
  invalid_url: "profile.errServerUrl",
  not_found: "errors.notFound",
  forbidden: "errors.forbidden",
};

export function errorText(t: I18n["t"], code: string, vars: Record<string, string | number> = {}): string {
  const key = CODES[code] ?? code;
  const text = t(key, vars);
  return text === key ? t("errors.generic", { code }) : text;
}
