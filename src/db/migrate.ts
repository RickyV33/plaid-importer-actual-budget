import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  const conn = db();

  conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    conn
      .prepare<[], { version: string }>("SELECT version FROM schema_migrations")
      .all()
      .map((r) => r.version),
  );

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    const apply = conn.transaction(() => {
      conn.exec(sql);
      conn
        .prepare(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        )
        .run(version, Date.now());
    });
    apply();
    process.stdout.write(`migrated: ${version}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
