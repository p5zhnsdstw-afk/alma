/**
 * Master database — users, families, billing, referrals.
 * Shared across all families. NOT per-family data.
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

/** All master-scoped migration files, sorted by name */
function getMasterMigrations(): Array<{ name: string; sql: string }> {
  const migrationsDir = new URL("./migrations/", import.meta.url);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.match(/^\d+-master.*\.sql$/))
    .sort();

  return files.map((name) => ({
    name,
    sql: readFileSync(new URL(`./migrations/${name}`, import.meta.url), "utf-8"),
  }));
}

export function initMasterDb(dataDir: string): Database.Database {
  const dbPath = resolve(dataDir, "alma-master.db");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Migration tracking
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  );

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>).map(
      (r) => r.name,
    ),
  );

  for (const migration of getMasterMigrations()) {
    if (applied.has(migration.name)) continue;

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(migration.name);
    })();
  }

  return db;
}
