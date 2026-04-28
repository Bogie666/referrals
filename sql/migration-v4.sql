-- ============================================================
-- LEX Referral App — V4 Migration
-- Removes the membership-only flat payout introduced in v3.
-- The payout rule is now simply percentage-of-invoice with a cap.
-- Run this in Supabase SQL Editor AFTER migration-v3.sql.
-- ============================================================

DELETE FROM system_settings WHERE key IN (
  'membership_flat',
  'membership_item_codes'
);
