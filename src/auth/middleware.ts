import type { FastifyReply, FastifyRequest } from "fastify";

import { users, type UserRow } from "../db/queries.js";

const ALLOWLIST_EXACT: ReadonlySet<string> = new Set([
  "GET /login",
  "POST /login",
  "GET /register",
  "POST /register",
  "GET /healthz",
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

/** Resolve the authenticated user from the session, or undefined. */
export function currentUser(req: FastifyRequest): UserRow | undefined {
  const id = req.session?.userId;
  if (typeof id !== "number") return undefined;
  return users.getById(id);
}

/**
 * Require the authenticated user to be the given id (or any owner check). Returns
 * the user id, asserting it is present. The auth pre-handler guarantees a session
 * exists for protected routes, but the session may predate the userId field.
 */
export function requireUserId(req: FastifyRequest, reply: FastifyReply): number | undefined {
  const id = req.session?.userId;
  if (typeof id !== "number") {
    reply.redirect("/login");
    return undefined;
  }
  return id;
}

/** Guard that requires the current user to be an admin; replies 403 otherwise. */
export function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): UserRow | undefined {
  const user = currentUser(req);
  if (!user || user.role !== "admin") {
    reply.code(403).send({ error: "forbidden" });
    return undefined;
  }
  return user;
}
