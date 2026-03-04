-- Reverse lookup: when an unregistered contact replies to Alma,
-- find which family they belong to.

CREATE TABLE IF NOT EXISTS delivery_phones (
  phone TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  contact_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
