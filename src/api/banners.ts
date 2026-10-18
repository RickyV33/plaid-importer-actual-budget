// Banners for every signed-in page: connection-health incidents first (they
// need action), then the named, admin-configured ones. Each is described by
// catalog keys, so whoever renders it translates it.

import { dismissedBanners, plaidItems, profiles, schedules, syncAccountResults } from "../db/queries.js";
import { healthIncidents, type HealthKind } from "../insights/health.js";

export type BannerType = "info" | "warn" | "error";

export type BannerView = {
  /** Dismissal key, sent to POST /banners/:key/dismiss. */
  key: string;
  type: BannerType;
  /** Catalog key of the message, and the values it interpolates. */
  message: string;
  vars?: Record<string, string>;
  /** Where the fix is, and the catalog key of the link's label. */
  href?: string;
  link?: string;
};

/** Where each health banner sends you, and how it reads. */
const HEALTH: Record<HealthKind, Omit<BannerView, "key" | "vars">> = {
  actual_unreachable: { type: "error", message: "health.actualUnreachable", href: "/profiles", link: "health.fixProfile" },
  relink: { type: "error", message: "health.relink", href: "/connections", link: "health.fixRelink" },
  import_failed: { type: "warn", message: "health.importFailed", href: "/history", link: "health.fixHistory" },
};

/** Named banners that can be active, each with the condition that shows it to a user. */
const NAMED: { key: string; type: BannerType; applies: (userId: number) => boolean }[] = [
  {
    key: "schedule_migration_v1",
    type: "warn",
    applies: (userId) => schedules.listByOwner(userId).some((s) => s.interval_hours !== null && s.days_of_week === null),
  },
];

export function bannersFor(userId: number): BannerView[] {
  let dismissed: Set<string>;
  try {
    dismissed = new Set(dismissedBanners.listByUser(userId).map((b) => b.banner_key));
  } catch {
    return [];
  }
  return [...healthBanners(userId), ...namedBanners(userId)].filter((b) => !dismissed.has(b.key));
}

function healthBanners(userId: number): BannerView[] {
  try {
    const incidents = healthIncidents(
      syncAccountResults.latestForProfilesByOwner(userId),
      profiles.listByOwner(userId),
      plaidItems.listByOwner(userId).filter((i) => i.status === "requires_relink"),
      "",
    );
    return incidents.map((i) => ({
      key: i.key,
      ...HEALTH[i.kind],
      // An unnamed bank reads as "A bank"; the renderer fills it from the catalog.
      vars: { name: i.subject },
    }));
  } catch {
    return [];
  }
}

function namedBanners(userId: number): BannerView[] {
  try {
    return NAMED.filter((b) => b.applies(userId)).map((b) => ({ key: b.key, type: b.type, message: `banners.${b.key}` }));
  } catch {
    return [];
  }
}
