import path from "node:path";
import { fileURLToPath } from "node:url";

import { Eta } from "eta";
import type { FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.js";
import { clientMessages, LOCALE_COOKIE, resolveLocale, translator, type Translate } from "../i18n/index.js";
import { bannersFor } from "../api/banners.js";
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

/** A banner ready for the layout: its message resolved, and an optional link to the fix. */
type ShownBanner = { key: string; type: string; message: string; href?: string | undefined; linkLabel?: string | undefined };

function shownBanners(userId: number, t: Translate): ShownBanner[] {
  return bannersFor(userId).map((b) => ({
    key: b.key,
    type: b.type,
    message: t(b.message, { ...b.vars, name: b.vars?.name || t("health.unknownBank") }),
    href: b.href,
    linkLabel: b.link ? t(b.link) : undefined,
  }));
}

export function render(
  reply: FastifyReply,
  template: string,
  data: Record<string, unknown> = {},
): FastifyReply {
  const locale = resolveLocale(reply.request?.headers["accept-language"], reply.request?.cookies?.[LOCALE_COOKIE]);
  const t = translator(locale);

  const userId = reply.request?.session?.userId as number | undefined;
  const banners = userId ? shownBanners(userId, t) : [];

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

