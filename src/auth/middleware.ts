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

/** The app's data calls: answered with 401 JSON so the client can send the viewer to sign in. */
const API_PREFIX = "/api/";

function rejectUnauthenticated(req: FastifyRequest, reply: FastifyReply): void {
  if ((req.url.split("?")[0] ?? "").startsWith(API_PREFIX)) {
    reply.code(401).send({ error: "unauthenticated" });
    return;
  }
  reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
}

export async function authPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawPath = req.url.split("?")[0] ?? "";
  const key = `${req.method} ${rawPath}`;
  if (ALLOWLIST_EXACT.has(key)) return;

  if (ALLOWLIST_PREFIX.some((p) => rawPath.startsWith(p))) return;

  if (req.session?.authed === true) return;

  rejectUnauthenticated(req, reply);
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
    rejectUnauthenticated(req, reply);
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
