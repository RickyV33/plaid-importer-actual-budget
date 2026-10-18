// Connection-health incidents for the app-wide banners: a budget whose latest
// sync couldn't reach Actual, a budget whose latest sync hit import errors, and
// a bank that needs relinking. Built from stored results only, so showing them
// costs no Plaid or Actual calls; they clear once a later run succeeds.

export type HealthKind = "actual_unreachable" | "relink" | "import_failed";

export type HealthIncident = {
  kind: HealthKind;
  /** Names this incident (not just the condition), so a dismissal hides only it. */
  key: string;
  /** The budget or bank the banner names. */
  subject: string;
};

const UNREACHABLE = "actual_unreachable";

export function healthIncidents(
  latest: { profile_id: number | null; sync_run_id: number; status: string; reason: string | null }[],
  profiles: { id: number; name: string }[],
  relinkItems: { id: string; institution_name: string | null; updated_at: number }[],
  unknownBank: string,
): HealthIncident[] {
  const names = new Map(profiles.map((p) => [p.id, p.name]));
  const failures = new Map<number, { runId: number; unreachable: boolean }>();
  for (const r of latest) {
    if (r.profile_id === null || r.status !== "failure") continue;
    const seen = failures.get(r.profile_id);
    const unreachable = (r.reason ?? "").startsWith(UNREACHABLE);
    failures.set(r.profile_id, { runId: r.sync_run_id, unreachable: (seen?.unreachable ?? false) || unreachable });
  }

  const unreachable: HealthIncident[] = [];
  const failed: HealthIncident[] = [];
  for (const [profileId, f] of failures) {
    const subject = names.get(profileId);
    if (subject === undefined) continue;
    if (f.unreachable) unreachable.push({ kind: "actual_unreachable", key: `health:actual:${profileId}:${f.runId}`, subject });
    else failed.push({ kind: "import_failed", key: `health:import:${profileId}:${f.runId}`, subject });
  }
  const relink = relinkItems.map((i) => ({
    kind: "relink" as const,
    key: `health:relink:${i.id}:${i.updated_at}`,
    subject: i.institution_name ?? unknownBank,
  }));

  // Errors before warnings.
  return [...unreachable, ...relink, ...failed];
}
