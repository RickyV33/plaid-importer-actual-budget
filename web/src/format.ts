// Locale-aware number, percent, day and time formatting. Pure, so it is unit-tested.

export function formatNumber(n: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
}

export function formatPercent(share: number, locale: string): string {
  const digits = share > 0 && share < 0.1 ? 1 : 0;
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(share);
}

// Day keys ("YYYY-MM-DD") are calendar dates: format them at UTC midnight so
// the viewer's zone can't shift them to the neighbouring day.
const fromKey = (key: string) => new Date(`${key}T00:00:00Z`);

export const formatDay = (key: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(fromKey(key));

export const formatWeekday = (key: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(fromKey(key));

export const formatTime = (ms: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(ms));

export const formatDateTime = (ms: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 hours ago", "in 5 hours": the largest unit that fits. */
export function formatRelative(ms: number, now: number, locale: string): string {
  const secs = (ms - now) / 1000;
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of STEPS) if (Math.abs(secs) >= size) return rel.format(Math.round(secs / size), unit);
  return rel.format(Math.round(secs / 60), "minute");
}
