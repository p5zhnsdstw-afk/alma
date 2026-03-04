-- Per-family database schema (D-10: filesystem-level isolation)
-- One of these per family. Contains all household-specific data.

-- Alma's internal calendar (source of truth)
-- External calendars sync INTO here. Briefings read FROM here.
-- Works with or without external sync (WhatsApp-only mode as fallback).
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  external_id TEXT, -- Google/Apple calendar event ID (null if Alma-created)
  external_source TEXT, -- 'google', 'apple', null (Alma-native)
  user_id TEXT NOT NULL, -- which family member this belongs to
  title TEXT NOT NULL,
  description TEXT,
  start_at DATETIME NOT NULL,
  end_at DATETIME,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  recurrence TEXT, -- RRULE string (RFC 5545)
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed, tentative, cancelled
  synced_at DATETIME, -- last time synced with external calendar
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external ON calendar_events(external_id, external_source)
  WHERE external_id IS NOT NULL;

-- Items captured via WhatsApp (voice notes, texts, quick captures)
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, -- who captured it
  type TEXT NOT NULL, -- task, event, reminder, note
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, done, dismissed
  due_at DATETIME,
  recurrence TEXT, -- cron-like pattern for recurring items
  assigned_to TEXT, -- user_id of family member
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Home profile — appliances, systems, structural elements
CREATE TABLE IF NOT EXISTS home_profile (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- hvac, plumbing, electrical, appliance, structural
  name TEXT NOT NULL, -- "HVAC System", "Water Heater", "Dishwasher"
  brand TEXT,
  model TEXT,
  install_date DATE,
  warranty_expires DATE,
  location TEXT, -- "Kitchen", "Basement", "Master Bathroom"
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance log — what was done, when, by whom
CREATE TABLE IF NOT EXISTS maintenance_log (
  id TEXT PRIMARY KEY,
  home_item_id TEXT REFERENCES home_profile(id),
  action TEXT NOT NULL, -- "Filter replaced", "Annual inspection", "Repaired"
  cost_cents INTEGER,
  provider TEXT, -- "DIY", "ABC Plumbing"
  performed_at DATE NOT NULL,
  next_due DATE, -- when this action needs to happen again
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance schedule — upcoming preventive tasks
CREATE TABLE IF NOT EXISTS maintenance_schedule (
  id TEXT PRIMARY KEY,
  home_item_id TEXT REFERENCES home_profile(id),
  task TEXT NOT NULL, -- "Replace HVAC filter", "Flush water heater"
  frequency_days INTEGER NOT NULL, -- every N days
  last_done DATE,
  next_due DATE NOT NULL,
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
  notified_at DATETIME, -- last time user was nudged about this
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Family preferences and learned context
CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversation episodes (for context continuity)
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL, -- message content (max 2000 chars)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
