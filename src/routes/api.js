const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { DEFAULTS: PAYOUT_DEFAULTS } = require('../utils/payout');
const { normalizeCode } = require('../utils/slugs');

async function getPortalPayoutInfo() {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['payout_percentage', 'payout_cap', 'new_customer_discount']);
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
// Called when someone lands on the referral page.
// Creates a "pending" referral record so we can track clicks.
// Deduplicates: only one pending referral per referrer at a time.
// ──────────────────────────────────────────────────────────────
router.post('/referral/click', async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });
  const normalized = normalizeCode(slug);

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .or(`referral_slug.eq.${slug},referral_code.eq.${normalized}`)
    .single();

  if (!customer) return res.status(404).json({ error: 'Invalid referral link' });

  // Check for existing pending referral from this referrer
  const { data: existingPending } = await supabase
    .from('referrals')
    .select('id')
    .eq('referrer_id', customer.id)
    .eq('status', 'pending')
    .limit(1)
    .single();

  if (existingPending) {
    // Already have a pending click — don't create a duplicate
    return res.json({ success: true, deduplicated: true });
  }

  await supabase.from('referrals').insert({
    referrer_id: customer.id,
    status: 'pending',
  });

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
