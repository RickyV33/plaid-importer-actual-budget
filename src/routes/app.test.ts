import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import Fastify from "fastify";

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = path.join(os.tmpdir(), `plaid-importer-app-${process.pid}.db`);

const { devShell, registerAppRoutes } = await import("./app.js");
const { PAGES, pageUrl } = await import("../pages.js");

test("devShell: loads modules from the Vite dev server, with the React refresh preamble", () => {
  const html = devShell(
    '<html><head><title>x</title></head><body><script type="module" src="/src/main.tsx"></script></body></html>',
    "http://localhost:5173/",
  );
  assert.match(html, /src="http:\/\/localhost:5173\/static\/app\/src\/main\.tsx"/);
  assert.match(html, /http:\/\/localhost:5173\/static\/app\/@vite\/client/);
  assert.match(html, /@react-refresh/);
  assert.ok(html.indexOf("@react-refresh") < html.indexOf("</head>"));
});

test("every page URL is answered by the app shell", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  await registerAppRoutes(app);
  for (const page of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
    const url = pageUrl(page, { id: 3 });
    const res = await app.inject({ method: "GET", url });
    // 200 with a build in dist/web, 503 (asking for one) without; never a 404.
    assert.ok(res.statusCode === 200 || res.statusCode === 503, `${url} → ${res.statusCode}`);
  }
});
