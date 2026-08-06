/**
 * How the app learns which version it is running.
 *
 * `VERSION` at the repo root is the single source of truth (deploy.sh bumps and
 * tags it). Production gets the value baked in as APP_VERSION by the image;
 * local dev reads the file directly so `npm run dev` reports the real version
 * with no setup.
 */

/** Last-resort version when neither the env var nor the VERSION file answers. */
export const FALLBACK_VERSION = "dev";

/**
 * Resolve the running version: APP_VERSION → VERSION file → "dev".
 *
 * `readVersionFile` is injected so the precedence is testable without touching
 * the filesystem. It may throw (missing/unreadable file) — that is swallowed and
 * treated as "no answer", because a version lookup must never stop startup.
 */
export function resolveVersion(
  env: { APP_VERSION?: string | undefined },
  readVersionFile: () => string,
): string {
  const fromEnv = env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;

  try {
    const fromFile = readVersionFile().trim();
    if (fromFile) return fromFile;
  } catch {
    // Absent in the container image by design — fall through.
  }

  return FALLBACK_VERSION;
}

/**
 * Format a version for display: `2.8.0` → `v2.8.0`, but `dev` → `dev`.
 *
 * The `v` prefix is only applied to versions that start with a digit; prefixing
 * unconditionally would render the fallback as "vdev", which reads as a typo.
 */
export function formatVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}
