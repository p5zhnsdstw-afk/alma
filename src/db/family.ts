/**
 * Per-family SQLite database manager (D-10).
 * Each family gets its own .db file for filesystem-level isolation.
 */

import Database from "better-sqlite3";
import { resolve, join } from "node:path";
import { mkdirSync, readFileSync, existsSync } from "node:fs";

const familyDbs = new Map<string, Database.Database>();

export function getFamilyDb(dataDir: string, familyId: string): Database.Database {
  const cached = familyDbs.get(familyId);
  if (cached) return cached;

  const familiesDir = resolve(dataDir, "families");
  mkdirSync(familiesDir, { recursive: true });

  const dbPath = join(familiesDir, `${familyId}.db`);
  const isNew = !existsSync(dbPath);
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (isNew) {
    const migrationSql = readFileSync(
      new URL("./migrations/001-family.sql", import.meta.url),
      "utf-8",
    );
    db.exec(migrationSql);
  }

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
