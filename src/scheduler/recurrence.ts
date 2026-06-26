const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function makeDateFmt(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function makeWdFmt(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
}

function makeHMFmt(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getHM(fmt: Intl.DateTimeFormat, ms: number): number {
  const parts = fmt.formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** Convert a local "YYYY-MM-DD" + hour + minute to a UTC epoch ms, DST-safe. */
function localToUtc(dateStr: string, hour: number, minute: number, timezone: string): number {
  const parts = dateStr.split("-").map(Number);
  const [y, mo, d] = [parts[0]!, parts[1]!, parts[2]!];
  const hmFmt = makeHMFmt(timezone);
  const target = hour * 60 + minute;

  // Initial guess: treat local time as UTC
  const guess = Date.UTC(y, mo - 1, d, hour, minute);
  const first = guess + (target - getHM(hmFmt, guess)) * 60_000;

  // One correction pass handles DST transitions
  const diff = target - getHM(hmFmt, first);
  return diff === 0 ? first : first + diff * 60_000;
}

/**
 * Compute the next UTC epoch ms at which a day-of-week recurring schedule should fire.
 *
 * @param daysOfWeek  0=Sun … 6=Sat
 * @param timeOfDay   "HH:MM" 24h local time
 * @param repeatWeeks 1=weekly, 2=every other week, etc.
 * @param timezone    IANA timezone string
 * @param anchor      epoch ms of the most recent run (or schedule creation time)
 */
export function nextOccurrence(
  daysOfWeek: number[],
  timeOfDay: string,
  repeatWeeks: number,
  timezone: string,
  anchor: number,
): number {
  if (daysOfWeek.length === 0) throw new Error("daysOfWeek must not be empty");

  const daySet = new Set(daysOfWeek);
  const [hour, minute] = timeOfDay.split(":").map(Number);

  const dateFmt = makeDateFmt(timezone);
  const wdFmt = makeWdFmt(timezone);

  const getDateStr = (ms: number) => dateFmt.format(new Date(ms));
  const getWeekday = (ms: number) => WEEKDAY_SHORT[wdFmt.format(new Date(ms))] ?? 0;

  // Anchor date parts — use UTC noon to stay well clear of DST midnight boundaries
  const anchorDateStr = getDateStr(anchor);
  const anchorParts = anchorDateStr.split("-").map(Number);
  const [ay, am, ad] = [anchorParts[0]!, anchorParts[1]!, anchorParts[2]!];
  const anchorNoon = Date.UTC(ay, am - 1, ad, 12, 0);
  const anchorWeekday = getWeekday(anchorNoon);

  // UTC noon of the Sunday that starts the anchor's week
  const anchorWeekSunNoon = anchorNoon - anchorWeekday * 86_400_000;

  const MAX_DAYS = 14 * repeatWeeks + 7;

  for (let delta = 1; delta <= MAX_DAYS; delta++) {
    const candidateNoon = anchorNoon + delta * 86_400_000;
    const candidateDateStr = getDateStr(candidateNoon);
    const candidateWeekday = getWeekday(candidateNoon);

    if (!daySet.has(candidateWeekday)) continue;

    // For bi-weekly+: check that the candidate falls in an "on week".
    // An on-week is one whose Sunday is an exact multiple of repeatWeeks*7 days
    // after the anchor's Sunday.
    if (repeatWeeks > 1) {
      const candidateWeekSunNoon = candidateNoon - (candidateWeekday ?? 0) * 86_400_000;
      const weeksDiff = Math.round((candidateWeekSunNoon - anchorWeekSunNoon) / (7 * 86_400_000));
      if (weeksDiff % repeatWeeks !== 0) continue;
    }

    const result = localToUtc(candidateDateStr, hour ?? 9, minute ?? 0, timezone);
    if (result > anchor) return result;
  }

  throw new Error("nextOccurrence: no occurrence found within search window");
}
