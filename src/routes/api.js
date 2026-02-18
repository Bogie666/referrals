const express = require('express');
const router = express.Router();
const supabase = require('../db');

// ──────────────────────────────────────────────────────────────
// GET /api/referral/:slug
// WordPress shortcode calls this to render the landing page.
// Returns referrer info so we can show "Sarah M. sent you this!"
// ──────────────────────────────────────────────────────────────
router.get('/referral/:slug', async (req, res) => {
  const { slug } = req.params;

  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, name, referral_slug, referral_link, total_referrals')
    .eq('referral_slug', slug)
    .single();

  if (error || !customer) {
    return res.status(404).json({ error: 'Referral link not found' });
  }

  // Return only safe public info
  res.json({
    referrerFirstName: customer.name.split(' ')[0],
    slug: customer.referral_slug,
    referralLink: customer.referral_link,
    discount: process.env.NEW_CUSTOMER_DISCOUNT || '50',
    reward: process.env.REFERRER_REWARD || '75',
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/referral/click
// Called when someone lands on the referral page.
// Creates a "pending" referral record so we can track clicks.
// ──────────────────────────────────────────────────────────────
router.post('/referral/click', async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('referral_slug', slug)
    .single();

  if (!customer) return res.status(404).json({ error: 'Invalid referral link' });

  // Create a pending referral (we'll fill in details when they book)
  await supabase.from('referrals').insert({
    referrer_id: customer.id,
    status: 'pending',
  });

  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// GET /api/customer/:stId/stats
// Returns a customer's referral stats for a "my referrals" view.
// (Optional — nice for a future customer portal)
// ──────────────────────────────────────────────────────────────
router.get('/customer/:stId/stats', async (req, res) => {
  const { stId } = req.params;

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, referral_link, total_referrals, total_rewards')
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
    totalReferrals: customer.total_referrals,
    totalRewards: customer.total_rewards,
    referrals: referrals || [],
  });
});

module.exports = router;

// ──────────────────────────────────────────────────────────────
// POST /api/portal/lookup
// Customer portal — looks up a customer by phone number.
// Flow:
//   1. Check Supabase (fast — covers customers with completed jobs)
//   2. If not found, check ServiceTitan by phone
//   3. If found in ST with completed jobs → generate link, save to Supabase
//   4. If found in ST but no completed jobs → "finish your first service" response
//   5. Not found anywhere → not a LEX customer
// ──────────────────────────────────────────────────────────────
router.post('/portal/lookup', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const normalized = String(phone).replace(/\D/g, '').replace(/^1/, '');
  if (normalized.length !== 10) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  // ── Step 1: Check Supabase first ──────────────────────────────
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id, name, phone, email, referral_link, referral_slug, total_referrals, total_rewards')
    .eq('phone', normalized)
    .single();

  if (existingCustomer?.referral_link) {
    // Already have them with a link — just return their data
    const { data: referrals } = await supabase
      .from('referrals')
      .select('id, referred_name, status, reward_amount, created_at')
      .eq('referrer_id', existingCustomer.id)
      .order('created_at', { ascending: false });

    return res.json({
      found: true,
      hasReferralLink: true,
      source: 'local',
      name: existingCustomer.name,
      referralLink: existingCustomer.referral_link,
      totalReferrals: existingCustomer.total_referrals || 0,
      totalRewards: existingCustomer.total_rewards || 0,
      rewardAmount: parseInt(process.env.REFERRER_REWARD || '75'),
      discountAmount: parseInt(process.env.NEW_CUSTOMER_DISCOUNT || '50'),
      referrals: referrals || [],
    });
  }

  // ── Step 2: Not in Supabase — check ServiceTitan ──────────────
  console.log(`[Portal] ${normalized} not in local DB — checking ServiceTitan`);

  const { findCustomerByPhone, getCompletedJobCount, extractContactInfo } = require('../services/servicetitan');
  const { generateSlug, buildReferralLink } = require('../utils/slugs');

  let stCustomer;
  try {
    stCustomer = await findCustomerByPhone(normalized);
  } catch (err) {
    console.error('[Portal] ST lookup error:', err.message);
    // If ST is unreachable, fail gracefully
    return res.status(503).json({
      error: 'service_unavailable',
      message: 'Unable to verify your account right now. Please try again or call (972) 466-1917.',
    });
  }

  // Not found in ST either — not a LEX customer
  if (!stCustomer) {
    console.log(`[Portal] ${normalized} not found in ServiceTitan`);
    return res.status(404).json({ error: 'Customer not found' });
  }

  const contact = extractContactInfo(stCustomer);

  // ── Step 3: Check if they have completed jobs ─────────────────
  // Demo mode uses internal _hasJobs flag; production calls ST jobs API
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

  // ── Step 4: Qualify — generate their referral link ───────────
  console.log(`[Portal] Generating referral link for ${contact.name} (ST self-signup)`);

  const slug = generateSlug(contact.name);
  const referralLink = buildReferralLink(slug);

  const { data: newCustomer, error: insertErr } = await supabase
    .from('customers')
    .insert({
      st_customer_id: contact.stCustomerId,
      name:           contact.name,
      phone:          normalized,
      email:          contact.email,
      referral_slug:  slug,
      referral_link:  referralLink,
    })
    .select()
    .single();

  if (insertErr) {
    // Handle race condition — another request may have just created it
    if (insertErr.code === '23505') {
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', normalized)
        .single();
      if (existing) {
        return res.json({
          found: true,
          hasReferralLink: true,
          source: 'st_signup',
          name: existing.name,
          referralLink: existing.referral_link,
          totalReferrals: 0,
          totalRewards: 0,
          rewardAmount: parseInt(process.env.REFERRER_REWARD || '75'),
          discountAmount: parseInt(process.env.NEW_CUSTOMER_DISCOUNT || '50'),
          referrals: [],
          isNew: false,
        });
      }
    }
    console.error('[Portal] Failed to create customer:', insertErr.message);
    return res.status(500).json({ error: 'Failed to create referral link. Please try again.' });
  }

  console.log(`[Portal] ✅ New referral link created via ST self-signup: ${contact.name} → ${slug}`);

  return res.json({
    found: true,
    hasReferralLink: true,
    source: 'st_signup',
    isNew: true,
    name: newCustomer.name,
    referralLink: newCustomer.referral_link,
    totalReferrals: 0,
    totalRewards: 0,
    rewardAmount: parseInt(process.env.REFERRER_REWARD || '75'),
    discountAmount: parseInt(process.env.NEW_CUSTOMER_DISCOUNT || '50'),
    referrals: [],
  });
});
