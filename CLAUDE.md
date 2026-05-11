# LEX Referral App — Agent Notes

## Launch-day reminder (READ THIS)

If the user says they're ready to go live (or anything similar — "let's launch", "we're going live now", "time to flip the switch"), **before doing anything else, remind them to do these three steps in order**:

1. **Run `sql/launch-cleanup.sql`** in the Supabase SQL editor. It wipes the test-poll ghost rows (customers, referrals, payouts, texts_log, job_events) and resets `poll_state.last_polled_at` to today's midnight Central Time. Confirm the after-counts are all zero.
2. **Set `DEMO_MODE=false`** (or delete the env var) in Vercel → Settings → Environment Variables, then trigger a redeploy. Without this, the cron will still run but every Chiirp text and every ServiceTitan write-back will be intercepted by the demo wrapper and nothing real will happen.
3. **Let the cron take over.** First scheduled run is at 8am CT (`0 13,15,17,19,21,23,1,4 * * *` UTC). If launch is mid-day, the user can manually fire `curl https://lexperks.com/api/cron/poll-jobs -H "x-cron-secret: $CRON_SECRET"` to start without waiting.

Until those three steps are done, the system is in demo mode and won't actually enroll anyone or send anything to real customers.

## Project orientation

- **Vercel app** at `lexperks.com` — Express server (admin dashboard, API, /book, /share, /referral redirect, /api/cron/poll-jobs)
- **WordPress site** at `lexairconditioning.com` — has the `[lex_referral]` and `[lex_referral_portal]` shortcodes from `wordpress/lex-perks.php`. Must be re-uploaded manually after edits.
- **Supabase** — Postgres DB (customers, referrals, payouts, system_settings, etc.). Service-role key in `SUPABASE_SERVICE_KEY`.
- **ServiceTitan** — source of truth for jobs/customers. Polled every 2 hours during business hours via `cron.js`. Custom field `406119043` holds the customer's referral code; `406119323` holds "Referred by Code" set by CSRs at booking.
- **Chiirp** — webhook-driven SMS + email automation. URL in `CHIIRP_WEBHOOK_URL`. Payload includes `first_name`, `last_name`, `phone`, `email`, `referral_code`, `referral_link`.

## Payout rule (current)

`payout_amount = min(invoice_total * payout_percentage / 100, payout_cap)`. Default 5% capped at $250. No special case for memberships (the original $25 flat for membership-only invoices was retired in commit `72be433`). Configured in `system_settings` and editable in `/admin/settings`.

## Referral code format

6 chars from a 32-char unambiguous alphabet (no 0/1/I/O/L). Generated in `src/utils/slugs.js generateUniqueReferralCode`, written to ServiceTitan custom field 406119043 by the poller, used in URLs as `lexperks.com/referral?r=CODE`. Lookups normalize input via `normalizeCode()` so dashes/spaces/case don't matter.

## Eligibility filters (enrollment only)

These gate which customers get enrolled. They do NOT affect referral matching — a friend's job credits the referrer regardless.

- `residential_only` (default `true`) — skip ST customers whose `type !== 'Residential'`.
- `excluded_business_unit_ids` (default `6540, 7698, 7832, 7949, 8087`) — comma-separated ST business unit IDs. Jobs in these BUs don't trigger enrollment.

Both editable in `/admin/settings → Eligibility Filters`.

## Safety rails

- `max_lookback_hours` in `system_settings` (default 24) caps how far back the poller can reach regardless of `poll_state.last_polled_at`. Protects against another "process the entire backlog" surprise.
- Per-poll cap of 500 jobs (hardcoded in `getCompletedJobs`) is a second line of defense.
- `DEMO_MODE=true` short-circuits all Chiirp sends and ServiceTitan writes — nothing leaves the system.

## Common pitfalls

- WordPress plugin (`wordpress/lex-perks.php`) lives in this repo but is deployed manually. Edits won't take effect until re-uploaded to the WP site.
- The external scheduler at `scheduler-mu-three.vercel.app` is responsible for setting custom field 406119323 ("Referred by Code") on the friend's ST customer record at booking time. We can't verify it from this codebase.
- `CRON_SECRET` rotation requires a Vercel redeploy to pick up.
