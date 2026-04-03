# LEX Referral System — Production Lifecycle & Build Plan

**Purpose:** Complete lifecycle of the referral system from the perspective of a new customer completing a job, through to an office admin closing out a payout. Also documents what needs to be built, what gaps exist in the current code, and recommended improvements.

---

## Current State vs. Production Target

Before the lifecycle, a quick summary of what is already built versus what still needs to happen for production:

| Area | Current State | Production Target |
|---|---|---|
| ServiceTitan webhook (job completed) | ✅ Built | Minor hardening needed |
| Referral link generation | ✅ Built | Add short code alongside URL slug |
| Chiirp outbound text | ✅ Built | Fix invite deduplication bug |
| Customer portal (web) | ✅ Built | Keep as-is |
| Admin dashboard (read) | ✅ Built | Keep as-is |
| Mark as rewarded (manual) | ✅ Built | Replace with formal payout workflow |
| Tango Card integration | ✅ Built | **Remove entirely** |
| Payout tracking | ❌ Not built | New `payouts` table + UI |
| Referral tiers | ❌ Not built | New `tiers` table + admin config UI |
| Admin user management | ❌ Not built | Multi-user auth with roles |
| Booking bridge (referral → ST) | ❌ Not built | **Critical gap — see below** |
| Admin settings panel | ❌ Not built | Tier config, system settings |

---

## The Complete Lifecycle

### Phase 1 — Customer Completes a Job

**Trigger:** A technician marks a job as complete in ServiceTitan.

**Step 1.1 — ServiceTitan fires a webhook**
ServiceTitan sends a `job.completed` event to our app's webhook endpoint (`POST /webhooks/servicetitan`). The app immediately returns `200 OK` to ST so it doesn't retry, then processes the event asynchronously.

**Step 1.2 — App creates or updates the customer record**
The app looks up the customer in Supabase by their ServiceTitan customer ID. If they don't exist yet, a new record is created. If they already exist (repeat customer), their record is updated. Either way, the customer now has a unique referral slug and a full referral link stored on their record.

> **Referral code format:** The current system generates a URL slug like `sarah-m-4f2a` which becomes `lexair.com/referral?r=sarah-m-4f2a`. For production, a **short human-readable code** should also be generated (e.g. `SARAH-4F2A`) so customers can share it verbally or type it manually — not just click a link. Both the URL and the short code should be stored and functional.

**Step 1.3 — App checks if this customer was themselves a referred customer**
Before sending anything, the app checks whether the customer who just completed a job was referred by someone else. If yes, that referral record gets updated — see Phase 4 for how that plays out.

**Step 1.4 — Chiirp sends the referral invite text**
After the customer record is created/confirmed, the app calls the Chiirp API to send the customer a text message with their personal referral link and short code.

Example text:
> *"Hey Sarah! Thanks for choosing LEX Air Conditioning. Know someone who needs AC, heating, plumbing, or electrical work? Share your personal code SARAH-4F2A or link lexair.com/referral?r=sarah-m-4f2a — when they complete their first service you get $75 and they save $50! Reply STOP to opt out."*

> **⚠️ Bug in current code:** The invite is only sent when `customer.total_referrals === 0`. This checks whether the customer has made zero referrals, not whether they've already been texted. A customer who referred people before the system launched would never receive their invite. This needs to be replaced with an `invite_sent_at` timestamp field on the customer record — only send the invite if `invite_sent_at IS NULL`.

> **Improvement:** On repeat completed jobs for the same customer, do not re-send the invite. A customer who has five completed jobs over two years should only get the invite once. The `invite_sent_at` field handles this.

---

### Phase 2 — Customer Shares Their Code

**This phase is entirely customer-driven — no system action required.**

The customer receives their text and can share their referral link or short code through any channel they choose: text message, Facebook, Nextdoor, word of mouth. The WordPress portal at `lexair.com/my-referrals` is available for them to look up their link and stats at any time by entering their phone number.

> **Improvement:** Consider a second text sent 7 days after the invite if the customer has not yet generated any referral clicks. A gentle nudge: *"Hey Sarah — just a reminder that your LEX referral link is waiting! lexair.com/referral?r=sarah-m-4f2a"*. This would be an optional follow-up sequence and is not in the current build.

---

### Phase 3 — Referred Friend Clicks the Link and Books

**Step 3.1 — Friend lands on the referral landing page**
When the friend clicks Sarah's link, they land on `lexair.com/referral?r=sarah-m-4f2a`. The WordPress shortcode reads the `r=` parameter, calls our API to look up Sarah by slug, and renders a personalized page: *"Sarah Mitchell thinks you'd love LEX Air Conditioning — here's $50 off your first service."*

**Step 3.2 — App records the click**
The landing page calls `POST /api/referral/click` with the slug. The app creates a `pending` referral record. This is how we track that Sarah's link was clicked even if the friend doesn't book immediately.

> **⚠️ Bug in current code:** Every page load or refresh calls the click endpoint and creates a new `pending` referral record. One friend visiting the page three times creates three records. This needs to check for an existing pending referral from the same source before inserting.

