# LEX Referral App — Setup & Deployment Guide

**Stack:** Node.js (Express) · Supabase · Railway · Chiirp · Tango Card · WordPress  
**Estimated setup time:** 2–3 hours  
**Monthly cost estimate:** ~$5/mo (Railway) + Tango Card gift card float

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase — Database Setup](#2-supabase--database-setup)
3. [GitHub — Push the Code](#3-github--push-the-code)
4. [Railway — Deploy the Backend](#4-railway--deploy-the-backend)
5. [ServiceTitan — Configure the Webhook](#5-servicetitan--configure-the-webhook)
6. [Chiirp — Get Your API Key](#6-chiirp--get-your-api-key)
7. [Tango Card — Gift Card Setup](#7-tango-card--gift-card-setup)
8. [WordPress — Install the Plugin](#8-wordpress--install-the-plugin)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Verify Everything Is Working](#10-verify-everything-is-working)
11. [Admin Dashboard](#11-admin-dashboard)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Before you start, make sure you have:

- [ ] Access to the LEX WordPress admin panel
- [ ] ServiceTitan admin/owner access (to configure webhooks)
- [ ] Access to the Chiirp account (or credentials to create one)
- [ ] A GitHub account (free)
- [ ] A Railway account — sign up at [railway.app](https://railway.app) with your GitHub account
- [ ] Node.js 18+ installed locally if you want to test before deploying (optional)

---

## 2. Supabase — Database Setup

Supabase is the free Postgres database that stores all referral data.

### 2a. Create the Project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**
2. Sign in with GitHub
3. Click **New project**
4. Fill in:
   - **Name:** `lex-referral`
   - **Database Password:** Generate a strong one and save it somewhere safe
   - **Region:** `US East (N. Virginia)` — closest to DFW
5. Click **Create new project** and wait ~2 minutes for it to provision

### 2b. Run the Schema

1. In the left sidebar, click **SQL Editor**
2. Click **New query**
3. Open the file `sql/schema.sql` from the project folder
4. Copy the entire contents and paste it into the SQL editor
5. Click **Run** (or press `Ctrl+Enter`)
6. You should see: `Success. No rows returned`
7. In the left sidebar, click **Table Editor** — you should now see 4 tables:
   - `customers`
   - `referrals`
   - `job_events`
   - `texts_log`

### 2c. Copy Your Credentials

1. In the left sidebar, go to **Settings → API**
2. Copy and save these two values — you'll need them later:
   - **Project URL** → this is your `SUPABASE_URL`
   - **service_role** key (under "Project API keys", click reveal) → this is your `SUPABASE_SERVICE_KEY`

> ⚠️ **Keep the service_role key secret.** It has full database access. Never put it in public code or the WordPress plugin.

---

## 3. GitHub — Push the Code

### 3a. Create the Repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `lex-referral-app`
3. Set it to **Private**
4. Do NOT initialize with a README (your project already has one)
5. Click **Create repository**

### 3b. Push the Code

Open a terminal in the `lex-referral-app` project folder and run:

```bash
git init
git add .
git commit -m "Initial commit — LEX Referral App"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/lex-referral-app.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

> ✅ Make sure `.env` is listed in `.gitignore` (it is by default) so your secrets never get pushed to GitHub.

---

## 4. Railway — Deploy the Backend

Railway auto-deploys from GitHub and hosts the Node.js server.

### 4a. Create the Project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project**
3. Choose **Deploy from GitHub repo**
4. Select `lex-referral-app`
5. Railway will detect it's a Node.js app and start a first (failing) deploy — that's fine, we need to add env variables first

### 4b. Add Environment Variables

1. Click on your new service in Railway
2. Go to the **Variables** tab
3. Click **Raw Editor** and paste in the following, filling in your real values:

```
PORT=3000
NODE_ENV=production
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
ST_APP_ID=rlaxwjh55wy6t
ST_TENANT_ID=1498628772
ST_CLIENT_ID=your-st-client-id
ST_CLIENT_SECRET=your-st-client-secret
ST_WEBHOOK_SECRET=make-up-a-long-random-string-here
CHIIRP_API_KEY=your-chiirp-api-key
CHIIRP_FROM_NUMBER=your-chiirp-sending-number
TANGO_API_KEY=your-tango-api-key
TANGO_ACCOUNT_ID=your-tango-account-id
TANGO_FUND_ID=your-tango-fund-id
TANGO_DEFAULT_CATALOG_ITEM=VISA_VIRTUAL
SITE_URL=https://lexair.com
REFERRAL_PAGE_SLUG=referral
MIN_JOB_VALUE=150
REFERRER_REWARD=75
NEW_CUSTOMER_DISCOUNT=50
ADMIN_PASSWORD=choose-a-strong-password-here
```

4. Click **Save** — Railway will trigger a new deploy automatically

### 4c. Get Your App URL

1. Click the **Settings** tab in your Railway service
2. Under **Networking**, click **Generate Domain**
3. Your app URL will look like: `https://lex-referral-app-production.up.railway.app`
4. **Save this URL** — you'll need it for the ST webhook and WordPress plugin

### 4d. Verify the Deploy

Visit `https://your-railway-url.up.railway.app/health` in your browser.

You should see:
```json
{ "status": "ok", "app": "LEX Referral App", "timestamp": "..." }
```

If you see an error, check the **Deploy Logs** tab in Railway for what went wrong.

---

## 5. ServiceTitan — Configure the Webhook

This is what triggers the whole referral flow — ST calls your app every time a job is completed.

### 5a. Find the Webhook Settings

1. In ServiceTitan, go to the gear icon → **Settings**
2. Search for **Webhooks** or navigate to **Integrations → Webhooks**

> 📝 ServiceTitan webhook configuration may require Owner or Admin access. If you don't see it, contact ST support or check your permission level.

### 5b. Create the Webhook

Click **Add Webhook** (or **New**) and fill in:

| Field | Value |
|---|---|
| **Name** | `LEX Referral App` |
| **URL** | `https://your-railway-url.up.railway.app/webhooks/servicetitan` |
| **Events** | `Job Completed` and `Booking Created` |
| **Secret** | The same random string you put in `ST_WEBHOOK_SECRET` |
| **Active** | Yes |

Click **Save**.

### 5c. Add Referral Slug as a Custom Field (Important)

For the referral tracking to work when a referred friend books, you need a way to pass the referral slug through to ServiceTitan. There are two approaches:

**Option A (Recommended) — Custom field on the booking:**
1. In ST Settings, find **Custom Fields**
2. Create a new field on the **Customer** or **Booking** record:
   - **Name:** `Referral Code`
   - **Field ID / API Name:** `referralSlug`
3. When your WordPress booking form passes a referral slug in the URL, include it as this custom field value

**Option B — Use a call tag:**
If Option A isn't available, office staff can manually add a "Referral" tag to jobs that came from referrals, and we can filter on that. Less automated but workable.

> We'll revisit this in Phase 4 when we tighten up the booking-to-referral link flow.

---

## 6. Chiirp — Get Your API Key

### 6a. Get the API Key

1. Log into your Chiirp account
2. Go to **Settings → API** (or **Integrations → API Keys**)
3. Click **Generate New Key** (or copy your existing key)
4. This is your `CHIIRP_API_KEY`

### 6b. Get Your Sending Number

1. In Chiirp, go to **Settings → Phone Numbers**
2. Copy the phone number LEX uses for outbound texts
3. Format it as `+19725551234` (E.164 format with country code)
4. This is your `CHIIRP_FROM_NUMBER`

### 6c. Update Railway

Add both values to your Railway environment variables if you haven't already, then Railway will redeploy automatically.

> 📝 **Note:** Chiirp's API documentation may call the endpoint differently. If the texts aren't sending, check the Chiirp API docs for the correct base URL and request format, and compare it to `src/services/chiirp.js`. The fields most likely to need adjusting are `to`, `from`, and `body`.

---

## 7. Tango Card — Gift Card Setup

Tango Card handles automatic digital gift card delivery (Visa or Amazon).

### 7a. Create an Account

1. Go to [tangocard.com](https://www.tangocard.com) and click **Get Started**
2. Sign up as a business
3. Complete the account verification (may take 1 business day)

### 7b. Fund Your Account

1. Once approved, go to **Funds → Add Funds**
2. Add at least $500 to start (this is your gift card float — it draws down as rewards go out)
3. Set up auto-refill to avoid running out (recommended threshold: $200)

### 7c. Get Your Credentials

1. Go to **Account → API Access** or **Settings → Integrations**
2. Copy:
   - **API Key** → `TANGO_API_KEY`
   - **Account Identifier** → `TANGO_ACCOUNT_ID`
   - **Fund ID** → `TANGO_FUND_ID`

### 7d. Choose Your Catalog Item

The default is `VISA_VIRTUAL` (a virtual Visa prepaid card — most flexible for customers).

Other options you can use for `TANGO_DEFAULT_CATALOG_ITEM`:
- `AMAZON` — Amazon gift card
- Check the Tango API catalog endpoint for the full list of available items

---

## 8. WordPress — Install the Plugin

### 8a. Upload the Plugin File

1. In your WordPress admin, go to **Plugins → Add New → Upload Plugin**
2. Upload the file `wordpress/lex-referral.php`
3. Click **Install Now**, then **Activate Plugin**

**Alternatively**, upload via FTP/SFTP:
1. Connect to your server
2. Navigate to `/wp-content/plugins/`
3. Create a folder called `lex-referral`
4. Upload `lex-referral.php` into that folder
5. Activate it in WordPress → Plugins

### 8b. Update the API URL in the Plugin

1. Open `wordpress/lex-referral.php` in a text editor
2. Find this line near the top:
   ```php
   define('LEX_REFERRAL_API_URL', 'https://lex-referral-app.up.railway.app');
   ```
3. Replace the URL with your actual Railway app URL
4. Save and re-upload the file (or edit directly in **Plugins → Plugin Editor**)

### 8c. Create the Referral Page

1. In WordPress, go to **Pages → Add New**
2. Fill in:
   - **Title:** `Refer a Friend`
   - **Slug:** `referral` (so the URL is `lexair.com/referral`)
3. In the page content, add the shortcode:
   ```
   [lex_referral]
   ```
4. Set the page **template** to full-width or blank if your theme supports it (removes sidebar for a cleaner look)
5. Click **Publish**

### 8d. Test the Page

Visit `https://lexair.com/referral` — you should see a generic "Refer a Friend, Earn $75!" page.

Now test with a fake referral link: `https://lexair.com/referral?r=test-slug`  
You should see "Referral Link Not Found" — which is correct since that slug doesn't exist yet.

---

## 9. Environment Variables Reference

Complete list of all variables and what they do:

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Server port. Railway sets this automatically — use `3000` |
| `NODE_ENV` | Yes | Set to `production` |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (keep secret) |
| `ST_APP_ID` | Yes | ServiceTitan App ID: `rlaxwjh55wy6t` |
| `ST_TENANT_ID` | Yes | ServiceTitan Tenant ID: `1498628772` |
| `ST_CLIENT_ID` | Yes | ST OAuth client ID |
| `ST_CLIENT_SECRET` | Yes | ST OAuth client secret |
| `ST_WEBHOOK_SECRET` | Yes | Random string to verify ST webhook signatures |
| `CHIIRP_API_KEY` | Yes | Chiirp API key for sending texts |
| `CHIIRP_FROM_NUMBER` | Yes | Chiirp sending number in E.164 format (`+19725551234`) |
| `TANGO_API_KEY` | Yes | Tango Card API key |
| `TANGO_ACCOUNT_ID` | Yes | Tango Card account identifier |
| `TANGO_FUND_ID` | Yes | Tango Card fund to draw from |
| `TANGO_DEFAULT_CATALOG_ITEM` | Yes | `VISA_VIRTUAL` or `AMAZON` |
| `SITE_URL` | Yes | `https://lexair.com` |
| `REFERRAL_PAGE_SLUG` | Yes | `referral` |
| `MIN_JOB_VALUE` | Yes | Minimum job total to qualify (`150`) |
| `REFERRER_REWARD` | Yes | Gift card amount for referrer (`75`) |
| `NEW_CUSTOMER_DISCOUNT` | Yes | Discount shown to new customer (`50`) |
| `ADMIN_PASSWORD` | Yes | Password to access `/admin` dashboard |

---

## 10. Verify Everything Is Working

Work through this checklist after setup to confirm the full flow is operational.

### ✅ Infrastructure

- [ ] `GET /health` returns `{"status":"ok"}` on your Railway URL
- [ ] Supabase Table Editor shows all 4 tables (customers, referrals, job_events, texts_log)
- [ ] Railway deploy logs show `✅ LEX Referral App running on port 3000`

### ✅ Admin Dashboard

- [ ] Visit `https://your-railway-url.up.railway.app/admin`
- [ ] You're redirected to the login page
- [ ] Log in with your `ADMIN_PASSWORD`
- [ ] Dashboard loads showing 0s across all stats (expected — no data yet)
- [ ] All 4 tabs (Overview, Referrals, Top Referrers, Activity) load without errors

### ✅ WordPress

- [ ] `https://lexair.com/referral` loads and shows the referral page
- [ ] The page renders without JS errors (check browser console)
- [ ] `https://lexair.com/referral?r=sarah-m-test` shows "Referral Link Not Found"

### ✅ Webhook Test (Manual)

Send a test POST to your webhook endpoint using a tool like [Postman](https://www.postman.com) or the `curl` command below:

```bash
curl -X POST https://your-railway-url.up.railway.app/webhooks/servicetitan \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "job.completed",
    "jobId": "TEST-001",
    "customerId": "99999999",
    "customerName": "Test Customer",
    "customerPhone": "9725550001",
    "customerEmail": "test@example.com",
    "total": 250
  }'
```

After running this, check:
- [ ] Supabase `job_events` table has a new row with `st_job_id = TEST-001`
- [ ] Supabase `customers` table has a new row for "Test Customer" with a `referral_slug`
- [ ] Railway logs show `[Customer] Created: Test Customer | Slug: test-c-xxxx`

### ✅ End-to-End Referral Test (when ready for live)

1. Complete a real job in ServiceTitan for a test customer
2. Wait ~30 seconds for the webhook to fire
3. Check Supabase `customers` — new row should appear
4. Check Supabase `texts_log` — referral invite text should be logged
5. Confirm the customer received the text with their personal link
6. Click the link, verify the landing page loads correctly
7. The admin dashboard should show the new referral in the pipeline

---

## 11. Admin Dashboard

The admin dashboard is live at:
```
https://your-railway-url.up.railway.app/admin
```

### What Each Tab Shows

| Tab | What It's For |
|---|---|
| **Overview** | KPI cards, pipeline bar, trend charts, activity feed |
| **Referrals** | Full table of every referral with status filters |
| **Top Referrers** | Leaderboard of your best referring customers |
| **Activity** | Real-time log of every referral event |

### Who Should Have Access

The dashboard is password-protected with a single shared password. Share the URL and `ADMIN_PASSWORD` only with:
- Yourself
- Anyone else at LEX who needs visibility into the program

There's no sensitive financial data in the dashboard (gift card numbers are emailed by Tango directly to the customer), so it's safe to share with office management.

### Changing the Password

Update `ADMIN_PASSWORD` in your Railway environment variables. The change takes effect on the next deploy (Railway auto-deploys on env var changes).

---

## 12. Troubleshooting

### Texts aren't sending

1. Check Railway logs for `[Chiirp]` lines — is there an error message?
2. Verify `CHIIRP_API_KEY` and `CHIIRP_FROM_NUMBER` are set correctly in Railway
3. Confirm the customer record in Supabase has a non-empty `phone` field
4. Check that the Chiirp API base URL in `src/services/chiirp.js` matches what Chiirp's docs specify

### Gift cards aren't being issued

1. Check Railway logs for `[Tango]` lines
2. Verify your Tango account has sufficient funds
3. Confirm the referrer has an `email` in their customer record in Supabase
4. Check that the referral record moved to `status = completed` before the gift card attempt

### Webhook isn't firing

1. In ServiceTitan, check **Settings → Webhooks** and look for a delivery history/log
2. Make sure the webhook URL is exactly right (no trailing slash, correct Railway URL)
3. Verify the webhook is set to **Active**
4. Check Railway logs — if the request is hitting the server you'll see `[ST Webhook]` log lines

### Referral page shows "Not Found"

1. Confirm the WordPress page slug is exactly `referral`
2. Make sure the `LEX_REFERRAL_API_URL` in the plugin file matches your Railway URL
3. Check the browser console for any JS errors or blocked requests
4. Check CORS — the Railway app only allows requests from `SITE_URL`; confirm that's set to `https://lexair.com`

### Railway deploy failing

1. Check the **Deploy Logs** tab in Railway
2. Most common cause: a missing environment variable. Check that all required variables from Section 9 are set.
3. Check `package.json` has `"start": "node src/index.js"` — Railway uses this to start the app

### Supabase connection errors

1. Double-check `SUPABASE_URL` — should end in `.supabase.co` with no trailing slash
2. Make sure you're using the **service_role** key, not the `anon` key
3. Check that the schema was applied correctly in Supabase's Table Editor

---

## What's Been Built (Phases 1–3)

| Phase | What Was Built | Status |
|---|---|---|
| Phase 1 | Database schema, ST webhook handler, customer upsert logic | ✅ Complete |
| Phase 2 | Referral link generation, WordPress landing page, Chiirp + Tango integrations | ✅ Complete |
| Phase 3 | Password-protected admin dashboard with 4 tabs, charts, pipeline view | ✅ Complete |
| Phase 4 | Chiirp follow-up sequence for non-sharers | 🔜 Planned |
| Phase 5 | Customer-facing "my referrals" portal | 🔜 Planned |

---

*LEX Air Conditioning — Serving DFW Since 2004*  
*(972) 466-1917 · lexair.com*
