// Calendar-day helpers in a viewer's time zone. Day keys are "YYYY-MM-DD".

/** The zone if `Intl` accepts it, otherwise UTC. */
export function safeTimeZone(raw: string | undefined | null): string {
  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

const keyFormats = new Map<string, Intl.DateTimeFormat>();

/** The calendar day an instant falls on in `tz`. */
export function dayKey(ms: number, tz: string): string {
  let fmt = keyFormats.get(tz);
  if (!fmt) {
    // en-CA formats dates as YYYY-MM-DD.
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    keyFormats.set(tz, fmt);
  }
  return fmt.format(new Date(ms));
}

/** `n` consecutive day keys ending with today (in `tz`), oldest first. */
export function lastDays(now: number, n: number, tz: string): string[] {
  const [y, m, d] = dayKey(now, tz).split("-").map(Number) as [number, number, number];
  const keys: string[] = [];
  // Once the local date is known, stepping days is plain calendar arithmetic.
  for (let i = n - 1; i >= 0; i--) keys.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  return keys;
}

/** `n` consecutive day keys starting today (in `tz`). */
export function nextDays(now: number, n: number, tz: string): string[] {
  const [y, m, d] = dayKey(now, tz).split("-").map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}
