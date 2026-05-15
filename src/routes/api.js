const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../db');
const { DEFAULTS: PAYOUT_DEFAULTS } = require('../utils/payout');
const { normalizeCode } = require('../utils/slugs');
const {
  SHARE_CHANNELS,
  resolveReferrerByCode,
  extractRequestContext,
  recordEvent,
} = require('../services/tracking');

const SESSION_COOKIE = 'lex_sid';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function readOrMintSession(req, res) {
  const existing = req.cookies?.[SESSION_COOKIE];
  if (existing && /^[a-f0-9-]{8,64}$/i.test(existing)) return existing;
  const sid = crypto.randomUUID();
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: false,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   SESSION_MAX_AGE_MS,
    path:     '/',
  });
  return sid;
}

async function getPortalPayoutInfo() {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['payout_percentage', 'payout_cap', 'new_customer_discount', 'min_job_value']);
  const map = {};
  (data || []).forEach(row => { map[row.key] = row.value; });
  const num = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    payoutPercentage: num(map.payout_percentage, PAYOUT_DEFAULTS.payout_percentage),
    payoutCap:        num(map.payout_cap, PAYOUT_DEFAULTS.payout_cap),
    discountAmount:   num(map.new_customer_discount, parseInt(process.env.NEW_CUSTOMER_DISCOUNT || '50', 10)),
    minJobValue:      num(map.min_job_value, parseInt(process.env.MIN_JOB_VALUE || '150', 10)),
  };
}

