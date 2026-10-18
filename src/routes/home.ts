import type { FastifyInstance } from "fastify";

import { connectionsFor } from "../api/connections.js";
import { overviewFor } from "../api/overview.js";
import { profilesFor } from "../api/profiles.js";
import { currentUser, requireUserId } from "../auth/middleware.js";
import { render, viewerTimeZone } from "../views/render.js";

export function registerHomeRoute(app: FastifyInstance): void {
  // Landing dashboard: a read-only, local-only summary. No Plaid or Actual calls.
  app.get("/", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const isAdmin = currentUser(req)?.role === "admin";
    return render(reply, "dashboard", {
      title: "plaid-importer",
      authed: true,
      isAdmin,
      ...overviewFor(userId, isAdmin, Date.now(), viewerTimeZone(req)),
    });
  });

  // Connections page: no per-profile Actual lookups.
  app.get("/connections", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    return render(reply, "connections", {
      title: "plaid-importer",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      ...connectionsFor(userId, Date.now()),
    });
  });

  // Profiles page: includes the per-profile Actual fetch for the mapping selects.
  app.get("/profiles", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    return render(reply, "profiles", {
      title: "plaid-importer",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      ...(await profilesFor(userId, (obj, msg) => app.log.warn(obj, msg))),
    });
  });
}
