const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { generateSlug, buildReferralLink, generateReferralCode } = require('../utils/slugs');
const { calculatePayout } = require('../utils/payout');
const { sendReferralInvite } = require('../services/chiirp');

// ──────────────────────────────────────────────────────────────
// POST /webhooks/servicetitan
// ServiceTitan calls this endpoint when job events occur.
// ──────────────────────────────────────────────────────────────
router.post('/servicetitan', async (req, res) => {
  const payload = req.body;

  // Always respond 200 quickly so ST doesn't retry
  res.status(200).json({ received: true });

  // Log the raw event for debugging
  await supabase.from('job_events').insert({
    st_job_id: payload.jobId || payload.id || 'unknown',
    st_customer_id: payload.customerId || null,
    event_type: payload.eventType || payload.type || 'unknown',
    payload,
    processed: false,
  });

  const eventType = (payload.eventType || payload.type || '').toLowerCase();

  if (eventType.includes('job') && eventType.includes('complet')) {
    await handleJobCompleted(payload);
  }

  if (eventType.includes('booking') || eventType.includes('appointment')) {
    await handleNewBooking(payload);
  }
});

// ──────────────────────────────────────────────────────────────
// HANDLER: Job Completed
// 1. Upsert customer record with referral link
// 2. Send referral invite text via Chiirp (first time only)
// 3. Check if this customer was referred by someone
//    → if so, validate, look up tier, mark completed
// ──────────────────────────────────────────────────────────────
async function handleJobCompleted(payload) {
  try {
    const stCustomerId = String(payload.customerId || payload.customer?.id || '');
    const jobId = String(payload.jobId || payload.id || '');
    const jobTotal = parseFloat(payload.total || payload.jobTotal || 0);
    const customerName = payload.customerName || payload.customer?.name || 'Valued Customer';
    const customerPhone = normalizePhone(payload.customerPhone || payload.customer?.phone || '');
    const customerEmail = payload.customerEmail || payload.customer?.email || '';

    if (!stCustomerId) {
      console.warn('[ST Webhook] Job completed event missing customerId — skipping');
      return;
    }

    // Load payout settings
    const settings = await getPayoutSettings();
    const minJobValue = settings.min_job_value || '150';

    // ── Step 1: Upsert customer ──
    let customer = await getOrCreateCustomer({
      stCustomerId,
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
    });

    // ── Step 2: Send referral invite (only if not already sent) ──
    if (!customer.invite_sent_at && customerPhone) {
      const textResult = await sendReferralInvite(customer);
      if (textResult.success) {
        await supabase
          .from('customers')
          .update({ invite_sent_at: new Date().toISOString() })
          .eq('id', customer.id);
        console.log(`[Referral] Invite sent to ${customerName} (${customerPhone})`);
      }
    }

    // ── Step 3: Check if this customer was referred by someone ──
    const { data: referral } = await supabase
      .from('referrals')
      .select('*, referrer:referrer_id(id, name, phone, email, total_referrals, total_rewards)')
      .eq('referred_st_id', stCustomerId)
      .eq('status', 'booked')
      .single();

    if (referral) {
      // Validate job value threshold
      if (jobTotal < parseFloat(minJobValue)) {
        await supabase
          .from('referrals')
          .update({
            status: 'rejected',
            rejection_reason: `Job total $${jobTotal} is below minimum threshold of $${minJobValue}`,
            referred_job_id: jobId,
            referred_job_value: jobTotal,
          })
          .eq('id', referral.id);

        console.log(`[Referral] Rejected — job value $${jobTotal} below threshold`);
        return;
      }

      const { amount: payoutAmount, rule } = calculatePayout({
        invoiceTotal: jobTotal,
        settings,
      });

      await supabase
        .from('referrals')
        .update({
          status: 'completed',
          referred_job_id: jobId,
          referred_job_value: jobTotal,
          reward_amount: payoutAmount,
          tier_id: null,
        })
        .eq('id', referral.id);

      const referrer = referral.referrer;
      console.log(`[Referral] Qualified — ${referrer.name} referred ${referral.referred_name || 'a new customer'} | Invoice: $${jobTotal} | Payout: $${payoutAmount} (${rule}) | Awaiting payout`);
    }

    // Mark job event as processed
    await supabase
      .from('job_events')
      .update({ processed: true })
      .eq('st_job_id', jobId);

  } catch (err) {
    console.error('[handleJobCompleted] Error:', err.message);
  }
}

// ──────────────────────────────────────────────────────────────
// HANDLER: New Booking
// ──────────────────────────────────────────────────────────────
async function handleNewBooking(payload) {
  try {
    const referralSlug = payload.referralSlug || payload.customFields?.referralSlug || null;
    if (!referralSlug) return;

    const stCustomerId = String(payload.customerId || payload.customer?.id || '');
    const customerName = payload.customerName || payload.customer?.name || '';
    const customerPhone = normalizePhone(payload.customerPhone || payload.customer?.phone || '');

    // Find the referrer by slug or referral_code
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .or(`referral_slug.eq.${referralSlug},referral_code.eq.${referralSlug}`)
      .single();

    if (!customer) {
      console.warn(`[Booking] No customer found for slug/code: ${referralSlug}`);
      return;
    }

    // Check if referral record already exists
    const { data: referral } = await supabase
      .from('referrals')
      .select('id')
      .eq('referrer_id', customer.id)
      .eq('referred_phone', customerPhone)
      .single();

    if (referral) {
      await supabase
        .from('referrals')
        .update({
          status: 'booked',
          referred_st_id: stCustomerId,
          referred_name: customerName,
        })
        .eq('id', referral.id);
    } else {
      await supabase.from('referrals').insert({
        referrer_id: customer.id,
        referred_name: customerName,
        referred_phone: customerPhone,
        referred_st_id: stCustomerId,
        status: 'booked',
      });
    }

    console.log(`[Booking] Referral linked — slug: ${referralSlug}, new customer: ${customerName}`);
  } catch (err) {
    console.error('[handleNewBooking] Error:', err.message);
  }
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

async function getOrCreateCustomer({ stCustomerId, name, phone, email }) {
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('st_customer_id', stCustomerId)
    .single();

  if (existing) return existing;

  const slug = generateSlug(name);
  const referralLink = buildReferralLink(slug);
  const referralCode = generateReferralCode();

  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      st_customer_id: stCustomerId,
      name,
      phone,
      email,
      referral_slug: slug,
      referral_link: referralLink,
      referral_code: referralCode,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create customer: ${error.message}`);
  console.log(`[Customer] Created: ${name} | Slug: ${slug} | Code: ${referralCode}`);
  return created;
}

async function getPayoutSettings() {
  const keys = [
    'min_job_value',
    'payout_percentage',
    'payout_cap',
  ];
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', keys);
  const out = {};
  (data || []).forEach(row => { out[row.key] = row.value; });
  return out;
}

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^1/, '');
}

module.exports = router;
