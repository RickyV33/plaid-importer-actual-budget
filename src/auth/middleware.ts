import type { FastifyReply, FastifyRequest } from "fastify";

const ALLOWLIST_EXACT: ReadonlySet<string> = new Set([
  "GET /login",
  "POST /login",
]);

const ALLOWLIST_PREFIX: readonly string[] = ["/static/"];

export async function authPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawPath = req.url.split("?")[0] ?? "";
  const key = `${req.method} ${rawPath}`;
  if (ALLOWLIST_EXACT.has(key)) return;

  if (ALLOWLIST_PREFIX.some((p) => rawPath.startsWith(p))) return;

  if (req.session?.authed === true) return;

  const next = encodeURIComponent(req.url);
  reply.redirect(`/login?next=${next}`);
}

export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}
