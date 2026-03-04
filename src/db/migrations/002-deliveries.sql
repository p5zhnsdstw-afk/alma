-- MVP C "La Que Manda" — delivery lifecycle + family contacts
-- Per-family DB: tracks messages from sender → recipient via Alma

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,              -- who requested the delivery (usually primary)
  recipient_id TEXT,                     -- resolved user_id (NULL if unregistered contact)
  recipient_name TEXT NOT NULL,          -- raw name from extraction ("Pedro")
  recipient_phone TEXT,                  -- phone if known
  message_body TEXT NOT NULL,            -- the actual message content
  original_text TEXT NOT NULL,           -- raw input from sender for audit trail
  status TEXT NOT NULL DEFAULT 'pending', -- pending/scheduled/delivered/confirmed/expired/failed
  deliver_at DATETIME,                   -- when to deliver (NULL = immediate)
  delivered_at DATETIME,                 -- when actually sent
  delivery_wa_message_id TEXT,           -- WhatsApp message ID (for reply routing)
  confirmed_at DATETIME,
  confirmation_text TEXT,                -- what the recipient said back
  followup_count INTEGER DEFAULT 0,
  max_followups INTEGER DEFAULT 2,
  next_followup_at DATETIME,
  expires_at DATETIME,                   -- auto-expire 24h after delivery
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deliveries_scheduled
  ON deliveries(deliver_at) WHERE status IN ('pending', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_deliveries_followup
  ON deliveries(next_followup_at) WHERE status = 'delivered' AND next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_recipient_phone
  ON deliveries(recipient_phone) WHERE status = 'delivered';
CREATE INDEX IF NOT EXISTS idx_deliveries_sender
  ON deliveries(sender_id);

-- Family contacts — bridges "Pedro" (a name) to a phone number.
-- Populated during onboarding (ASKED_FAMILY) and lazily when deliveries happen.
CREATE TABLE IF NOT EXISTS family_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                    -- display name ("Pedro")
  name_normalized TEXT NOT NULL,         -- lowercase, no accents, for matching
  phone TEXT,                            -- WhatsApp number (NULL until collected)
  user_id TEXT,                          -- linked Alma user_id if registered
  relationship TEXT,                     -- "hijo", "esposo", "hermana" etc.
  opted_out INTEGER DEFAULT 0,           -- 1 if recipient said "parar"/"stop"
  first_contacted INTEGER DEFAULT 0,     -- 1 after first message sent (for intro)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name_normalized)
);
