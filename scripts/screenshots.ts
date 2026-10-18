// Renders every page through its real template with demo data, into static
// HTML files that headless Chrome can capture (see scripts/screenshots.sh).
// No Plaid, Actual, or real database is touched: required settings get dummy
// values before anything is imported, and the database is a throwaway file.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "dist/screens");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-screens-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:8080",
  APP_USER: "demo",
  APP_PASSWORD: "demo",
  SESSION_SECRET: "x".repeat(32),
  PLAID_CLIENT_ID: "demo",
  PLAID_SECRET: "demo",
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
  DATABASE_PATH: path.join(tmp, "screens.db"),
  ACTUAL_CACHE_DIR: path.join(tmp, "actual-cache"),
});

const { render } = await import("../src/views/render.js");
const { demoPages } = await import("./screenshots.demo.js");

/** Just enough of a Fastify reply for `render`: it captures the HTML. */
function fakeReply(url: string) {
  let html = "";
  const reply = {
    request: { url, headers: { "accept-language": "en-US" }, cookies: { tz: "America/Chicago" }, session: {} },
    code: () => reply,
    type: () => reply,
    send: (body: string) => {
      html = body;
      return reply;
    },
  };
  return { reply, html: () => html };
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.resolve("public"), path.join(OUT, "static"), { recursive: true });

for (const page of demoPages(Date.now())) {
  const { reply, html } = fakeReply(page.url);
  render(reply as never, page.template, page.data);
  // Files are opened from disk, so root-relative asset paths become relative.
  fs.writeFileSync(path.join(OUT, `${page.name}.html`), html().replaceAll('"/static/', '"static/'));
  console.log(`rendered ${page.name}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
