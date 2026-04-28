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
  getCustomer,
  getCustomerContacts,
  writeReferralCodeToCustomer,
} = require('../services/servicetitan');
const { calculatePayout } = require('../utils/payout');

const REFERRAL_BASE_URL = process.env.REFERRAL_BASE_URL || 'https://lexperks.com/referral';
const CHIIRP_WEBHOOK  = process.env.CHIIRP_WEBHOOK_URL;
const CRON_SECRET     = process.env.CRON_SECRET;
const DEMO_MODE       = process.env.DEMO_MODE === 'true';

const PAYOUT_SETTING_KEYS = [
  'min_job_value',
  'payout_percentage',
  'payout_cap',
];

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
    jobsFound:     0,
    jobsQualified: 0,
    codesGenerated: 0,
    codesSkipped:  0,
    referralsMatched: 0,
    textsSent:     0,
    errors:        [],
  };

  try {
    // ── Determine lookback window ──────────────────────────────
    // Use last_polled_at from DB if available, otherwise 2 hours ago.
    const { data: pollState } = await supabase
      .from('poll_state')
      .select('last_polled_at')
      .eq('id', 'jobs')
      .single();

    const lookbackMs = 2 * 60 * 60 * 1000; // 2 hours
    const since = pollState?.last_polled_at
      ? new Date(pollState.last_polled_at)
      : new Date(Date.now() - lookbackMs);

    console.log(`[Poller] Starting poll — jobs completed since: ${since.toISOString()}`);

    // ── Get access token ───────────────────────────────────────
    const token = await getAccessToken();

    // ── Load payout settings (admin-editable) ──────────────────
    const payoutSettings = await loadPayoutSettings();

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

  // ── Step 6: Check if this job has a "Referred by Code" ─────
  // If a CSR entered a referral code when this customer booked,
  // it will be in custom field 406119323. Match it back to the referrer.
  const referredByField = (customer.customFields || []).find(
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
  const firstName = name.split(' ')[0].toUpperCase().slice(0, 6);
  const codeSuffix = phone.length >= 4 ? phone.slice(-4) : Math.random().toString(36).slice(2,6).toUpperCase();
  const referralCode = firstName + '-' + codeSuffix;
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

  await sendChiirpInvite({ name, phone, referralCode, referralLink, customerId: dbCustomer?.id });
  results.textsSent++;
}

// ── Step 6: Match "Referred by Code" back to referrer ────────
async function matchReferralByCode(referredByCode, referredCustomer, stCustomerId, jobId, jobTotal, payout, results) {
  const code = referredByCode.trim().toUpperCase();
  console.log(`[Poller] Job ${jobId} has "Referred by Code": ${code} — matching to referrer`);

  // Look up the referrer by their referral_code
  const { data: referrer } = await supabase
    .from('customers')
    .select('id, name, referral_code')
    .eq('referral_code', code)
    .single();

  if (!referrer) {
    console.warn(`[Poller] No referrer found for code "${code}" — skipping referral match`);
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

// ── Send Chiirp webhook ───────────────────────────────────────
async function sendChiirpInvite({ name, phone, referralCode, referralLink, customerId }) {
  if (!CHIIRP_WEBHOOK) {
    console.warn('[Poller] CHIIRP_WEBHOOK_URL not set — skipping text');
    return;
  }

  const firstName = name.split(' ')[0];
  // Format phone with country code for Chiirp
  const formattedPhone = phone.length === 10 ? `1${phone}` : phone;

  const payload = {
    first_name:    firstName,
    phone:         formattedPhone,
    referral_code: referralCode,
    referral_link: referralLink,
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
    console.error('[Poller] Chiirp webhook failed:', err.response?.data || err.message);
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

  // Create new
  const { data: created } = await supabase
    .from('customers')
    .insert({
      st_customer_id: id,
      name:           stCustomer.name,
      phone:          phone || '',
      email:          email || '',
      referral_link:  referralLink || '',
      referral_code:  referralCode,
    })
    .select()
    .single();

  return created;
}

// ── Helper: convert ALL CAPS to Title Case ────────────────────
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = router;
