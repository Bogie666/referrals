-- ============================================================
-- LEX Referral App — V2 Migration
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- ── New columns on customers ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_referral_code ON customers(referral_code);

-- ── Referral tiers (based on referred job value) ──
CREATE TABLE IF NOT EXISTS referral_tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  min_job_value NUMERIC(10,2) NOT NULL,
  max_job_value NUMERIC(10,2),                    -- NULL = unlimited (top tier)
  payout_amount NUMERIC(10,2) NOT NULL,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default tiers
INSERT INTO referral_tiers (label, min_job_value, max_job_value, payout_amount) VALUES
  ('Bronze',    75.00,   350.00,   25.00),
  ('Silver',   350.01,   750.00,   50.00),
  ('Gold',     750.01,  1500.00,   75.00),
  ('Platinum', 1500.01,  NULL,    100.00)
ON CONFLICT DO NOTHING;

-- ── Admin users ──
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('super_admin', 'admin', 'viewer')),
  active        BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Payouts ──
CREATE TABLE IF NOT EXISTS payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id     UUID NOT NULL REFERENCES referrals(id),
  admin_user_id   UUID REFERENCES admin_users(id),
  amount          NUMERIC(10,2) NOT NULL,
  payment_method  TEXT NOT NULL
                    CHECK (payment_method IN ('physical_card', 'virtual_card')),
  reference_note  TEXT,
  paid_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_referral ON payouts(referral_id);

-- ── New column on referrals: tier_id ──
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES referral_tiers(id);

-- ── Remove old Tango columns from referrals ──
ALTER TABLE referrals DROP COLUMN IF EXISTS tango_order_id;
ALTER TABLE referrals DROP COLUMN IF EXISTS tango_sent_at;

-- ── System settings (key-value store) ──
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO system_settings (key, value) VALUES
  ('min_job_value', '150'),
  ('new_customer_discount', '50')
ON CONFLICT (key) DO NOTHING;

-- ── Backfill: set invite_sent_at for customers who already got invites ──
-- (any customer with total_referrals > 0 or who has texts_log entries)
UPDATE customers SET invite_sent_at = created_at
WHERE invite_sent_at IS NULL
  AND id IN (SELECT DISTINCT customer_id FROM texts_log WHERE customer_id IS NOT NULL);
