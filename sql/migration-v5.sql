-- ============================================================
-- LEX Referral App — V5 Migration
-- Normalize existing referral_codes to dash-free uppercase form.
-- New codes are generated as 6-char alphanumeric (no dashes); this
-- migration strips dashes/spaces from any pre-existing rows so the
-- normalized lookup always finds them.
-- Run this in Supabase SQL Editor AFTER migration-v4.sql.
-- ============================================================

UPDATE customers
SET referral_code = upper(regexp_replace(referral_code, '[^A-Za-z0-9]', '', 'g'))
WHERE referral_code IS NOT NULL
  AND referral_code <> upper(regexp_replace(referral_code, '[^A-Za-z0-9]', '', 'g'));
