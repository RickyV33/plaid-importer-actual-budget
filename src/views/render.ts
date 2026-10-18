import path from "node:path";
import { fileURLToPath } from "node:url";

import { Eta } from "eta";
import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.js";
import { clientMessages, LOCALE_COOKIE, resolveLocale, translator, type Translate } from "../i18n/index.js";
import { dismissedBanners, plaidItems, profiles, schedules, syncAccountResults } from "../db/queries.js";
import { healthIncidents, type HealthKind } from "../insights/health.js";
import { safeTimeZone } from "../insights/time.js";
import { formatVersion } from "../version.js";
import { makeFormat } from "./format.js";
import { activeTab, TABS } from "./nav.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const eta = new Eta({
  views: __dirname,
  cache: config.NODE_ENV === "production",
});

// Formatted once — the version cannot change while the process runs. Formatting
// happens here rather than in the template so the view stays free of logic.
const displayVersion = formatVersion(config.appVersion);

/** Keys of banners that are currently active in the app. */
const ACTIVE_BANNER_KEYS = ["schedule_migration_v1"] as const;

type Banner = { key: string; type: "info" | "warn" | "error" };

/** A banner ready for the layout: its message resolved, and an optional link to the fix. */
type ShownBanner = Banner & { message: string; href?: string; linkLabel?: string };

const ACTIVE_BANNERS: Banner[] = [
  { key: "schedule_migration_v1", type: "warn" },
];

/** Where each health banner sends you, and the label of that link. */
const HEALTH_FIX: Record<HealthKind, { type: Banner["type"]; href: string; message: string; link: string }> = {
  actual_unreachable: { type: "error", href: "/profiles", message: "health.actualUnreachable", link: "health.fixProfile" },
  relink: { type: "error", href: "/connections", message: "health.relink", link: "health.fixRelink" },
  import_failed: { type: "warn", href: "/history", message: "health.importFailed", link: "health.fixHistory" },
};

/** Connection-health banners first (they need action), then the named ones. */
function getBannersForUser(userId: number, t: Translate): ShownBanner[] {
  let dismissed: Set<string>;
  try {
    dismissed = new Set(dismissedBanners.listByUser(userId).map((b) => b.banner_key));
  } catch {
    return [];
  }
  return [...healthBanners(userId, dismissed, t), ...namedBanners(userId, dismissed, t)];
}

function healthBanners(userId: number, dismissed: Set<string>, t: Translate): ShownBanner[] {
  try {
    const incidents = healthIncidents(
      syncAccountResults.latestForProfilesByOwner(userId),
      profiles.listByOwner(userId),
      plaidItems.listByOwner(userId).filter((i) => i.status === "requires_relink"),
      t("health.unknownBank"),
    );
    return incidents
      .filter((i) => !dismissed.has(i.key))
      .map((i) => {
        const fix = HEALTH_FIX[i.kind];
        return { key: i.key, type: fix.type, message: t(fix.message, { name: i.subject }), href: fix.href, linkLabel: t(fix.link) };
      });
  } catch {
    return [];
  }
}

function namedBanners(userId: number, dismissed: Set<string>, t: Translate): ShownBanner[] {
  try {
    return ACTIVE_BANNERS.filter((b) => {
      if (dismissed.has(b.key)) return false;
      if (b.key === "schedule_migration_v1") {
        return schedules.listByOwner(userId).some((s) => s.interval_hours !== null && s.days_of_week === null);
      }
      return true;
    }).map((b) => ({ ...b, message: t(`banners.${b.key}`) }));
  } catch {
    return [];
  }
}

export function render(
  reply: FastifyReply,
  template: string,
  data: Record<string, unknown> = {},
): FastifyReply {
  const locale = resolveLocale(reply.request?.headers["accept-language"], reply.request?.cookies?.[LOCALE_COOKIE]);
  const t = translator(locale);

  const userId = reply.request?.session?.userId as number | undefined;
  const banners = userId ? getBannersForUser(userId, t) : [];

  const enriched = {
    ...data,
    t,
    locale,
    i18nClient: JSON.stringify(clientMessages(t)),
    banners,
    version: displayVersion,
    tabs: TABS,
    activeTab: activeTab(reply.request?.url),
    fmt: makeFormat(locale, reply.request ? viewerTimeZone(reply.request) : "UTC"),
  };
  const body = eta.render(template, enriched);
  const html = eta.render("layout", { ...enriched, body });
  return reply.type("text/html; charset=utf-8").send(html);
}

/** The viewer's IANA time zone (set by app.js in the `tz` cookie), or UTC. */
export function viewerTimeZone(req: FastifyRequest): string {
  return safeTimeZone(req.cookies?.tz);
}

export function renderPartial(template: string, data: Record<string, unknown> = {}): string {
  return eta.render(template, data);
}

// Re-export active banner keys so routes can reference them without importing DB.
export { ACTIVE_BANNER_KEYS };
