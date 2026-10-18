// The shared message catalog (src/i18n) plus locale-bound formatters, through context.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { translator, type Locale } from "../../../src/i18n/index";
import { formatDateTime, formatDay, formatNumber, formatPercent, formatRelative, formatTime, formatWeekday } from "../format";
import { initialLang, langCookie } from "./lang";

export const LANGS: Locale[] = ["en", "es"];

type Vars = Record<string, string | number>;

function makeApi(lang: Locale, setLang: (l: Locale) => void) {
  const t = translator(lang);
  return {
    lang,
    setLang,
    t: (key: string, vars?: Vars) => t(key, vars),
    num: (n: number) => formatNumber(n, lang),
    pct: (share: number) => formatPercent(share, lang),
    day: (key: string) => formatDay(key, lang),
    weekday: (key: string) => formatWeekday(key, lang),
    time: (ms: number) => formatTime(ms, lang),
    dateTime: (ms: number) => formatDateTime(ms, lang),
    relative: (ms: number) => formatRelative(ms, Date.now(), lang),
  };
}

export type I18n = ReturnType<typeof makeApi>;

const Ctx = createContext<I18n>(makeApi("en", () => {}));

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Locale>(() => initialLang(document.cookie, navigator.languages));
  const value = useMemo(() => {
    document.documentElement.lang = lang;
    return makeApi(lang, (l) => {
      // The cookie carries the choice to the server-rendered sign-in pages too.
      document.cookie = langCookie(l);
      setLangState(l);
    });
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
