// Which language to show, by the same rule as the server's sign-in pages: the
// `lang` cookie if it names a supported language, else the browser's languages.

import { DEFAULT_LOCALE, LOCALE_COOKIE, SUPPORTED_LOCALES, type Locale } from "../../../src/i18n/index";

export function initialLang(cookie: string, languages: readonly string[]): Locale {
  const chosen = cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1];
  if (chosen && (SUPPORTED_LOCALES as string[]).includes(chosen)) return chosen as Locale;
  for (const l of languages) {
    const base = l.toLowerCase().split("-")[0] ?? "";
    if ((SUPPORTED_LOCALES as string[]).includes(base)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}

export function langCookie(lang: Locale): string {
  return `${LOCALE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
