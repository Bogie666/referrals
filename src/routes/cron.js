/**
 * GET /api/cron/poll-jobs
 * ─────────────────────────────────────────────────────────────
 * Called by Vercel cron every 30 minutes.
 * Polls ServiceTitan for recently completed jobs, generates
 * referral codes, writes them back to ST, and triggers Chiirp.
 *
 * Also checks each job for a "Referred by Code" custom field
 * (typeId 406119323) — if present, matches the referred friend's
 * completed job back to the referrer and marks the referral completed.
 *
 * Also callable manually for testing:
 *   curl https://your-app.vercel.app/api/cron/poll-jobs \
 *     -H "x-cron-secret: YOUR_CRON_SECRET"
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const supabase = require('../db');
const {
  getAccessToken,
  getCompletedJobs,
  getJobCustomFields,
  getCustomer,
  getCustomerContacts,
  writeReferralCodeToCustomer,
} = require('../services/servicetitan');
const { calculatePayout } = require('../utils/payout');
const { generateSlug, generateUniqueReferralCode, normalizeCode } = require('../utils/slugs');

const REFERRAL_BASE_URL = process.env.REFERRAL_BASE_URL || 'https://lexperks.com/referral';
const CHIIRP_WEBHOOK  = process.env.CHIIRP_WEBHOOK_URL;
const CRON_SECRET     = process.env.CRON_SECRET;
const DEMO_MODE       = process.env.DEMO_MODE === 'true';

const PAYOUT_SETTING_KEYS = [
  'min_job_value',
  'payout_percentage',
  'payout_cap',
  'max_lookback_hours',
  'excluded_business_unit_ids',
  'residential_only',
];

const DEFAULT_MAX_LOOKBACK_HOURS = 24;

async function loadPayoutSettings() {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', PAYOUT_SETTING_KEYS);
  const out = {};
  (data || []).forEach(row => { out[row.key] = row.value; });
  return out;
}

// ── Auth middleware ───────────────────────────────────────────
// Vercel cron calls include an Authorization header automatically.
// For manual calls, pass x-cron-secret header.
function verifyCronAuth(req, res, next) {
  if (!CRON_SECRET) {
    console.error('[Poller] CRON_SECRET is not set — rejecting request');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers['authorization'];
  const secretHeader = req.headers['x-cron-secret'];

  // Vercel cron sends: Authorization: Bearer {CRON_SECRET}
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken === CRON_SECRET || secretHeader === CRON_SECRET) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

// ── Main poller ───────────────────────────────────────────────
router.get('/poll-jobs', verifyCronAuth, async (req, res) => {
  const startTime = Date.now();
  const results = {
    jobsFound:           0,
    jobsQualified:       0,
    codesGenerated:      0,
    codesSkipped:        0,
    enrollmentsFiltered: 0,
    referralsMatched:    0,
    textsSent:           0,
    errors:              [],
  };

  try {
    // ── Load settings + poll cursor ───────────────────────────
    const [{ data: pollState }, payoutSettings] = await Promise.all([
      supabase.from('poll_state').select('last_polled_at').eq('id', 'jobs').single(),
      loadPayoutSettings(),
    ]);

    // ── Determine lookback window ──────────────────────────────
    // Start from poll_state.last_polled_at when available, otherwise
    // a 2-hour fallback. Cap at max_lookback_hours so a frozen cursor
    // can't accidentally drain weeks of historical jobs.
    const fallbackMs = 2 * 60 * 60 * 1000;
    const maxLookbackHours = parseFloat(payoutSettings.max_lookback_hours) || DEFAULT_MAX_LOOKBACK_HOURS;
    const earliestAllowed = Date.now() - maxLookbackHours * 60 * 60 * 1000;

    const cursorTime = pollState?.last_polled_at
      ? new Date(pollState.last_polled_at).getTime()
      : Date.now() - fallbackMs;

    const sinceMs = Math.max(cursorTime, earliestAllowed);
    const since = new Date(sinceMs);

    if (cursorTime < earliestAllowed) {
      console.warn(`[Poller] Cursor ${new Date(cursorTime).toISOString()} is older than max_lookback_hours (${maxLookbackHours}h) — clamping to ${since.toISOString()}`);
    }

    console.log(`[Poller] Starting poll — jobs completed since: ${since.toISOString()}`);

    // ── Get access token ───────────────────────────────────────
    const token = await getAccessToken();

    // ── Fetch completed jobs ───────────────────────────────────
    const jobs = await getCompletedJobs(token, since.toISOString());
    results.jobsFound = jobs.length;
    console.log(`[Poller] Found ${jobs.length} completed job(s)`);

    // ── Process each job ───────────────────────────────────────
    for (const job of jobs) {
      try {
        await processJob(job, token, payoutSettings, results);
      } catch (err) {
        console.error(`[Poller] Error processing job ${job.id}:`, err.message);
        results.errors.push({ jobId: job.id, error: err.message });
      }
    }

    // ── Update last_polled_at ──────────────────────────────────
    await supabase.from('poll_state').upsert({
      id: 'jobs',
      last_polled_at: new Date().toISOString(),
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Poller] Complete in ${duration}s —`, results);

    return res.json({ success: true, duration: `${duration}s`, ...results });

  } catch (err) {
    console.error('[Poller] Fatal error:', err.message);
    return res.status(500).json({ error: err.message, ...results });
  }
});

// ── Process a single completed job ───────────────────────────
async function processJob(job, token, payoutSettings, results) {
  const { id: jobId, customerId, total, completedOn } = job;

  const minJobValue = parseFloat(
    payoutSettings.min_job_value ?? process.env.MIN_JOB_VALUE ?? '150'
  );

  // ── Filter: minimum job value ──────────────────────────────
  if ((total || 0) < minJobValue) {
    console.log(`[Poller] Job ${jobId} skipped — total $${total} below minimum $${minJobValue}`);
    return;
  }

  results.jobsQualified++;

  // ── Fetch customer ─────────────────────────────────────────
  const customer = await getCustomer(token, customerId);
  if (!customer) {
    console.warn(`[Poller] Job ${jobId} — customer ${customerId} not found`);
    return;
  }

  const REFERRAL_CODE_TYPE_ID      = parseInt(process.env.ST_REFERRAL_CODE_TYPE_ID || '406119043');
  const REFERRED_BY_CODE_TYPE_ID   = parseInt(process.env.ST_REFERRED_BY_CODE_TYPE_ID || '406119323');

  // ── Step 6: Check if this JOB has a "Referred by Code" ─────
  // Field 406119323 lives on the JOB record (set by CSR at booking
  // or by the online scheduler via PATCH on the job), NOT on the
  // customer. The JPM v2 jobs list endpoint does not reliably
  // return customFields inline, so fetch them explicitly per job.
  const jobCustomFields = job.customFields && job.customFields.length
    ? job.customFields
    : await getJobCustomFields(token, jobId);

  const referredByField = (jobCustomFields || []).find(
    f => f.typeId === REFERRED_BY_CODE_TYPE_ID && f.value
  );

  if (referredByField) {
    const invoiceTotal = total || 0;
    const payout = calculatePayout({ invoiceTotal, settings: payoutSettings });

    await matchReferralByCode(
      referredByField.value,
      customer,
      customerId,
      jobId,
      invoiceTotal,
      payout,
      results
    );
  }

  // ── Check if referral code already exists ──────────────────
  const existingCode = (customer.customFields || []).find(
    f => f.typeId === REFERRAL_CODE_TYPE_ID && f.value
  );

  if (existingCode) {
    console.log(`[Poller] Customer ${customerId} already has referral code: ${existingCode.value}`);
    results.codesSkipped++;

    // Still make sure they exist in Supabase (in case they were missed before)
    await upsertCustomerInSupabase(customer, existingCode.value);
    return;
  }

  // ── Eligibility filters ───────────────────────────────────
  // Applied at the enrollment branch only — referral matching above
  // is unaffected so a friend's job still credits the referrer even
  // if the friend is commercial or in an excluded BU.
  const excludedBuIds = parseExcludedBuIds(payoutSettings.excluded_business_unit_ids);
  if (job.businessUnitId != null && excludedBuIds.includes(String(job.businessUnitId))) {
    console.log(`[Poller] Skip enroll for customer ${customerId} — business unit ${job.businessUnitId} is excluded`);
    results.enrollmentsFiltered++;
    return;
  }

  const residentialOnly = String(payoutSettings.residential_only ?? 'true') === 'true';
  if (residentialOnly && customer.type !== 'Residential') {
    console.log(`[Poller] Skip enroll for customer ${customerId} — type "${customer.type || 'unknown'}" is not Residential`);
    results.enrollmentsFiltered++;
    return;
  }

  // ── Fetch contacts (phone + email) ────────────────────────
  const contacts   = await getCustomerContacts(token, customerId);
  const phoneEntry = contacts.find(c => c.type === 'MobilePhone' || c.type === 'Phone');
  const emailEntry = contacts.find(c => c.type === 'Email');

  // Check doNotText flag
  if (phoneEntry?.phoneSettings?.doNotText) {
    console.log(`[Poller] Customer ${customerId} has doNotText — skipping text`);
  }

  const phone = phoneEntry?.value?.replace(/\D/g, '').replace(/^1/, '') || '';
  const email = emailEntry?.value?.toLowerCase() || '';

  // Convert ALL CAPS name to Title Case
  const name = toTitleCase(customer.name || 'Valued Customer');

  // ── Generate referral code ───────────────────────────────
  const referralCode = await generateUniqueReferralCode(supabase);
  const referralLink = REFERRAL_BASE_URL + '?r=' + referralCode;

  console.log(`[Poller] Generated code for ${name}: ${referralCode}`);

  // ── Write back to ServiceTitan ───────────────────────────
  if (!DEMO_MODE) {
    const writeSuccess = await writeReferralCodeToCustomer(token, customerId, referralCode, REFERRAL_CODE_TYPE_ID);
    if (!writeSuccess) {
      console.error(`[Poller] Failed to write code to ST for customer ${customerId}`);
      results.errors.push({ jobId, customerId, error: 'ST write-back failed' });
      // Don't return — still save to Supabase and send text
    }
  } else {
    console.log(`[DEMO] Would write code ${referralCode} to ST customer ${customerId}`);
  }

  // ── Upsert customer in Supabase ──────────────────────────
  const dbCustomer = await upsertCustomerInSupabase(
    { ...customer, name },
    referralCode,
    { referralLink, phone, email, stCustomerId: String(customerId) }
  );

  results.codesGenerated++;

  // ── Log job event ────────────────────────────────────────
  await supabase.from('job_events').insert({
    st_job_id:      String(jobId),
    st_customer_id: String(customerId),
    event_type:     'job.completed.polled',
    payload:        { jobId, customerId, total, completedOn, referralCode },
    processed:      true,
  });

  // ── Send Chiirp text ─────────────────────────────────────
  if (!phone) {
    console.warn(`[Poller] No phone for customer ${customerId} — skipping Chiirp`);
    return;
  }

  if (phoneEntry?.phoneSettings?.doNotText) {
    console.log(`[Poller] doNotText set for ${customerId} — skipping Chiirp`);
    return;
  }

  await sendChiirpInvite({ name, phone, email, referralCode, referralLink, customerId: dbCustomer?.id });
  results.textsSent++;
}

// ── Step 6: Match "Referred by Code" back to referrer ────────
async function matchReferralByCode(referredByCode, referredCustomer, stCustomerId, jobId, jobTotal, payout, results) {
  const code = normalizeCode(referredByCode);
  console.log(`[Poller] Job ${jobId} has "Referred by Code": ${referredByCode} (normalized: ${code}) — matching to referrer`);

  if (!code) {
    console.warn(`[Poller] Empty/invalid "Referred by Code" on job ${jobId} — skipping`);
    return;
  }

  // Look up the referrer by their referral_code
  const { data: referrer } = await supabase
    .from('customers')
    .select('id, name, referral_code')
    .eq('referral_code', code)
    .single();

  if (!referrer) {
    console.warn(`[Poller] No referrer found for code "${code}" — skipping referral match`);
    await supabase.from('job_events').insert({
      st_job_id:      String(jobId),
      st_customer_id: String(stCustomerId),
      event_type:     'referral.unmatched',
      payload:        {
        referredByCodeRaw:        referredByCode,
        referredByCodeNormalized: code,
        referredCustomerName:     referredCustomer.name || null,
      },
      processed:      true,
    });
    return;
  }

  const referredName = toTitleCase(referredCustomer.name || 'Unknown');

  // Check if this referral was already recorded (dedup by referrer + ST customer)
  const { data: existingReferral } = await supabase
    .from('referrals')
    .select('id, status')
    .eq('referrer_id', referrer.id)
    .eq('referred_st_id', String(stCustomerId))
    .single();

  if (existingReferral) {
    // Already tracked — upgrade to completed if still pending/booked
    if (existingReferral.status === 'pending' || existingReferral.status === 'booked') {
      await supabase
        .from('referrals')
        .update({
          status:             'completed',
          referred_name:      referredName,
          referred_job_id:    String(jobId),
          referred_job_value: jobTotal,
          reward_amount:      payout.amount,
          tier_id:            null,
          updated_at:         new Date().toISOString(),
        })
        .eq('id', existingReferral.id);
      console.log(`[Poller] Referral ${existingReferral.id} upgraded to completed | Payout: $${payout.amount} (${payout.rule})`);
      results.referralsMatched++;
    } else {
      console.log(`[Poller] Referral ${existingReferral.id} already in status: ${existingReferral.status}`);
    }
    return;
  }

  // Create new referral record as completed (ready for payout)
  const { data: newReferral, error: insertErr } = await supabase
    .from('referrals')
    .insert({
      referrer_id:        referrer.id,
      referred_name:      referredName,
      referred_st_id:     String(stCustomerId),
      referred_job_id:    String(jobId),
      referred_job_value: jobTotal,
      reward_amount:      payout.amount,
      status:             'completed',
    })
    .select()
    .single();

  if (insertErr) {
    console.error(`[Poller] Failed to create referral for code ${code}:`, insertErr.message);
    results.errors.push({ jobId, error: `Referral insert failed: ${insertErr.message}` });
    return;
  }

  // Update referrer's total_referrals count
  await supabase.rpc('increment_total_referrals', { customer_id: referrer.id }).catch(() => {
    // Fallback: manual increment if RPC doesn't exist
    supabase
      .from('customers')
      .update({ total_referrals: (referrer.total_referrals || 0) + 1 })
      .eq('id', referrer.id);
  });

  console.log(`[Poller] New referral created: ${referredName} → ${referrer.name} (code: ${code}), invoice: $${jobTotal}, payout: $${payout.amount} (${payout.rule})`);
  results.referralsMatched++;

  // Log the event
  await supabase.from('job_events').insert({
    st_job_id:      String(jobId),
    st_customer_id: String(stCustomerId),
    event_type:     'referral.matched',
    payload:        {
      referredByCode: code,
      referrerId:     referrer.id,
      referredName,
      jobTotal,
      payoutAmount:   payout.amount,
      payoutRule:     payout.rule,
    },
    processed:      true,
  });
}

// ── Build the share-page URL (mirrors REFERRAL_BASE_URL's origin) ──
function buildShareLink(code) {
  if (!code) return '';
  try {
    return new URL(REFERRAL_BASE_URL).origin + '/share/' + code;
  } catch (e) {
    return 'https://lexperks.com/share/' + code;
  }
}

// ── Send Chiirp webhook ───────────────────────────────────────
async function sendChiirpInvite({ name, phone, email, referralCode, referralLink, customerId }) {
  if (!CHIIRP_WEBHOOK) {
    console.warn('[Poller] CHIIRP_WEBHOOK_URL not set — skipping text');
    return;
  }

  const nameParts = (name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ');
  // Format phone with country code for Chiirp
  const formattedPhone = phone.length === 10 ? `1${phone}` : phone;

  const payload = {
    first_name:    firstName,
    last_name:     lastName,
    phone_number:  formattedPhone,
    email_address: email || '',
    referral_code: referralCode,
    referral_link: referralLink,
    share_link:    buildShareLink(referralCode),
  };

  if (DEMO_MODE) {
    console.log(`[DEMO] Would POST to Chiirp webhook:`, payload);
    return;
  }

  try {
    const axios = require('axios');
    const response = await axios.post(CHIIRP_WEBHOOK, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log(`[Poller] Chiirp text triggered for ${firstName} (${phone}) — status: ${response.status}`);

    // Log the text
    if (customerId) {
      await supabase.from('texts_log').insert({
        customer_id: customerId,
        phone,
        message: `Referral invite sent via Chiirp campaign — code: ${referralCode}`,
        status: 'sent',
      });
    }
  } catch (err) {
    const errMsg = err.response?.data
      ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data))
      : err.message;
    console.error('[Poller] Chiirp webhook failed:', errMsg);

    await supabase.from('texts_log').insert({
      customer_id: customerId || null,
      phone,
      message: `Referral invite FAILED via Chiirp — code: ${referralCode} — ${errMsg}`.slice(0, 2000),
      status: 'failed',
    });
  }
}

// ── Upsert customer in Supabase ───────────────────────────────
async function upsertCustomerInSupabase(stCustomer, referralCode, extras = {}) {
  const {
    referralLink,
    phone,
    email,
    stCustomerId,
  } = extras;

  const id = stCustomerId || String(stCustomer.id);

  // Check if exists
  const { data: existing } = await supabase
    .from('customers')
    .select('id, invite_sent_at')
    .eq('st_customer_id', id)
    .single();

  if (existing) {
    // Update referral code if not set
    await supabase
      .from('customers')
      .update({
        referral_link: referralLink || existing.referral_link,
        referral_code: referralCode,
        ...(phone && { phone }),
        ...(email && { email }),
      })
      .eq('id', existing.id);
    return existing;
  }

  // Create new — referral_slug is NOT NULL on the schema, even though
  // the canonical sharable identifier is referral_code. Generate one
  // for storage compliance.
  const referralSlug = generateSlug(stCustomer.name || '');
  const { data: created, error: insertErr } = await supabase
    .from('customers')
    .insert({
      st_customer_id: id,
      name:           stCustomer.name,
      phone:          phone || '',
      email:          email || '',
      referral_slug:  referralSlug,
      referral_link:  referralLink || '',
      referral_code:  referralCode,
    })
    .select()
    .single();

  if (insertErr) {
    console.error(`[Poller] Failed to insert customer ${id} with code ${referralCode}:`, insertErr.message);
    return null;
  }
  return created;
}

// ── Helper: convert ALL CAPS to Title Case ────────────────────
function parseExcludedBuIds(raw) {
  return String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ─────────────────────────────────────────────────────────────
// GET /api/cron/re-engage
// Daily re-engagement drip. Reads `reengage_days` from settings
// (e.g. "7,14,30") and for each day N, fires a Chiirp webhook
// with event="reengage_day_N" for any enrolled customer who
//   - was enrolled at least N days ago
//   - was enrolled at most reengage_max_age_days ago
//   - has zero referrals (any status — even a click counts as
//     "engaged")
//   - has a phone on file
//   - has not already received this specific event
//
// Idempotent via the customer_events unique constraint.
// ─────────────────────────────────────────────────────────────
router.get('/re-engage', verifyCronAuth, async (req, res) => {
  const startTime = Date.now();
  const results = {
    daysProcessed:   0,
    candidatesSeen:  0,
    eventsFired:     0,
    eventsSkipped:   0,
    errors:          [],
  };

  try {
    const { data: rows } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['reengage_days', 'reengage_max_age_days']);
    const settings = {};
    (rows || []).forEach(r => { settings[r.key] = r.value; });

    const days = String(settings.reengage_days || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a); // process longest delays first so a customer who's overdue on day_30 doesn't also fire day_7 in the same run

    if (days.length === 0) {
      console.log('[ReEngage] reengage_days is empty — skipping run');
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      return res.json({ success: true, duration: `${duration}s`, message: 'No reengage_days configured', ...results });
    }

    const maxAgeDays = parseFloat(settings.reengage_max_age_days) || 90;

    for (const day of days) {
      results.daysProcessed++;
      const eventType = `reengage_day_${day}`;

      // Window: enrolled between (now - maxAge) and (now - day) days ago
      const ageBoundary = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
      const dayBoundary = new Date(Date.now() - day        * 86400000).toISOString();

      const { data: candidates, error: candErr } = await supabase
        .from('customers')
        .select('id, name, phone, email, referral_code, referral_link, created_at')
        .gte('created_at', ageBoundary)
        .lte('created_at', dayBoundary)
        .not('referral_code', 'is', null)
        .neq('phone', '')
        .limit(500);

      if (candErr) {
        console.error(`[ReEngage] Day ${day}: candidate query failed:`, candErr.message);
        results.errors.push({ day, error: candErr.message });
        continue;
      }

      if (!candidates || candidates.length === 0) {
        console.log(`[ReEngage] Day ${day}: 0 candidates`);
        continue;
      }

      results.candidatesSeen += candidates.length;
      const candidateIds = candidates.map(c => c.id);

      // Filter out customers who already received this event
      const { data: alreadyFiredRows } = await supabase
        .from('customer_events')
        .select('customer_id')
        .in('customer_id', candidateIds)
        .eq('event_type', eventType);
      const alreadyFired = new Set((alreadyFiredRows || []).map(r => r.customer_id));

      // Filter out customers who have ANY referrals row (any status)
      const { data: referralRows } = await supabase
        .from('referrals')
        .select('referrer_id')
        .in('referrer_id', candidateIds);
      const hasShared = new Set((referralRows || []).map(r => r.referrer_id));

      const toEngage = candidates.filter(c => !alreadyFired.has(c.id) && !hasShared.has(c.id));

      console.log(`[ReEngage] Day ${day}: ${candidates.length} candidates → ${alreadyFired.size} already fired, ${hasShared.size} already shared, ${toEngage.length} to engage`);

      for (const customer of toEngage) {
        try {
          // Insert event row first — unique constraint protects against
          // a parallel run sneaking in.
          const { error: insertErr } = await supabase
            .from('customer_events')
            .insert({ customer_id: customer.id, event_type: eventType });
          if (insertErr) {
            if (insertErr.code === '23505') {
              results.eventsSkipped++;
              continue;
            }
            throw insertErr;
          }

          await sendChiirpReEngage(customer, eventType, day);
          results.eventsFired++;
        } catch (err) {
          console.error(`[ReEngage] Failed for customer ${customer.id}:`, err.message);
          results.errors.push({ customerId: customer.id, day, error: err.message });
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ReEngage] Complete in ${duration}s —`, results);
    return res.json({ success: true, duration: `${duration}s`, ...results });
  } catch (err) {
    console.error('[ReEngage] Fatal error:', err.message);
    return res.status(500).json({ error: err.message, ...results });
  }
});

async function sendChiirpReEngage(customer, eventType, day) {
  if (!CHIIRP_WEBHOOK) {
    console.warn('[ReEngage] CHIIRP_WEBHOOK_URL not set — skipping');
    return;
  }

  const nameParts = (customer.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ');
  const phone = (customer.phone || '').replace(/\D/g, '').replace(/^1/, '');
  const formattedPhone = phone.length === 10 ? `1${phone}` : phone;

  const code = customer.referral_code || '';
  const referralLink = customer.referral_link || `${REFERRAL_BASE_URL}?r=${code}`;

  const payload = {
    event:               eventType,
    first_name:          firstName,
    last_name:           lastName,
    phone_number:        formattedPhone,
    email_address:       customer.email || '',
    referral_code:       code,
    referral_link:       referralLink,
    share_link:          buildShareLink(code),
    days_since_enrolled: day,
  };

  if (DEMO_MODE) {
    console.log(`[DEMO] Would POST re-engage to Chiirp:`, payload);
    return;
  }

  const axios = require('axios');
  await axios.post(CHIIRP_WEBHOOK, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  console.log(`[ReEngage] ${eventType} fired for ${firstName} (${formattedPhone})`);

  await supabase.from('texts_log').insert({
    customer_id: customer.id,
    phone:       phone,
    message:     `Re-engagement ${eventType} fired via Chiirp — code: ${code}`,
    status:      'sent',
  });
}

module.exports = router;
