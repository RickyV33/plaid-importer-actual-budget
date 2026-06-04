import { en } from "./en.js";
import { es } from "./es.js";

export type Locale = "en" | "es";
export const SUPPORTED_LOCALES: Locale[] = ["en", "es"];
export const DEFAULT_LOCALE: Locale = "en";

const catalogs: Record<Locale, Record<string, string>> = { en, es };

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Resolve the best supported locale from an Accept-Language header. */
export function resolveLocale(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  // Parse "es-ES,es;q=0.9,en;q=0.8" into ordered base languages.
  const ordered = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: (tag ?? "").trim().toLowerCase().split("-")[0] ?? "", q: q ? Number(q) : 1 };
    })
    .filter((e) => e.lang.length > 0)
    .sort((a, b) => b.q - a.q);
  for (const e of ordered) {
    if ((SUPPORTED_LOCALES as string[]).includes(e.lang)) return e.lang as Locale;
  }
  return DEFAULT_LOCALE;
}

/** Build a translator for a locale, with English fallback and {param} interpolation. */
export function translator(locale: Locale): Translate {
  const primary = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  const fallback = catalogs[DEFAULT_LOCALE];
  return (key, params) => {
    const template = primary[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_m, p: string) =>
      params[p] === undefined ? `{${p}}` : String(params[p]),
    );
  };
}

/** Keys safe to expose to client-side JS (alerts, dynamic result messages). */
export const CLIENT_KEYS: string[] = [
  "common.networkError",
  "home.syncing",
  "home.skippedItem",
  "home.thisConnection",
  "home.linkTokenError",
  "home.exchangeFailed",
  "home.pickAccount",
  "home.syncFailed",
  "home.syncResult",
  "home.skipped",
  "home.plaidExited",
  "home.removeConfirm",
  "home.removeFailed",
  "home.relinkTokenError",
  "home.mappingSaveError",
  "home.pendingUpdateError",
  "home.deleteProfileConfirm",
  "home.deleteProfileFailed",
  "home.pendingOn",
  "home.pendingOff",
  "schedules.deleteConfirm",
  "schedules.deleteFailed",
];

export function clientMessages(t: Translate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CLIENT_KEYS) out[k] = t(k);
  return out;
}
