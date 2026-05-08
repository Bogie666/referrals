-- ============================================================
-- LEX Referral App — V6 Migration
-- Adds a safety guardrail on the poller: the maximum number of
-- hours the poll will look back, regardless of poll_state.
-- Without this, a frozen or stale poll_state cursor (e.g. after
-- a long pause or DB restore) would let the next poll drain
-- weeks of historical jobs in one shot.
-- Run this in Supabase SQL Editor AFTER migration-v5.sql.
-- ============================================================

INSERT INTO system_settings (key, value) VALUES
  ('max_lookback_hours', '24')
ON CONFLICT (key) DO NOTHING;