**Step 3.3 — Friend calls or books online**
The friend calls (972) 466-1917 or books through the website. This is where **the booking bridge** becomes critical.

> **⚠️ Critical gap — The Booking Bridge:**
> When a friend books, their referral code needs to travel into ServiceTitan so the system can later connect their completed job back to Sarah. There are two options:
>
> **Option A — Phone booking:** The CSR taking the call asks *"Were you referred by someone?"* and enters the referral code into a custom field on the ST customer or booking record. The ST webhook then includes this field when the job completes.
>
> **Option B — Online booking:** If using the ServiceTitan online booking widget, the referral slug from the URL needs to be passed into the booking form as a hidden field, which then maps to the ST custom field.
>
> **This is the most important production gap.** Without it, the system cannot automatically connect a completed job back to the referrer. Everything else in the flow depends on this working. The ST custom field name should be `referralCode` (or `referralSlug` as currently used in the webhook handler). This requires a configuration step inside ServiceTitan — a custom field needs to be created on the booking/customer record and the CSR team needs to be trained to ask for and enter codes on phone bookings.

---

### Phase 4 — Referred Friend's Job Completes

**Step 4.1 — ST fires another webhook**
When the referred friend's job is marked complete, ServiceTitan fires another `job.completed` event to our app. This time the payload should include the referral code in a custom field.

**Step 4.2 — App matches the job to the referral**
The app reads the referral code from the webhook payload, looks up the referrer (Sarah) by that code, and finds the existing referral record. It then checks two things:

1. **Job value threshold** — Is the job total over the minimum ($150 by default)? If not, the referral is marked `rejected` with the reason logged.
2. **Duplicate check** — Has this referred customer already triggered a reward before? Each referred person can only generate one reward.

**Step 4.3 — Referral is marked `completed`**
If the job meets the threshold, the referral record is updated to `completed` status with the job value and job ID stored. No reward is sent yet — this is the manual payout step.

**Step 4.4 — Tier is evaluated**
At this point, the system looks up Sarah's lifetime qualified referral count and determines which **reward tier** applies. For example:
- Tier 1 (1–3 lifetime referrals): $50 per referral
- Tier 2 (4–6 lifetime referrals): $75 per referral
- Tier 3 (7+ lifetime referrals): $100 per referral

The applicable tier and payout amount are stored on the referral record at the time it completes, so future tier changes don't affect already-qualified referrals.

> **This tier system does not exist in the current code.** There is a single flat `REFERRER_REWARD` environment variable. A `referral_tiers` table and admin UI for managing tiers need to be built.

---

### Phase 5 — Office Receives the Alert and Processes the Payout

**Step 5.1 — Dashboard alert appears**
The admin dashboard shows an amber alert banner on both the Overview and Referrals tabs: *"X referrals need a payout — review now."* The Referrals tab has a `completed` filter with a count badge.

**Step 5.2 — Admin reviews the referral**
The admin clicks into the completed referral and sees:
- Referrer name, phone, email
- Referred friend's name and job total
- The tier that applied and the calculated payout amount
- A notes field for any context

**Step 5.3 — Admin sends the payment**
This is fully manual. The admin sends the payment by whatever method LEX uses — check, Venmo, Zelle, physical gift card, etc. This step happens outside the system.

**Step 5.4 — Admin records the payout**
Back in the dashboard, the admin clicks **Record Payout** and fills in:
- Payment method (check / Venmo / Zelle / gift card / other)
- Amount paid (pre-filled from tier, editable)
- Payment reference or note (e.g. "Zelle to 972-555-0101 on 3/15")
- Their own name / which admin processed it

This creates a record in a new `payouts` table and moves the referral to `rewarded` status.

> **This formal payout workflow does not exist in the current code.** There is a `mark-rewarded` button that accepts a freeform note, but there is no `payouts` table, no payment method tracking, no admin attribution, and no audit trail. All of this needs to be built.

**Step 5.5 — Chiirp sends the reward notification text to Sarah**
After the payout is recorded, the app automatically sends a text to Sarah via Chiirp:
> *"Great news Sarah! Your friend just completed their first LEX service — your $75 reward is on the way! Thanks for spreading the word. 🎉"*

> **Current code sends this text inside the Tango auto-reward flow, which is being removed.** In production, this text should fire when the admin records the payout, not automatically on job completion.

---

### Phase 6 — Customer Checks Their Status

At any point, Sarah can visit `lexair.com/my-referrals`, enter her phone number, and see:
- Her referral link and short code
- Total referrals made
- Total rewards earned
- Status of each individual referral (clicked / booked / processing / rewarded / not qualified)

No login is required — phone number is the identifier.

---

## What Needs to Be Built for Production

### 1. Remove Tango Entirely
- Delete `src/services/tango.js`
- Remove the Tango import and `autoReward` block from `webhooks.js`
- Remove all `tango_order_id` and `tango_sent_at` column references
- Remove `TANGO_*` env variables from `.env.example`
- Remove `demoIssueGiftCard` from `demoMode.js`

