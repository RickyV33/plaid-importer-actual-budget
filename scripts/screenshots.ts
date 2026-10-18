// Writes a static copy of the app with demo API responses, for screenshots:
//   <out>/static/        public/ (stylesheet, fonts)
//   <out>/static/app/    the built app (dist/web; run `npm run build` first)
//   <out>/api/<name>.json  demo responses (scripts/screenshots.demo.ts)
// scripts/screenshots_server.py serves it like Fastify would, and
// scripts/screenshots.sh captures each page with headless Chrome.

import fs from "node:fs";
import path from "node:path";

import { demoApi } from "./screenshots.demo.js";

const OUT = path.resolve(process.argv[2] ?? "dist/screens");
const BUILT = path.resolve("dist/web");
if (!fs.existsSync(path.join(BUILT, "index.html"))) {
  console.error("dist/web is missing: run `npm run build` first.");
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "api"), { recursive: true });
fs.cpSync(path.resolve("public"), path.join(OUT, "static"), { recursive: true });
fs.cpSync(BUILT, path.join(OUT, "static", "app"), { recursive: true });
for (const [name, body] of Object.entries(demoApi(Date.now()))) {
  fs.writeFileSync(path.join(OUT, "api", `${name}.json`), JSON.stringify(body));
}
console.log(`wrote ${OUT}`);
