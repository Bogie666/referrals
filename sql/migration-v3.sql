-- ============================================================
-- LEX Referral App — V3 Migration
-- Switches payouts from fixed tiers to percentage-of-invoice
-- with an absolute cap, plus a flat membership-only payout.
-- Run this in Supabase SQL Editor AFTER migration-v2.sql
-- ============================================================

-- Seed new payout settings (idempotent)
INSERT INTO system_settings (key, value) VALUES
  ('payout_percentage',     '5'),
  ('payout_cap',            '250'),
  ('membership_flat',       '25'),
  -- Comma-separated item codes/names that identify a membership SKU
  -- on a ServiceTitan invoice. Match is case-insensitive against the
  -- line item code or name.
  ('membership_item_codes', 'Cool Club 1 System,Cool Club 2-3 Systems,Cool Club 4-5 Systems,Cool Club 6+ Systems')
ON CONFLICT (key) DO NOTHING;

-- The referral_tiers table is retired in favor of the settings above.
-- It is intentionally NOT dropped: existing referrals.tier_id values
-- remain valid for historical reporting. New referrals will leave
-- tier_id NULL.
