-- Master database schema: users, families, billing, referrals
-- This DB is shared. Per-family data lives in separate SQLite files (D-10).

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial', -- trial, alma, familia
  trial_ends_at DATETIME,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id),
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary', -- primary, partner, member
  language TEXT NOT NULL DEFAULT 'es',
  timezone TEXT NOT NULL DEFAULT 'America/Guayaquil',
  briefing_time TEXT DEFAULT '06:30', -- HH:MM for morning briefing
  onboarding_step INTEGER DEFAULT 0, -- 0=not started, -1=complete
  -- Calendar sync config (per-member, D-20)
  calendar_provider TEXT, -- 'google', 'apple', null (WhatsApp-only mode)
  calendar_external_id TEXT, -- Google calendar ID or Apple CalDAV URL
  calendar_token TEXT, -- OAuth refresh token (encrypted)
  calendar_last_sync DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_family_id TEXT NOT NULL REFERENCES families(id),
  referred_family_id TEXT REFERENCES families(id),
  referred_phone TEXT, -- before they sign up
  status TEXT NOT NULL DEFAULT 'pending', -- pending, active, churned
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id TEXT NOT NULL REFERENCES families(id),
  event_type TEXT NOT NULL, -- payment, refund, churn, upgrade, downgrade
  amount_cents INTEGER,
  paddle_event_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cost tracking per user per month (Pre-mortem FM-3: margin squeeze prevention)
CREATE TABLE IF NOT EXISTS usage_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  month TEXT NOT NULL, -- YYYY-MM
  llm_tokens_in INTEGER DEFAULT 0,
  llm_tokens_out INTEGER DEFAULT 0,
  llm_cost_cents INTEGER DEFAULT 0,
  whatsapp_conversations INTEGER DEFAULT 0,
  whatsapp_cost_cents INTEGER DEFAULT 0,
  UNIQUE(user_id, month)
);
