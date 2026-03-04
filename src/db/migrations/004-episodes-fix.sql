-- Fix episodes table schema: rename summary→content, key_decisions→role
-- For existing family DBs that ran old 001-family.sql migration.
-- New DBs already have the correct schema from the updated 001-family.sql.

-- SQLite doesn't support DROP/RENAME COLUMN in older versions.
-- Safe approach: create new table, migrate data, swap.

CREATE TABLE IF NOT EXISTS episodes_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing data if old table has the old columns
INSERT OR IGNORE INTO episodes_new (id, user_id, role, content, created_at)
  SELECT id, user_id, 'user', COALESCE(summary, ''), created_at
  FROM episodes
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('episodes') WHERE name = 'summary');

-- Also handle case where episodes already has correct schema (new DBs)
INSERT OR IGNORE INTO episodes_new (id, user_id, role, content, created_at)
  SELECT id, user_id, role, content, created_at
  FROM episodes
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('episodes') WHERE name = 'role');

DROP TABLE IF EXISTS episodes;
ALTER TABLE episodes_new RENAME TO episodes;