### 2. Referral Tiers System
New `referral_tiers` table:
```
id, label, min_referrals, max_referrals (null = unlimited), payout_amount, active, created_at
```
- Admin UI to create, edit, reorder tiers
- Logic in `webhooks.js` to evaluate tier at job completion time
- Payout amount stored on the referral record at completion (not recalculated later)

### 3. Formal Payout Tracking
New `payouts` table:
```
id, referral_id, admin_user_id, amount, payment_method, reference_note, paid_at, created_at
```
Payment methods: `check`, `venmo`, `zelle`, `gift_card`, `other`
- Replace the current `mark-rewarded` button with a **Record Payout** form
- Admin selects payment method, enters reference, confirms amount
- `payouts` record is created, referral moves to `rewarded`, Chiirp notification fires

### 4. Admin User Management
New `admin_users` table:
```
id, name, email, password_hash, role, active, last_login_at, created_at
```
Roles:
- `super_admin` — full access including user management, tier config, system settings
- `admin` — can record payouts, reject referrals, view all data
- `viewer` — read-only dashboard access (good for Anthony to check in without making changes)

Replace current single-password session auth with per-user login using bcrypt.

### 5. Admin Settings Panel
A new Settings tab in the admin dashboard for:
- Managing referral tiers (add / edit / toggle active)
- Minimum job value threshold
- Default referral message text (the Chiirp invite copy)
- Reward notification text
- Managing admin users (super_admin only)

### 6. The Booking Bridge
Two parts:
- **ST custom field setup** — a custom field named `Referral Code` needs to be created inside ServiceTitan on the customer or booking record. Document the exact steps for your ST admin.
- **CSR training** — phone booking process: CSR asks *"Were you referred by a current LEX customer?"* — if yes, enters the code (e.g. `SARAH-4F2A`) into the Referral Code field.
- **Online booking** (if applicable) — hidden field passing the `r=` URL parameter into the ST booking widget.

### 7. Short Referral Code
Add a `referral_code` column to the `customers` table (e.g. `SARAH-4F2A`). This is a human-readable version of the slug that works for phone, verbal, and text sharing. Both the URL and the code should resolve to the same referral.

### 8. Fix: Invite Deduplication
Replace `if (customer.total_referrals === 0)` with `if (!customer.invite_sent_at)`. Add `invite_sent_at TIMESTAMPTZ` column to the `customers` table. Set it when the invite text is confirmed sent.

### 9. Fix: Click Deduplication
In `POST /api/referral/click`, check for an existing `pending` referral from the same referrer before inserting. One pending record per referrer is sufficient until they book.

### 10. Chiirp Reward Text Timing
Move `sendRewardNotification` out of the Tango/auto-reward block. It should fire when the admin records the payout (`POST /admin/api/referral/:id/payout`), not on job completion.

---

## Database Schema Changes Summary

| Change | Type | Reason |
|---|---|---|
| Add `referral_code` to `customers` | New column | Human-readable short code |
| Add `invite_sent_at` to `customers` | New column | Fix invite dedup bug |
| Add `tier_id` to `referrals` | New column | Track which tier applied |
| Remove `tango_order_id`, `tango_sent_at` from `referrals` | Remove columns | Tango removed |
| Add `payout_method` + `payout_reference` to `referrals` | New columns | Or normalize into payouts table |
| New `referral_tiers` table | New table | Configurable tiers |
| New `payouts` table | New table | Formal payout audit trail |
| New `admin_users` table | New table | Multi-user auth |

---

## Recommended Build Order

1. **Schema changes** — migrate DB with all new columns and tables
2. **Remove Tango** — clean up all references
3. **Fix the two bugs** — invite dedup and click dedup (quick wins, low risk)
4. **Add short referral code** — generate alongside slug on customer creation
5. **Build tiers system** — table, API, admin UI
6. **Build payout workflow** — table, Record Payout form, replace mark-rewarded
7. **Build admin user management** — replace single-password auth
8. **Build settings panel** — tiers config, message templates, user management
9. **The booking bridge** — ST custom field setup + CSR training + online booking bridge
10. **Reward notification text** — wire to payout event, not job completion

---

## Open Questions to Confirm Before Building

1. **Tier structure** — what are the actual tiers and amounts? (e.g. 1-3 referrals = $50, 4+ = $75, etc.)
2. **Payment method** — what does LEX actually use to send rewards today? Venmo, Zelle, check, gift card?
3. **Short code format** — confirm format. Suggestion: first name + last 4 of their phone, e.g. `SARAH-1917`. Avoids collisions and is memorable.
4. **Online booking** — does LEX use the ST online booking widget, or is it all phone? Determines scope of the booking bridge.
5. **Admin users** — who needs access and at what level? (e.g. Ryan = super_admin, Anthony = viewer, office manager = admin)
6. **CSR workflow** — is it realistic to ask CSRs to enter referral codes on phone calls? If not, the booking bridge only works for online bookings.
7. **Chiirp setup** — confirm the Chiirp API base URL and authentication method. The current code assumes `https://api.chiirp.com/v1` with Bearer token auth — verify this is correct for your account.
