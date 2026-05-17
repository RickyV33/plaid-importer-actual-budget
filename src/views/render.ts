import path from "node:path";
import { fileURLToPath } from "node:url";

import { Eta } from "eta";
import type { FastifyReply } from "fastify";

import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const eta = new Eta({
  views: __dirname,
  cache: config.NODE_ENV === "production",
});

export function render(
  reply: FastifyReply,
  template: string,
  data: Record<string, unknown> = {},
): FastifyReply {
  const body = eta.render(template, data);
  const html = eta.render("layout", { ...data, body });
  return reply.type("text/html; charset=utf-8").send(html);
}

export function renderPartial(template: string, data: Record<string, unknown> = {}): string {
  return eta.render(template, data);
}
