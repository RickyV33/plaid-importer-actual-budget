import path from "node:path";
import { fileURLToPath } from "node:url";

import { Eta } from "eta";
import type { FastifyReply } from "fastify";

import { config } from "../config.js";
import { clientMessages, resolveLocale, translator } from "../i18n/index.js";
import { dismissedBanners, schedules } from "../db/queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const eta = new Eta({
  views: __dirname,
  cache: config.NODE_ENV === "production",
});

/** Keys of banners that are currently active in the app. */
const ACTIVE_BANNER_KEYS = ["schedule_migration_v1"] as const;

type Banner = { key: string; type: "info" | "warn" | "error" };

const ACTIVE_BANNERS: Banner[] = [
  { key: "schedule_migration_v1", type: "warn" },
];

function getBannersForUser(userId: number): Banner[] {
  try {
    const dismissed = new Set(dismissedBanners.listByUser(userId).map((b) => b.banner_key));
    return ACTIVE_BANNERS.filter((b) => {
      if (dismissed.has(b.key)) return false;
      if (b.key === "schedule_migration_v1") {
        return schedules.listByOwner(userId).some((s) => s.interval_hours !== null && s.days_of_week === null);
      }
      return true;
    });
  } catch {
    return [];
  }
}

export function render(
  reply: FastifyReply,
  template: string,
  data: Record<string, unknown> = {},
): FastifyReply {
  const locale = resolveLocale(reply.request?.headers["accept-language"]);
  const t = translator(locale);

  const userId = reply.request?.session?.userId as number | undefined;
  const banners = userId ? getBannersForUser(userId) : [];

  const enriched = {
    ...data,
    t,
    locale,
    i18nClient: JSON.stringify(clientMessages(t)),
    banners,
  };
  const body = eta.render(template, enriched);
  const html = eta.render("layout", { ...enriched, body });
  return reply.type("text/html; charset=utf-8").send(html);
}

export function renderPartial(template: string, data: Record<string, unknown> = {}): string {
  return eta.render(template, data);
}

// Re-export active banner keys so routes can reference them without importing DB.
export { ACTIVE_BANNER_KEYS };
