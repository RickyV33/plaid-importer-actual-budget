// The signed-in app: its built files under /static/app/, and its shell
// (index.html) for every page URL, behind the auth gate like any other route.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

import { config } from "../config.js";
import { PAGES } from "../pages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Two levels up from src/routes (tsx) and from dist/routes (built) alike.
const ROOT = path.resolve(__dirname, "..", "..");
export const APP_BUILD_DIR = path.join(ROOT, "dist", "web");
export const APP_BASE = "/static/app/";

// Dev-only, so English only: says why the page is blank when Vite isn't up.
function viteMissingHtml(viteOrigin: string): string {
  return `<div class="shell"><div class="notice error" role="alert"><div class="notice-body">The app's dev server isn't answering at ${viteOrigin}. Start the <code>dev: app (vite)</code> task (or <code>npm run dev:web</code>), or run <code>dev: all</code>, then reload.</div></div></div>`;
}

/**
 * In dev the shell loads the app's modules from the Vite dev server (Vite's
 * backend integration), so pages, API, cookies, and redirects all stay on this
 * origin. In production it is the built index.html.
 */
export function devShell(template: string, viteOrigin: string): string {
  const base = `${viteOrigin.replace(/\/$/, "")}${APP_BASE}`;
  const preamble = `<script type="module">
import RefreshRuntime from "${base}@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>
<script>
function viteMissing() {
  var show = function () {
    document.getElementById("root").innerHTML = ${JSON.stringify(viteMissingHtml(viteOrigin))};
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", show) : show();
}
</script>
<script type="module" src="${base}@vite/client" onerror="viteMissing()"></script>`;
  return template
    .replace("</head>", `${preamble}\n</head>`)
    .replace(/src="\/src\/main\.tsx"/, `src="${base}src/main.tsx"`);
}

function loadShell(): () => string {
  if (config.VITE_DEV_SERVER) {
    const template = path.join(ROOT, "web", "index.html");
    return () => devShell(fs.readFileSync(template, "utf8"), config.VITE_DEV_SERVER);
  }
  const built = path.join(APP_BUILD_DIR, "index.html");
  let cached: string | undefined;
  return () => (cached ??= fs.readFileSync(built, "utf8"));
}

export async function registerAppRoutes(app: FastifyInstance): Promise<void> {
  if (fs.existsSync(APP_BUILD_DIR)) {
    await app.register(fastifyStatic, { root: APP_BUILD_DIR, prefix: APP_BASE, decorateReply: false });
  }
  const shell = loadShell();
  for (const url of Object.values(PAGES)) {
    app.get(url, async (_req, reply) => {
      let html: string;
      try {
        html = shell();
      } catch {
        return reply.code(503).type("text/plain").send("The app hasn't been built yet: run `npm run build`.");
      }
      return reply.type("text/html; charset=utf-8").header("cache-control", "no-store").send(html);
    });
  }
}
