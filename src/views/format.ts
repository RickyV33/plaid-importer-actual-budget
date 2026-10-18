// Locale- and zone-aware formatters handed to every template as `it.fmt`, so
// numbers and dates read the same way on every page.

export type Format = {
  num: (n: number) => string;
  pct: (share: number) => string;
  /** A "YYYY-MM-DD" day key, e.g. "Oct 19". */
  day: (key: string) => string;
  /** Weekday for a day key, e.g. "Mon". */
  weekday: (key: string) => string;
  /** Wall-clock time of an instant in the viewer's zone, e.g. "7:00 AM". */
  time: (ms: number) => string;
  dateTime: (ms: number) => string;
};

export function makeFormat(locale: string, tz: string): Format {
  const num = new Intl.NumberFormat(locale);
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  // Day keys are calendar dates, so format them as UTC midnight to avoid shifting.
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  const fromKey = (key: string) => new Date(`${key}T00:00:00Z`);
  return {
    num: (n) => num.format(n),
    pct: (share) => pct.format(share),
    day: (key) => day.format(fromKey(key)),
    weekday: (key) => weekday.format(fromKey(key)),
    time: (ms) => time.format(new Date(ms)),
    dateTime: (ms) => dateTime.format(new Date(ms)),
  };
}
