import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import fastifyFormbody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import fastifyRateLimit from "@fastify/rate-limit";

import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { initCredentials } from "./auth/credentials.js";
import { authPreHandler } from "./auth/middleware.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerLinkRoutes } from "./routes/link.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerHistoryRoutes } from "./routes/history.js";
import { registerHomeRoute } from "./routes/home.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare module "fastify" {
  interface Session {
    authed?: boolean;
    user?: string;
  }
}

async function build() {
  const app = Fastify({
    trustProxy: 1,
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          "req.body.password",
          'res.headers["set-cookie"]',
          "access_token",
          "*.access_token",
          "password",
          "*.password",
        ],
        censor: "[REDACTED]",
      },
      ...(config.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : {}),
    },
  });

  await app.register(fastifyFormbody);
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: config.SESSION_SECRET,
    cookieName: "plaid_importer_sid",
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
      path: "/",
    },
    saveUninitialized: false,
  });
  await app.register(fastifyRateLimit, { global: false });

  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/static/",
  });

  app.get("/healthz", async (_req, reply) => {
    return reply.send({ ok: true });
  });

  app.addHook("preHandler", authPreHandler);

  await registerAuthRoutes(app);
  registerHomeRoute(app);
  registerLinkRoutes(app);
  registerAccountRoutes(app);
  registerSyncRoutes(app);
  registerHistoryRoutes(app);

  return app;
}

async function main() {
  runMigrations();
  await initCredentials();

  const app = await build();
  await app.listen({ port: config.APP_PORT, host: config.APP_BIND });
}

main().catch((err) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
