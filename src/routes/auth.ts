import type { FastifyInstance } from "fastify";

import { config } from "../config.js";
import { verify } from "../auth/credentials.js";
import { safeNextPath } from "../auth/middleware.js";
import { render } from "../views/render.js";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { next?: string } }>("/login", async (req, reply) => {
    const next = safeNextPath(req.query.next);
    return render(reply, "login", {
      title: "Sign in",
      authed: false,
      next,
      error: null,
    });
  });

  app.post<{
    Body: { username?: string; password?: string; next?: string };
  }>(
    "/login",
    {
      config: {
        rateLimit: {
          max: config.LOGIN_RATELIMIT_MAX,
          timeWindow: config.LOGIN_RATELIMIT_WINDOW_MS,
        },
      },
    },
    async (req, reply) => {
      const next = safeNextPath(req.body.next);
      const username = (req.body.username ?? "").trim();
      const password = req.body.password ?? "";

      if (username.length === 0 || password.length === 0) {
        return render(reply.code(400), "login", {
          title: "Sign in",
          authed: false,
          next,
          error: "Username and password are required.",
        });
      }

      const ok = await verify(username, password);
      if (!ok) {
        return render(reply.code(401), "login", {
          title: "Sign in",
          authed: false,
          next,
          error: "Invalid credentials.",
        });
      }

      req.session.authed = true;
      req.session.user = username;
      reply.redirect(next);
    },
  );

  app.post("/logout", async (req, reply) => {
    await req.session.destroy();
    reply.redirect("/login");
  });
}
