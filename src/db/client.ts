import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { config } from "../config.js";

let instance: Database.Database | undefined;

export function db(): Database.Database {
  if (instance) return instance;

  const dir = path.dirname(config.DATABASE_PATH);
  fs.mkdirSync(dir, { recursive: true });

  const conn = new Database(config.DATABASE_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.pragma("synchronous = NORMAL");

  instance = conn;
  return conn;
}
