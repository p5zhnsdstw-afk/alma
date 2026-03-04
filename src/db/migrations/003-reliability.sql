-- Reliability migration: nudge rate limiting persistence + episodes indexes.
-- Part of MVP C hardening for production-grade delivery.

-- Persistent nudge counts (replaces in-memory Map) — NBR-1 compliance survives restarts
CREATE TABLE IF NOT EXISTS nudge_counts (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,  -- YYYY-MM-DD in user's timezone
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Index for delivery scheduler: find due deliveries fast
CREATE INDEX IF NOT EXISTS idx_deliveries_scheduler
  ON deliveries(status, deliver_at)
  WHERE status IN ('scheduled', 'delivered');

-- Index for follow-up processing
CREATE INDEX IF NOT EXISTS idx_deliveries_followup
  ON deliveries(status, next_followup_at)
  WHERE status = 'delivered' AND next_followup_at IS NOT NULL;

-- Index for expiration processing
CREATE INDEX IF NOT EXISTS idx_deliveries_expiry
  ON deliveries(status, expires_at)
  WHERE status = 'delivered';

-- Index for episodes (conversation memory)
CREATE INDEX IF NOT EXISTS idx_episodes_user_recent
  ON episodes(user_id, created_at DESC);
