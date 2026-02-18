const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { generateSlug, buildReferralLink } = require('../utils/slugs');
const { sendReferralInvite, sendRewardNotification } = require('../services/chiirp');
const { issueGiftCard } = require('../services/tango');

const MIN_JOB_VALUE = parseFloat(process.env.MIN_JOB_VALUE || '150');
const REFERRER_REWARD = parseFloat(process.env.REFERRER_REWARD || '75');

// ──────────────────────────────────────────────────────────────
// POST /webhooks/servicetitan
// ServiceTitan calls this endpoint when job events occur.
// Configure in ST: Settings → Integrations → Webhooks
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

  // ── Job Completed → Create/find customer, send referral invite ──
  if (eventType.includes('job') && eventType.includes('complet')) {
    await handleJobCompleted(payload);
  }

  // ── Booking Created → Link referred customer to a referral record ──
  if (eventType.includes('booking') || eventType.includes('appointment')) {
    await handleNewBooking(payload);
  }
});

// ──────────────────────────────────────────────────────────────
// HANDLER: Job Completed
// 1. Upsert customer record with referral link
// 2. Send referral invite text via Chiirp
// 3. Check if this customer was themselves a referred customer
//    → if so, validate and reward the referrer
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

    // ── Step 1: Upsert customer ──
    let customer = await getOrCreateCustomer({
      stCustomerId,
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
    });

    // ── Step 2: Send referral invite (only on their first completed job) ──
    if (customer.total_referrals === 0 && customerPhone) {
      const textResult = await sendReferralInvite(customer);
      if (textResult.success) {
        console.log(`[Referral] Invite sent to ${customerName} (${customerPhone})`);
      }
    }

    // ── Step 3: Check if this customer was referred by someone ──
    // Look for a referral record where referred_st_id matches this customer
    const { data: referral } = await supabase
      .from('referrals')
      .select('*, referrer:referrer_id(id, name, phone, email)')
      .eq('referred_st_id', stCustomerId)
      .eq('status', 'booked')
      .single();

    if (referral) {
      // Validate job value threshold
      if (jobTotal < MIN_JOB_VALUE) {
        await supabase
          .from('referrals')
          .update({
            status: 'rejected',
            rejection_reason: `Job total $${jobTotal} is below minimum threshold of $${MIN_JOB_VALUE}`,
            referred_job_id: jobId,
            referred_job_value: jobTotal,
          })
          .eq('id', referral.id);

        console.log(`[Referral] Rejected — job value $${jobTotal} below threshold`);
        return;
      }

      // Mark as completed — ready for reward
      await supabase
        .from('referrals')
        .update({
          status: 'completed',
          referred_job_id: jobId,
          referred_job_value: jobTotal,
        })
        .eq('id', referral.id);

      const referrer = referral.referrer;
      console.log(`[Referral] ✅ Qualified — ${referrer.name} referred ${referral.referred_name || 'a new customer'} | Job: $${jobTotal} | Awaiting reward`);

      // ── Auto reward via Tango Card (opt-in) ──────────────────
      // Set TANGO_AUTO_REWARD=true in your environment to enable.
      // By default, referrals stay in 'completed' and are rewarded
      // manually via the admin dashboard.
      const autoReward = process.env.TANGO_AUTO_REWARD === 'true';

      if (autoReward) {
        if (!referrer.email) {
          console.warn(`[Referral] Auto-reward skipped — ${referrer.name} has no email on file`);
        } else {
          const giftCard = await issueGiftCard({
            recipientEmail: referrer.email,
            recipientName: referrer.name,
            amount: REFERRER_REWARD,
            referralId: referral.id,
          });

          if (giftCard.success) {
            await sendRewardNotification(referrer, referral.referred_name);
            await supabase
              .from('customers')
              .update({
                total_referrals: referrer.total_referrals + 1,
                total_rewards: referrer.total_rewards + REFERRER_REWARD,
              })
              .eq('id', referrer.id);
            console.log(`[Referral] 🎁 Auto-rewarded ${referrer.name} $${REFERRER_REWARD} via Tango Card`);
          }
        }
      }
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
// When a new booking comes in and was tagged with a referral slug,
// link the new customer's ST ID to the referral record.
// ──────────────────────────────────────────────────────────────
async function handleNewBooking(payload) {
  try {
    const referralSlug = payload.referralSlug || payload.customFields?.referralSlug || null;
    if (!referralSlug) return; // Not a referred booking

    const stCustomerId = String(payload.customerId || payload.customer?.id || '');
    const customerName = payload.customerName || payload.customer?.name || '';
    const customerPhone = normalizePhone(payload.customerPhone || payload.customer?.phone || '');

    // Find the pending referral for this slug
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('referral_slug', referralSlug)
      .single();

    if (!customer) {
      console.warn(`[Booking] No customer found for slug: ${referralSlug}`);
      return;
    }

    // Check if referral record already exists (clicked link = pending)
    const { data: referral } = await supabase
      .from('referrals')
      .select('id')
      .eq('referrer_id', customer.id)
      .eq('referred_phone', customerPhone)
      .single();

    if (referral) {
      // Update existing referral to booked status
      await supabase
        .from('referrals')
        .update({
          status: 'booked',
          referred_st_id: stCustomerId,
          referred_name: customerName,
        })
        .eq('id', referral.id);
    } else {
      // Create new referral record (they booked without clicking first)
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
  // Try to find existing customer
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('st_customer_id', stCustomerId)
    .single();

  if (existing) return existing;

  // Create new customer with unique slug
  const slug = generateSlug(name);
  const referralLink = buildReferralLink(slug);

  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      st_customer_id: stCustomerId,
      name,
      phone,
      email,
      referral_slug: slug,
      referral_link: referralLink,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create customer: ${error.message}`);
  console.log(`[Customer] Created: ${name} | Slug: ${slug}`);
  return created;
}

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^1/, ''); // strip country code
}

module.exports = router;
