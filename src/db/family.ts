/**
 * Per-family SQLite database manager (D-10).
 * Each family gets its own .db file for filesystem-level isolation.
 * Runs all pending migrations on open (not just on creation).
 */

import Database from "better-sqlite3";
import { resolve, join } from "node:path";
import { mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";

const familyDbs = new Map<string, Database.Database>();

/** All family-scoped migration files, sorted by name */
function getFamilyMigrations(): Array<{ name: string; sql: string }> {
  const migrationsDir = new URL("./migrations/", import.meta.url);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.match(/^\d+-(?!master).*\.sql$/))
    .sort();

  return files.map((name) => ({
    name,
    sql: readFileSync(new URL(`./migrations/${name}`, import.meta.url), "utf-8"),
  }));
}

function runPendingMigrations(db: Database.Database): void {
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

  for (const migration of getFamilyMigrations()) {
    if (applied.has(migration.name)) continue;

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(migration.name);
    })();
  }
}

export function getFamilyDb(dataDir: string, familyId: string): Database.Database {
  const cached = familyDbs.get(familyId);
  if (cached) return cached;

  const familiesDir = resolve(dataDir, "families");
  mkdirSync(familiesDir, { recursive: true });

  const dbPath = join(familiesDir, `${familyId}.db`);
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runPendingMigrations(db);

  familyDbs.set(familyId, db);
  return db;
}

export function closeFamilyDb(familyId: string): void {
  const db = familyDbs.get(familyId);
  if (db) {
    db.close();
    familyDbs.delete(familyId);
  }
}

/** Close all open family databases with WAL checkpoint. */
export function closeAllFamilyDbs(): number {
  let closed = 0;
  for (const [familyId, db] of familyDbs) {
    try {
      db.pragma("wal_checkpoint(RESTART)");
      db.close();
      closed++;
    } catch {
      // Best effort — DB may already be closed
    }
    familyDbs.delete(familyId);
  }
  return closed;
}
