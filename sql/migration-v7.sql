-- ============================================================
-- LEX Referral App — V7 Migration
-- Adds the customer_events table (used for one-shot Chiirp triggers
-- like re-engagement drip) and seeds the re-engagement settings.
-- Run this in Supabase SQL Editor AFTER migration-v6.sql.
-- ============================================================

-- One row per (customer, event_type). Unique constraint makes the
-- "fire this event at most once per customer" check trivial — try
-- to insert; on 23505 we know it already fired.
CREATE TABLE IF NOT EXISTS customer_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  fired_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_customer_events_customer ON customer_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_type     ON customer_events(event_type);

-- Re-engagement schedule. Comma-separated list of days after enrollment
-- to fire a Chiirp webhook with event="reengage_day_N". Empty = disabled.
INSERT INTO system_settings (key, value) VALUES
  ('reengage_days',         ''),
  ('reengage_max_age_days', '90')
ON CONFLICT (key) DO NOTHING;
