import path from "node:path";
import { fileURLToPath } from "node:url";

import { Eta } from "eta";
import type { FastifyReply } from "fastify";

import { config } from "../config.js";
import { LOCALE_COOKIE, resolveLocale, translator } from "../i18n/index.js";
import { formatVersion } from "../version.js";

// Server-rendered pages are only the sign-in ones (login, register); every
// signed-in page is the app (routes/app.ts).

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const eta = new Eta({
  views: __dirname,
  cache: config.NODE_ENV === "production",
});

// Formatted once — the version cannot change while the process runs. Formatting
// happens here rather than in the template so the view stays free of logic.
const displayVersion = formatVersion(config.appVersion);

export function render(
  reply: FastifyReply,
  template: string,
  data: Record<string, unknown> = {},
): FastifyReply {
  const locale = resolveLocale(reply.request?.headers["accept-language"], reply.request?.cookies?.[LOCALE_COOKIE]);
  const enriched = { ...data, t: translator(locale), locale, version: displayVersion };
  const body = eta.render(template, enriched);
  const html = eta.render("layout", { ...enriched, body });
  return reply.type("text/html; charset=utf-8").send(html);
}
