-- ============================================================
-- Migration: Add poller support
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add referral_code column to customers
-- (separate from referral_slug — this is the short human code e.g. "SARAH-1917")
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS referral_code    TEXT,
  ADD COLUMN IF NOT EXISTS invite_sent_at   TIMESTAMPTZ;

-- Unique index on referral_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_referral_code
  ON customers(referral_code)
  WHERE referral_code IS NOT NULL;

-- poll_state table — tracks last successful poll timestamp
-- so the poller knows where to pick up from on each run
CREATE TABLE IF NOT EXISTS poll_state (
  id             TEXT PRIMARY KEY,   -- e.g. 'jobs'
  last_polled_at TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial poll state (poller will update this on first run)
INSERT INTO poll_state (id, last_polled_at)
VALUES ('jobs', NOW() - INTERVAL '2 hours')
ON CONFLICT (id) DO NOTHING;
