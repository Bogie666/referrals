-- ============================================================
-- LEX Referral App — Supabase Schema
-- Run this in your Supabase SQL Editor to set up the database
-- ============================================================

-- CUSTOMERS
-- Synced from ServiceTitan when a job completes.
-- Each customer gets one unique referral slug (e.g. /r/sarah-m-4f2a)
CREATE TABLE IF NOT EXISTS customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  st_customer_id    TEXT UNIQUE NOT NULL,         -- ServiceTitan customer ID
  name              TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  referral_slug     TEXT UNIQUE NOT NULL,         -- e.g. "sarah-m-4f2a"
  referral_link     TEXT NOT NULL,                -- full URL e.g. https://lexair.com/referral?r=sarah-m-4f2a
  total_referrals   INTEGER DEFAULT 0,
  total_rewards     NUMERIC(10,2) DEFAULT 0.00,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- REFERRALS
-- Created when a referred friend clicks a referral link and books.
-- Validated when the referred friend's job is marked complete in ST.
CREATE TABLE IF NOT EXISTS referrals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id         UUID NOT NULL REFERENCES customers(id),
  referred_name       TEXT,                          -- captured at booking
  referred_phone      TEXT,                          -- captured at booking
  referred_email      TEXT,
  referred_st_id      TEXT,                          -- ST customer ID once they book
  referred_job_id     TEXT,                          -- ST job ID of their first completed job
  referred_job_value  NUMERIC(10,2),                 -- job total, used for threshold check
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending',      -- link clicked, not yet booked
                          'booked',       -- booked but job not yet complete
                          'completed',    -- job complete, awaiting reward validation
                          'rewarded',     -- gift card sent successfully
                          'rejected'      -- job below threshold or fraud flag
                        )),
  rejection_reason    TEXT,
  chiirp_text_sent    BOOLEAN DEFAULT FALSE,
  chiirp_text_sent_at TIMESTAMPTZ,
  reward_amount       NUMERIC(10,2) DEFAULT 75.00,   -- referrer reward
  tango_order_id      TEXT,                          -- Tango Card order reference
  tango_sent_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- JOB EVENTS
-- Raw log of every ST webhook received. Useful for debugging.
CREATE TABLE IF NOT EXISTS job_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  st_job_id     TEXT NOT NULL,
  st_customer_id TEXT,
  event_type    TEXT,                                -- e.g. "job.completed"
  payload       JSONB,                               -- full raw webhook body
  processed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- TEXTS_LOG
-- Tracks every Chiirp message sent so we don't double-text.
CREATE TABLE IF NOT EXISTS texts_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES customers(id),
  referral_id   UUID REFERENCES referrals(id),
  phone         TEXT,
  message       TEXT,
  chiirp_msg_id TEXT,                               -- Chiirp's message ID for status tracking
  status        TEXT DEFAULT 'sent',
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- INDEXES for fast lookups
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_st_id    ON customers(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_slug     ON customers(referral_slug);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status   ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_st_id    ON referrals(referred_st_id);
CREATE INDEX IF NOT EXISTS idx_job_events_job_id  ON job_events(st_job_id);

-- ──────────────────────────────────────────
-- AUTO-UPDATE updated_at timestamps
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
