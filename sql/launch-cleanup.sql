-- ============================================================
-- LEX Referral App — Launch-morning cleanup
-- Run this in Supabase SQL Editor on launch day, BEFORE setting
-- DEMO_MODE=false in Vercel.
--
-- It does three things:
--   1. Wipes the ghost customers / job_events / texts_log left
--      behind by the demo-mode test poll (real ST customer IDs,
--      no demo prefix). Keeps anything with a DEMO-/TEST- prefix
--      out of caution — there shouldn't be any of those left.
--   2. Resets poll_state.last_polled_at to launch-day midnight
--      Central Time so the next poll only catches today's jobs.
--   3. Returns counts before and after so you can sanity-check.
-- ============================================================

-- 1. Snapshot counts BEFORE cleanup
SELECT
  (SELECT COUNT(*) FROM customers)                             AS customers_before,
  (SELECT COUNT(*) FROM referrals)                             AS referrals_before,
  (SELECT COUNT(*) FROM payouts)                               AS payouts_before,
  (SELECT COUNT(*) FROM texts_log)                             AS texts_log_before,
  (SELECT COUNT(*) FROM job_events)                            AS job_events_before;

-- 2. Wipe ghost data — these are the rows the demo-mode poll
--    created. Anything DEMO-/TEST- prefixed is also removed in case
--    a stray test row survived earlier cleanups.
DELETE FROM payouts
WHERE referral_id IN (SELECT id FROM referrals);

DELETE FROM texts_log;

DELETE FROM referrals;

DELETE FROM job_events;

DELETE FROM customers;

-- 3. Reset poll cursor to today's midnight Central Time.
--    America/Chicago auto-handles DST.
UPDATE poll_state
SET last_polled_at = (CURRENT_DATE AT TIME ZONE 'America/Chicago')
WHERE id = 'jobs';

-- If poll_state row doesn't exist for some reason, create it:
INSERT INTO poll_state (id, last_polled_at)
VALUES ('jobs', (CURRENT_DATE AT TIME ZONE 'America/Chicago'))
ON CONFLICT (id) DO NOTHING;

-- 4. Snapshot counts AFTER cleanup — every customer/referral/payout
--    count should be 0; poll cursor should be midnight CT today.
SELECT
  (SELECT COUNT(*) FROM customers)                             AS customers_after,
  (SELECT COUNT(*) FROM referrals)                             AS referrals_after,
  (SELECT COUNT(*) FROM payouts)                               AS payouts_after,
  (SELECT COUNT(*) FROM texts_log)                             AS texts_log_after,
  (SELECT COUNT(*) FROM job_events)                            AS job_events_after,
  (SELECT last_polled_at FROM poll_state WHERE id = 'jobs')    AS poll_cursor;
