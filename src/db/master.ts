/**
 * Master database — users, families, billing, referrals.
 * Shared across all families. NOT per-family data.
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

export function initMasterDb(dataDir: string): Database.Database {
  const dbPath = resolve(dataDir, "alma-master.db");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations
  const migrationSql = readFileSync(
    new URL("./migrations/001-master.sql", import.meta.url),
    "utf-8",
  );
  db.exec(migrationSql);

  return db;
}
