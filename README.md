# LEX Air Conditioning — Customer Referral App

A fully automated customer referral system built for LEX Air Conditioning.
Integrates with ServiceTitan, Chiirp, and Tango Card.

---

## How It Works (End-to-End)

1. **Job completes in ServiceTitan** → ST fires a webhook to this app
2. **App creates/updates customer record** in Supabase with a unique referral link
3. **Chiirp sends a referral invite text** to the customer automatically
4. **Customer shares their link** — the landing page on lexair.com handles everything
5. **Friend clicks the link** → lands on the referral page, calls to book
6. **Friend's job completes in ST** → app validates the referral (job ≥ $150)
7. **Tango Card sends a $75 gift card** to the referrer's email automatically
8. **Chiirp sends a "your reward is on the way" text** to the referrer

Zero manual steps for your office staff.

---

## Project Structure

```
lex-referral-app/
├── src/
│   ├── index.js              # Express server entry point
│   ├── db.js                 # Supabase client
│   ├── routes/
│   │   ├── webhooks.js       # ServiceTitan webhook handler (core logic)
│   │   └── api.js            # Public API for WordPress frontend
│   ├── services/
│   │   ├── chiirp.js         # Text messaging
│   │   └── tango.js          # Gift card fulfillment
│   └── utils/
│       └── slugs.js          # Referral link generation
├── sql/
│   └── schema.sql            # Supabase database schema (run once)
├── wordpress/
│   └── lex-referral.php      # WordPress plugin (upload to site)
├── .env.example              # Environment variable template
├── package.json
└── README.md
```

---

## Deployment Guide

### Step 1 — Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (name it "lex-referral")
3. Go to **SQL Editor** and paste the contents of `sql/schema.sql` → Run it
4. Go to **Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - Service role key (secret) → `SUPABASE_SERVICE_KEY`

### Step 2 — Deploy to Railway

1. Push this repo to GitHub (make sure `.env` is in `.gitignore`!)
2. Go to [railway.app](https://railway.app) and create a new project
3. Connect your GitHub repo
4. Add environment variables (copy from `.env.example`, fill in real values)
5. Railway auto-deploys — copy your app URL (e.g. `https://lex-referral-app.up.railway.app`)

### Step 3 — Set Up ServiceTitan Webhook

1. In ServiceTitan: **Settings → Integrations → Webhooks**
2. Add a new webhook:
   - **URL:** `https://your-railway-url.up.railway.app/webhooks/servicetitan`
   - **Events:** Job Completed, Booking Created
   - **Secret:** Use the value you set for `ST_WEBHOOK_SECRET`

### Step 4 — Install WordPress Plugin

1. Upload `wordpress/lex-referral.php` to `/wp-content/plugins/lex-referral/`
2. Activate it in **WordPress → Plugins**
3. Update the `LEX_REFERRAL_API_URL` constant at the top of the file to your Railway URL
4. Create a WordPress page:
   - Title: "Referral"
   - Slug: `referral` (so URL is lexair.com/referral)
   - Content: `[lex_referral]`

### Step 5 — Set Up Tango Card

1. Create an account at [tangocard.com](https://www.tangocard.com)
2. Fund your account (they draw from this balance for gift cards)
3. Get your API credentials → add to `.env`

### Step 6 — Get Chiirp API Key

1. In Chiirp: **Settings → API → Generate Key**
2. Get your sending phone number
3. Add both to `.env`

---

## Referral Settings (in .env)

| Variable | Default | Description |
|---|---|---|
| `MIN_JOB_VALUE` | 150 | Minimum job total for referral to qualify |
| `REFERRER_REWARD` | 75 | Gift card amount sent to referrer |
| `NEW_CUSTOMER_DISCOUNT` | 50 | Discount shown on landing page |

---

## Admin Dashboard (Supabase)

Your Supabase project includes a built-in table editor that shows you the full referral pipeline. No custom admin panel needed to start.

Monitor these tables:
- **referrals** — filter by `status` to see pending/booked/rewarded
- **texts_log** — see every text sent
- **job_events** — raw ST webhook log for debugging

---

## Future Phases

- **Phase 5:** Custom admin dashboard showing the pipeline visually
- **Phase 6:** Customer portal where customers can see their referral stats
- **Phase 7:** Multi-tier rewards (refer 3 get a bonus, etc.)
- **Phase 8:** Chiirp follow-up sequence for customers who got the link but haven't shared it

---

## Support

Built for LEX Air Conditioning | (972) 466-1917 | lexair.com
