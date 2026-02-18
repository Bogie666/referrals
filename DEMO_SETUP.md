# LEX Referral App — Demo Setup Guide

Get the admin dashboard running with realistic fake data in about 45 minutes.  
You only need **Supabase** and **Railway** for the demo — no Chiirp or Tango required.

---

## What You'll Have After This

- A live admin dashboard at `https://your-app.up.railway.app/admin`
- 12 fake customers, 15 referrals across all statuses, charts, pipeline — looks fully live
- The WordPress landing page shortcode ready to install
- The customer portal shortcode ready to install
- Everything running in demo mode — no real texts or gift cards fire

---

## What You Need Before Starting

- [ ] A [GitHub](https://github.com) account (free)
- [ ] A [Railway](https://railway.app) account — sign up with GitHub (free to start)
- [ ] A [Supabase](https://supabase.com) account (free)
- [ ] [Node.js 18+](https://nodejs.org) installed on your computer
- [ ] [Git](https://git-scm.com) installed on your computer

---

## Step 1 — Get the Project on Your Computer

If you downloaded the project as a zip from Claude, unzip it somewhere easy to find like your Desktop or Documents. Open a terminal and navigate to the folder:

```bash
cd ~/Desktop/lex-referral-app
# or wherever you unzipped it
```

Install dependencies:

```bash
npm install
```

---

## Step 2 — Set Up Supabase

### Create the project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Fill in:
   - **Name:** `lex-referral`
   - **Database Password:** generate one and save it (you won't need it again but keep it safe)
   - **Region:** `US East (N. Virginia)`
4. Click **Create new project** and wait about 2 minutes

### Run the schema

1. In the left sidebar, click **SQL Editor**
2. Click **New query**
3. Open the file `sql/schema.sql` from the project folder, copy the entire contents, paste it in
4. Click **Run**
5. You should see: `Success. No rows returned`
6. Click **Table Editor** in the left sidebar — you should see 4 tables: `customers`, `referrals`, `job_events`, `texts_log`

### Copy your credentials

1. Go to **Settings → API** in the left sidebar
2. Copy these two values — you'll need them in the next step:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **service_role** secret key — click the eye icon to reveal it

---

## Step 3 — Create Your .env File

In the project folder, make a copy of `.env.example` and name it `.env`:

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in the values. For the demo you only need to fill in the ones marked below — leave everything else as-is:

```
PORT=3000
NODE_ENV=production

# ✏️ Fill these in from Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Leave these as-is for demo mode
ST_APP_ID=rlaxwjh55wy6t
ST_TENANT_ID=1498628772
ST_CLIENT_ID=placeholder
ST_CLIENT_SECRET=placeholder
ST_WEBHOOK_SECRET=demo-secret-placeholder

# Leave these as-is — demo mode stubs these out
CHIIRP_API_KEY=placeholder
CHIIRP_FROM_NUMBER=9725550000
TANGO_API_KEY=placeholder
TANGO_ACCOUNT_ID=placeholder
TANGO_FUND_ID=placeholder
TANGO_DEFAULT_CATALOG_ITEM=VISA_VIRTUAL
TANGO_AUTO_REWARD=false

# ✏️ Fill this in
SITE_URL=https://lexair.com
REFERRAL_PAGE_SLUG=referral
MIN_JOB_VALUE=150
REFERRER_REWARD=75
NEW_CUSTOMER_DISCOUNT=50

# ✏️ Set a password for the admin dashboard
ADMIN_PASSWORD=choose-something-strong

# This is what makes demo mode work
DEMO_MODE=true
```

Save the file.

---

## Step 4 — Seed the Demo Data

With your `.env` filled in, run the seed script from your project folder:

```bash
npm run seed
```

You should see output like this:

```
🌱 LEX Referral Demo Seed Script
─────────────────────────────────

👥 Creating demo customers...
   ✓ Sarah Mitchell → sarah-m-4f2a
   ✓ James Thornton → james-t-9k1b
   ...

🔗 Creating demo referrals...
   ✓ Sarah Mitchell → Kevin Mitchell [rewarded]
   ✓ Sarah Mitchell → Amy Caldwell [rewarded]
   ...

✅ Demo seed complete!
   Customers created:  12
   Referrals created:  15
   Rewarded:           6
   Total paid out:     $450
```

If you need to start over and re-seed fresh data at any point:

```bash
npm run seed:clear
```

---

## Step 5 — Test It Locally (Optional but Recommended)

Run the app on your machine first to make sure everything works:

```bash
npm run dev
```

Then open your browser and go to: `http://localhost:3000/admin`

You should be redirected to a login page. Enter the `ADMIN_PASSWORD` you set and you should see the dashboard with all the seeded data — charts, pipeline, referral table, everything.

Once you've confirmed it works, stop the server with `Ctrl+C` and move on to deployment.

---

## Step 6 — Push to GitHub

### Create the repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `lex-referral-app`
3. Set it to **Private**
4. Do **not** check any of the initialization boxes
5. Click **Create repository**

### Push the code

Back in your terminal, from the project folder:

```bash
git init
git add .
git commit -m "LEX Referral App — initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/lex-referral-app.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

> ✅ Your `.env` file is listed in `.gitignore` so your Supabase credentials will never be pushed to GitHub.

---

## Step 7 — Deploy to Railway

### Create the project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project**
3. Choose **Deploy from GitHub repo**
4. Select `lex-referral-app`
5. Railway will kick off a first deploy — it will fail because env variables aren't set yet. That's fine.

### Add environment variables

1. Click on your service in Railway
2. Go to the **Variables** tab
3. Click **Raw Editor**
4. Paste in the entire contents of your local `.env` file (open it, copy everything, paste it in)
5. Click **Save** — Railway will automatically trigger a new deploy

### Get your app URL

1. Go to the **Settings** tab in your Railway service
2. Under **Networking**, click **Generate Domain**
3. Your URL will look like: `https://lex-referral-app-production.up.railway.app`
4. Copy this URL — you'll need it for WordPress

### Confirm the deploy worked

Visit `https://your-railway-url.up.railway.app/health` in your browser.

You should see:
```json
{ "status": "ok", "app": "LEX Referral App" }
```

If you see an error, click the **Deploy Logs** tab in Railway — the error message will tell you what's wrong. Most common cause is a missing or mistyped environment variable.

---

## Step 8 — View the Live Dashboard

Go to:
```
https://your-railway-url.up.railway.app/admin
```

Log in with your `ADMIN_PASSWORD`. You should see the full dashboard with all the seeded demo data.

**Things to click through for the demo:**
- **Overview tab** — KPI cards, pipeline bar, trend chart, donut chart, activity feed
- **Referrals tab** — full table, try the status filter buttons (notice the amber badge on "Completed")
- **Top Referrers tab** — leaderboard with Sarah Mitchell at the top
- **Activity tab** — chronological event log
- On the Referrals tab, find a row with status "Completed" and click **✓ Mark Rewarded** to show the manual reward flow

---

## Step 9 — Install the WordPress Shortcodes (Optional for Demo)

If you want to show the customer-facing side during the demo, install both WordPress plugins.

### Landing page (for referred friends)

1. Go to **WordPress Admin → Plugins → Add New → Upload Plugin**
2. Upload `wordpress/lex-referral.php`
3. Activate it
4. Open the plugin file and update this line with your Railway URL:
   ```php
   define('LEX_REFERRAL_API_URL', 'https://your-railway-url.up.railway.app');
   ```
5. Create a new WordPress page:
   - **Title:** Refer a Friend
   - **Slug:** `referral`
   - **Content:** `[lex_referral]`
   - Publish it

Visit `https://lexair.com/referral` — you should see the generic referral page. To see it with a real referral link, grab any `referral_link` value from the Supabase `customers` table and visit that URL.

### Customer portal (for existing LEX customers)

1. Upload `wordpress/lex-referral-portal.php` the same way
2. Activate it
3. Update the API URL constant at the top of the file to your Railway URL
4. Create a new WordPress page:
   - **Title:** My Referrals
   - **Slug:** `my-referrals`
   - **Content:** `[lex_referral_portal]`
   - Publish it

Visit `https://lexair.com/my-referrals` — you'll see the phone number lookup form. To test it, use one of the demo phone numbers from the seed data, for example `9724561001` (Sarah Mitchell).

---

## Quick Reference

| What | Where |
|---|---|
| Admin dashboard | `https://your-railway-url.up.railway.app/admin` |
| Health check | `https://your-railway-url.up.railway.app/health` |
| Referral landing page | `https://lexair.com/referral` |
| Customer portal | `https://lexair.com/my-referrals` |
| Re-seed demo data | `npm run seed:clear` (run locally) |
| Railway deploy logs | Railway dashboard → your service → Deploy Logs tab |
| Supabase data viewer | supabase.com → your project → Table Editor |

---

## Demo Phone Numbers (for testing the customer portal)

These are the numbers seeded into the database:

| Name | Phone |
|---|---|
| Sarah Mitchell (3 referrals) | 9724561001 |
| James Thornton (2 referrals) | 9724561002 |
| Maria Gonzalez (2 referrals) | 9724561003 |
| Robert Chen (1 referral) | 9724561004 |
| Marcus Johnson (1 referral) | 9724561008 |

---

## Troubleshooting

**Railway deploy fails**
Check the Deploy Logs tab. Most likely a missing env variable — confirm every line from your `.env` is in Railway's Variables tab.

**`npm run seed` fails with "Invalid API key"**
Your `SUPABASE_SERVICE_KEY` in `.env` is wrong. Go back to Supabase → Settings → API, re-copy the **service_role** key (not the anon key), and update your `.env`.

**Dashboard loads but shows no data**
The seed script didn't run against the right database. Double-check `SUPABASE_URL` in your `.env` matches the project you ran the schema on, then run `npm run seed:clear` again.

**Customer portal says "Account Not Found"**
Make sure you're entering just the 10-digit number with no formatting — or let the field auto-format it for you. Also confirm the seed script ran successfully and that your Railway `SUPABASE_URL` matches your local one.

**WordPress shortcode shows nothing**
The `LEX_REFERRAL_API_URL` constant in the plugin file needs to be updated to your actual Railway URL. Edit the file and re-upload it.
