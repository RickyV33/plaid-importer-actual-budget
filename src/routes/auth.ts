import type { FastifyInstance } from "fastify";

import { config } from "../config.js";
import { createUser, verify } from "../auth/credentials.js";
import { safeNextPath } from "../auth/middleware.js";
import { REGISTRATION_SECRET_KEY, settings, users } from "../db/queries.js";
import { render } from "../views/render.js";

export type RegistrationDecision =
  | { ok: true; role: "admin" | "member" }
  | { ok: false; status: number; error: string };

/**
 * Pure registration gate. First-user bootstrap: while no users exist,
 * registration is open and the first user becomes admin. Once any user exists,
 * the stored registration secret is required and new users are members.
 */
export function decideRegistration(args: {
  usersExist: boolean;
  username: string;
  password: string;
  submittedSecret: string;
  expectedSecret: string | undefined;
  usernameTaken: boolean;
}): RegistrationDecision {
  if (args.username.length === 0 || args.password.length === 0) {
    return { ok: false, status: 400, error: "register.errRequired" };
  }
  if (args.usersExist) {
    if (!args.expectedSecret || args.submittedSecret !== args.expectedSecret) {
      return { ok: false, status: 403, error: "register.errSecret" };
    }
  }
  if (args.usernameTaken) {
    return { ok: false, status: 409, error: "register.errTaken" };
  }
  return { ok: true, role: args.usersExist ? "member" : "admin" };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { next?: string } }>("/login", async (req, reply) => {
    const next = safeNextPath(req.query.next);
    return render(reply, "login", {
      title: "Sign in",
      authed: false,
      next,
      errorKey: null,
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
          errorKey: "login.errRequired",
        });
      }

      const user = await verify(username, password);
      if (!user) {
        return render(reply.code(401), "login", {
          title: "Sign in",
          authed: false,
          next,
          errorKey: "login.errInvalid",
        });
      }

      req.session.authed = true;
      req.session.user = user.username;
      req.session.userId = user.id;
      reply.redirect(next);
    },
  );

  app.get("/register", async (_req, reply) => {
    return render(reply, "register", {
      title: "Register",
      authed: false,
      usersExist: users.count() > 0,
      errorKey: null,
    });
  });

  app.post<{
    Body: { username?: string; password?: string; registration_secret?: string };
  }>(
    "/register",
    {
      config: {
        rateLimit: {
          max: config.LOGIN_RATELIMIT_MAX,
          timeWindow: config.LOGIN_RATELIMIT_WINDOW_MS,
        },
      },
    },
    async (req, reply) => {
      const username = (req.body.username ?? "").trim();
      const password = req.body.password ?? "";
      const submittedSecret = req.body.registration_secret ?? "";
      const usersExist = users.count() > 0;

      const decision = decideRegistration({
        usersExist,
        username,
        password,
        submittedSecret,
        expectedSecret: settings.get(REGISTRATION_SECRET_KEY),
        usernameTaken: username.length > 0 && Boolean(users.getByUsername(username)),
      });

      if (!decision.ok) {
        return render(reply.code(decision.status), "register", {
          title: "Register",
          authed: false,
          usersExist,
          errorKey: decision.error,
        });
      }

      await createUser(username, password, decision.role);
      reply.redirect("/login");
    },
  );

  app.post("/logout", async (req, reply) => {
    await req.session.destroy();
    reply.redirect("/login");
  });
}
