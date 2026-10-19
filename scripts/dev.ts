// `npm run dev`: the Vite dev server (the app's modules and hot reload, :5173)
// and the server (tsx watch, :8080) loading the app from it. Open :8080.
// Ctrl-C stops both; if either one exits, the other is stopped too.

import { spawn, type ChildProcess } from "node:child_process";

const viteOrigin = process.env.VITE_DEV_SERVER || "http://localhost:5173";

function start(cmd: string, args: string[], env: Record<string, string> = {}): ChildProcess {
  return spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
}

const children = [
  start("vite", ["--config", "web/vite.config.ts"]),
  start("tsx", ["watch", "src/server.ts"], { VITE_DEV_SERVER: viteOrigin }),
];

let stopping = false;
function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  process.exitCode = code;
}

for (const child of children) child.on("exit", (code) => stopAll(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => stopAll(0));
