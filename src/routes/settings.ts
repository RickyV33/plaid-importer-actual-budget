import type { FastifyInstance } from "fastify";

import { requireAdmin } from "../auth/middleware.js";
import { REGISTRATION_SECRET_KEY, settings } from "../db/queries.js";
import { render } from "../views/render.js";

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get("/settings", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return render(reply, "settings", {
      title: "Settings",
      authed: true,
      isAdmin: true,
      secretSet: Boolean(settings.get(REGISTRATION_SECRET_KEY)),
      saved: false,
      error: null,
    });
  });

  app.post<{ Body: { registration_secret?: string } }>(
    "/settings",
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const secret = (req.body.registration_secret ?? "").trim();
      if (secret.length === 0) {
        return render(reply.code(400), "settings", {
          title: "Settings",
          authed: true,
          isAdmin: true,
          secretSet: Boolean(settings.get(REGISTRATION_SECRET_KEY)),
          saved: false,
          error: "Registration secret cannot be empty.",
        });
      }
      settings.set(REGISTRATION_SECRET_KEY, secret);
      return render(reply, "settings", {
        title: "Settings",
        authed: true,
        isAdmin: true,
        secretSet: true,
        saved: true,
        error: null,
      });
    },
  );
}