// ──────────────────────────────────────────────────────────────
// GET /api/referral/:slugOrCode
// WordPress shortcode calls this to render the landing page.
// Accepts either a slug (sarah-m-4f2a) or short code (4F2A-8B1C).
// ──────────────────────────────────────────────────────────────
router.get('/referral/:slugOrCode', async (req, res) => {
  const { slugOrCode } = req.params;
  const normalized = normalizeCode(slugOrCode);

  const [{ data: customer, error }, payoutInfo] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, referral_slug, referral_code, referral_link, total_referrals')
      .or(`referral_slug.eq.${slugOrCode},referral_code.eq.${normalized}`)
      .single(),
    getPortalPayoutInfo(),
  ]);

  if (error || !customer) {
    return res.status(404).json({ error: 'Referral link not found' });
  }

  res.json({
    referrerFirstName: customer.name.split(' ')[0],
    slug: customer.referral_slug,
    code: customer.referral_code,
    referralLink: customer.referral_link,
    discount: payoutInfo.discountAmount,
    payoutPercentage: payoutInfo.payoutPercentage,
    payoutCap: payoutInfo.payoutCap,
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/referral/click
// Called when a friend lands on /referral?r=CODE.
// Records every click as a tracking_event (no dedup), and still
// keeps the existing single-pending-referral row per referrer so
// the dashboard pipeline state machine stays unchanged.
// ──────────────────────────────────────────────────────────────
router.post('/referral/click', async (req, res) => {
  const { slug, channel } = req.body;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const customer = await resolveReferrerByCode(slug);
  if (!customer) return res.status(404).json({ error: 'Invalid referral link' });

  const sessionId = readOrMintSession(req, res);

  await recordEvent({
    eventType:      'link_click',
    code:           customer.referral_code,
    referrerId:     customer.id,
    channel:        channel || null,
    sessionId,
    requestContext: extractRequestContext(req),
  });

  const { data: existingPending } = await supabase
    .from('referrals')
    .select('id')
    .eq('referrer_id', customer.id)
    .eq('status', 'pending')
    .limit(1)
    .single();

  if (existingPending) {
    return res.json({ success: true, deduplicated: true, session_id: sessionId });
  }

  await supabase.from('referrals').insert({
    referrer_id: customer.id,
    status: 'pending',
  });

  res.json({ success: true, session_id: sessionId });
});

// ──────────────────────────────────────────────────────────────
// POST /api/share/event
// Fired by share buttons (sms, email, copy, copy_code, qr, native)
// before the browser navigates / invokes the share intent.
// ──────────────────────────────────────────────────────────────
router.post('/share/event', async (req, res) => {
  const { code, channel } = req.body || {};
  if (!code)    return res.status(400).json({ error: 'Missing code' });
  if (!channel || !SHARE_CHANNELS.has(channel)) {
    return res.status(400).json({ error: 'Missing or invalid channel' });
  }

  const customer = await resolveReferrerByCode(code);
  if (!customer) return res.status(404).json({ error: 'Invalid referral code' });

  const sessionId = req.cookies?.[SESSION_COOKIE] || null;

  await recordEvent({
    eventType:      'share',
    code:           customer.referral_code,
    referrerId:     customer.id,
    channel,
    sessionId,
    requestContext: extractRequestContext(req),
  });

  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// POST /api/portal/view
// Fired when the customer portal renders. Used by the WP shortcode;
// the Node /share/:code route logs portal_view server-side too.
// ──────────────────────────────────────────────────────────────
router.post('/portal/view', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const customer = await resolveReferrerByCode(code);
  if (!customer) return res.status(404).json({ error: 'Invalid referral code' });

  await recordEvent({
    eventType:      'portal_view',
    code:           customer.referral_code,
    referrerId:     customer.id,
    sessionId:      req.cookies?.[SESSION_COOKIE] || null,
    requestContext: extractRequestContext(req),
  });

  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// POST /api/funnel/event
// Called by the external scheduler at scheduler-mu-three.vercel.app
// to record the friend's scheduler funnel. Accepted event types:
//   scheduler_opened | slot_selected | customer_info_submitted | booking_confirmed
// Body: { type, code?, session_id?, metadata? }
// ──────────────────────────────────────────────────────────────
const FUNNEL_TYPES = new Set([
  'scheduler_opened',
  'slot_selected',
  'customer_info_submitted',
  'booking_confirmed',
]);

router.post('/funnel/event', async (req, res) => {
  const { type, code, session_id: sessionId, metadata } = req.body || {};

  if (!type || !FUNNEL_TYPES.has(type)) {
    return res.status(400).json({ error: 'Missing or invalid type' });
  }

  let referrerId = null;
  let canonicalCode = null;
  if (code) {
    const customer = await resolveReferrerByCode(code);
    referrerId    = customer?.id           || null;
    canonicalCode = customer?.referral_code || null;
  }

  await recordEvent({
    eventType:      type,
    code:           canonicalCode,
    referrerId,
    sessionId:      sessionId || req.cookies?.[SESSION_COOKIE] || null,
    metadata:       metadata || null,
    requestContext: extractRequestContext(req),
  });

  // Promote the friend's pending referral to `booked` as soon as the
  // scheduler confirms a booking — don't wait for the next poller run
  // (which only sees the friend's job once it's *completed* in ST).
  if (type === 'booking_confirmed' && referrerId) {
    const stJobId      = metadata?.st_job_id     ? String(metadata.st_job_id)     : null;
    const stCustomerId = metadata?.st_customer_id ? String(metadata.st_customer_id) : null;
    const friendName   = metadata?.referred_name ? String(metadata.referred_name).trim().slice(0, 100) : null;
    const friendPhone  = metadata?.referred_phone
      ? String(metadata.referred_phone).replace(/\D/g, '').replace(/^1/, '').slice(0, 15) || null
      : null;

    const { data: existing } = await supabase
      .from('referrals')
      .select('id, status')
      .eq('referrer_id', referrerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const patch = {
      status: 'booked',
      ...(stJobId      && { referred_job_id: stJobId }),
      ...(stCustomerId && { referred_st_id:  stCustomerId }),
      ...(friendName   && { referred_name:   friendName }),
      ...(friendPhone  && { referred_phone:  friendPhone }),
    };

    if (existing) {
      await supabase.from('referrals').update(patch).eq('id', existing.id);
    } else {
      await supabase.from('referrals').insert({ referrer_id: referrerId, ...patch });
    }
  }

  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// GET /api/customer/:stId/stats
// ──────────────────────────────────────────────────────────────
router.get('/customer/:stId/stats', async (req, res) => {
  const { stId } = req.params;

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, referral_link, referral_code, total_referrals, total_rewards')
    .eq('st_customer_id', stId)
    .single();

  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { data: referrals } = await supabase
    .from('referrals')
    .select('referred_name, status, reward_amount, created_at')
    .eq('referrer_id', customer.id)
    .order('created_at', { ascending: false });

  res.json({
    referralLink: customer.referral_link,
    referralCode: customer.referral_code,
    totalReferrals: customer.total_referrals,
    totalRewards: customer.total_rewards,
    referrals: referrals || [],
  });
});

module.exports = router;

// ──────────────────────────────────────────────────────────────
// POST /api/portal/lookup
// Customer portal — looks up a customer by phone number.
// ──────────────────────────────────────────────────────────────
router.post('/portal/lookup', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const normalized = String(phone).replace(/\D/g, '').replace(/^1/, '');
  if (normalized.length !== 10) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  // ── Step 1: Check Supabase first ──
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id, name, phone, email, referral_link, referral_slug, referral_code, total_referrals, total_rewards')
    .eq('phone', normalized)
    .single();

  if (existingCustomer?.referral_link) {
    const [{ data: referrals }, payoutInfo] = await Promise.all([
      supabase
        .from('referrals')
        .select('id, referred_name, status, reward_amount, created_at')
        .eq('referrer_id', existingCustomer.id)
        .order('created_at', { ascending: false }),
      getPortalPayoutInfo(),
    ]);

    return res.json({
      found: true,
      hasReferralLink: true,
      source: 'local',
      name: existingCustomer.name,
      referralLink: existingCustomer.referral_link,
      referralCode: existingCustomer.referral_code,
      totalReferrals: existingCustomer.total_referrals || 0,
      totalRewards: existingCustomer.total_rewards || 0,
      ...payoutInfo,
      referrals: referrals || [],
    });
  }

  // ── Step 2: Not in Supabase — check ServiceTitan ──
  console.log(`[Portal] ${normalized} not in local DB — checking ServiceTitan`);

  const { findCustomerByPhone, getCompletedJobCount, extractContactInfo } = require('../services/servicetitan');
  const { generateSlug, buildReferralLink, generateUniqueReferralCode } = require('../utils/slugs');

  let stCustomer;
  try {
    stCustomer = await findCustomerByPhone(normalized);
  } catch (err) {
    console.error('[Portal] ST lookup error:', err.message);
    return res.status(503).json({
      error: 'service_unavailable',
      message: 'Unable to verify your account right now. Please try again or call (972) 466-1917.',
    });
  }

  if (!stCustomer) {
    console.log(`[Portal] ${normalized} not found in ServiceTitan`);
    return res.status(404).json({ error: 'Customer not found' });
  }

  const contact = extractContactInfo(stCustomer);

  // ── Step 3: Check if they have completed jobs ──
  const completedJobs = stCustomer._hasJobs !== undefined
    ? (stCustomer._hasJobs ? 1 : 0)
    : await getCompletedJobCount(contact.stCustomerId);

  if (completedJobs === 0) {
    console.log(`[Portal] ${contact.name} found in ST but has no completed jobs`);
    return res.json({
      found: true,
      hasReferralLink: false,
      noJobsYet: true,
      name: contact.name,
      message: `Thanks for being a LEX customer, ${contact.name.split(' ')[0]}! Your referral link will be ready after your first completed service. Questions? Call us at (972) 466-1917.`,
    });
  }

  // ── Step 4: Qualify — generate their referral link ──
  console.log(`[Portal] Generating referral link for ${contact.name} (ST self-signup)`);

  const slug = generateSlug(contact.name);
  const referralCode = await generateUniqueReferralCode(supabase);
  const referralLink = buildReferralLink(referralCode);

  const { data: newCustomer, error: insertErr } = await supabase
    .from('customers')
    .insert({
      st_customer_id: contact.stCustomerId,
      name:           contact.name,
      phone:          normalized,
      email:          contact.email,
      referral_slug:  slug,
      referral_link:  referralLink,
      referral_code:  referralCode,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', normalized)
        .single();
      if (existing) {
        const payoutInfo = await getPortalPayoutInfo();
        return res.json({
          found: true,
          hasReferralLink: true,
          source: 'st_signup',
          name: existing.name,
          referralLink: existing.referral_link,
          referralCode: existing.referral_code,
          totalReferrals: 0,
          totalRewards: 0,
          ...payoutInfo,
          referrals: [],
          isNew: false,
        });
      }
    }
    console.error('[Portal] Failed to create customer:', insertErr.message);
    return res.status(500).json({ error: 'Failed to create referral link. Please try again.' });
  }

  console.log(`[Portal] New referral link created via ST self-signup: ${contact.name} -> ${slug}`);

  const payoutInfo = await getPortalPayoutInfo();
  return res.json({
    found: true,
    hasReferralLink: true,
    source: 'st_signup',
    isNew: true,
    name: newCustomer.name,
    referralLink: newCustomer.referral_link,
    referralCode: newCustomer.referral_code,
    totalReferrals: 0,
    totalRewards: 0,
    ...payoutInfo,
    referrals: [],
  });
});
