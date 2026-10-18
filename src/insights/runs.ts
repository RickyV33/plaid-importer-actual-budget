// How the runs in a window went.

export type OutcomeSummary = {
  /** Finished runs only; a run still going has no outcome yet. */
  runs: number;
  succeeded: number;
  failed: number;
  /** succeeded / runs, or null when nothing finished (so it never reads as 0% or 100%). */
  rate: number | null;
  imported: number;
};

export function outcomeSummary(runs: { status: string; total_imported: number }[]): OutcomeSummary {
  let succeeded = 0;
  let failed = 0;
  let imported = 0;
  for (const r of runs) {
    imported += r.total_imported;
    if (r.status === "success") succeeded++;
    else if (r.status === "failure") failed++;
  }
  const finished = succeeded + failed;
  return { runs: finished, succeeded, failed, rate: finished ? succeeded / finished : null, imported };
}
