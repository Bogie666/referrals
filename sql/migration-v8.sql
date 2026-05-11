-- ============================================================
-- LEX Referral App — V8 Migration
-- Adds eligibility filters that gate which CUSTOMERS get
-- enrolled (a code generated, written back to ST, Chiirp invite
-- fired). Does NOT gate referral matching — a friend's job will
-- still credit the referrer even if the friend is commercial or
-- in an excluded business unit (the referrer made the referral
-- in good faith).
-- Run this in Supabase SQL Editor AFTER migration-v7.sql.
-- ============================================================

INSERT INTO system_settings (key, value) VALUES
  -- When true, only customers with ST type = 'Residential' are
  -- enrolled. Commercial accounts (and unknown-type records)
  -- are skipped with a log line. Default on.
  ('residential_only',           'true'),
  -- Comma-separated ST business unit IDs whose jobs do NOT
  -- trigger enrollment. Seeded with the BUs LEX flagged as
  -- inappropriate (commercial, warranty, internal, etc.).
  ('excluded_business_unit_ids', '6540,7698,7832,7949,8087')
ON CONFLICT (key) DO NOTHING;
