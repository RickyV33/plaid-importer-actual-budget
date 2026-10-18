// JSON endpoints the app reads and writes through. Every handler is owner-scoped
// via the session; failures answer `{ error: "<catalog key or code>" }`.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { bannersFor } from "../api/banners.js";
import { connectionsFor } from "../api/connections.js";
import { acknowledgeOrphan, clampOffset, historyFor, orphansFor } from "../api/history.js";
import { overviewFor } from "../api/overview.js";
import { createProfile, profileFormFor, profilesFor, updateProfile } from "../api/profiles.js";
import type { Result } from "../api/result.js";
import { createSchedule, scheduleFormFor, schedulesFor, toggleSchedule, updateSchedule } from "../api/schedules.js";
import { setInitialHistory, setRegistrationSecret, setSyncLimit, settingsFor } from "../api/settings.js";
import { currentUser, requireAdmin, requireUserId } from "../auth/middleware.js";
import { config } from "../config.js";
import { safeTimeZone } from "../insights/time.js";
import { formatVersion } from "../version.js";

const version = formatVersion(config.appVersion);

type Query = { tz?: string; offset?: string };
type IdParams = { id: string };

const tzOf = (req: FastifyRequest<{ Querystring: Query }>) => safeTimeZone(req.query.tz);
const idOf = (req: FastifyRequest<{ Params: IdParams }>) => Number.parseInt(req.params.id, 10);

/** Sends a write's result: the payload on success, else its status and error key. */
function reply<T extends object>(res: FastifyReply, result: Result<T>, ok: (r: T) => unknown = (r) => r) {
  if (!result.ok) return res.code(result.status).send({ error: result.error });
  const { ok: _ok, ...payload } = result;
  return res.send(ok(payload as unknown as T));
}

export function registerApiRoutes(app: FastifyInstance): void {
  const warn = (obj: object, msg: string) => app.log.warn(obj, msg);

  // ── who's signed in, and the banners every page shows ─────────────
  app.get("/api/me", async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.code(401).send({ error: "unauthenticated" });
    return res.send({ username: user.username, isAdmin: user.role === "admin", version });
  });

  app.get("/api/banners", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send({ banners: bannersFor(userId) });
  });

  // ── pages ─────────────────────────────────────────────────────────
  app.get<{ Querystring: Query }>("/api/overview", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send(overviewFor(userId, currentUser(req)?.role === "admin", Date.now(), tzOf(req)));
  });

  app.get("/api/connections", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send(connectionsFor(userId, Date.now()));
  });

  app.get("/api/profiles", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send(await profilesFor(userId, warn));
  });

  app.get("/api/profiles/new", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send(profileFormFor(userId, null));
  });

  app.get<{ Params: IdParams }>("/api/profiles/:id", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    const form = profileFormFor(userId, idOf(req));
    return form ? res.send(form) : res.code(404).send({ error: "not_found" });
  });

  app.post("/api/profiles", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return reply(res, await createProfile(userId, req.body));
  });

  app.put<{ Params: IdParams }>("/api/profiles/:id", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return reply(res, await updateProfile(userId, idOf(req), req.body));
  });

  app.get<{ Querystring: Query }>("/api/schedules", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send(schedulesFor(userId, Date.now(), tzOf(req)));
  });

  app.get("/api/schedules/new", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send(scheduleFormFor(userId, null));
  });

  app.get<{ Params: IdParams }>("/api/schedules/:id", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    const form = scheduleFormFor(userId, idOf(req));
    return form ? res.send(form) : res.code(404).send({ error: "not_found" });
  });

  app.post("/api/schedules", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return reply(res, createSchedule(userId, req.body));
  });

  app.put<{ Params: IdParams }>("/api/schedules/:id", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return reply(res, updateSchedule(userId, idOf(req), req.body));
  });

  app.post<{ Params: IdParams }>("/api/schedules/:id/toggle", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return reply(res, toggleSchedule(userId, idOf(req)));
  });

  app.get<{ Querystring: Query }>("/api/history", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    return res.send(historyFor(userId, clampOffset(req.query.offset), Date.now(), tzOf(req)));
  });

  app.post<{ Params: IdParams }>("/api/history/orphans/:id/ack", async (req, res) => {
    const userId = requireUserId(req, res);
    if (userId === undefined) return;
    if (!acknowledgeOrphan(userId, idOf(req))) return res.code(404).send({ error: "not_found" });
    return res.send({ orphans: orphansFor(userId) });
  });

  // ── admin settings ────────────────────────────────────────────────
  app.get("/api/settings", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    return res.send(settingsFor());
  });

  const settingsWrite = (path: string, write: (body: unknown) => Result) =>
    app.put(`/api/settings/${path}`, async (req, res) => {
      if (!requireAdmin(req, res)) return;
      return reply(res, write(req.body), () => settingsFor());
    });
  settingsWrite("registration-secret", setRegistrationSecret);
  settingsWrite("sync-limit", setSyncLimit);
  settingsWrite("initial-history", setInitialHistory);
}
