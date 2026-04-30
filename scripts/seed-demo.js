/**
 * LEX Referral App — Demo Seed Script
 * ─────────────────────────────────────────────────────────────
 * Populates the database with a small, realistic demo dataset.
 *
 * Usage:
 *   node scripts/seed-demo.js          ← seeds the database (errors if data exists)
 *   node scripts/seed-demo.js --clear  ← wipes ALL customer/referral data, then re-seeds
 *
 * --clear is destructive: it deletes every row in
 *   customers, referrals, payouts, job_events, texts_log
 * regardless of whether it was created by this script. It does NOT
 * touch system_settings, admin_users, poll_state, or referral_tiers.
 *
 * Codes are generated via generateUniqueReferralCode (6-char
 * alphanumeric, no ambiguous chars). Reward amounts are computed
 * via calculatePayout() against the live system_settings values.
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { generateSlug, buildReferralLink, generateUniqueReferralCode } = require('../src/utils/slugs');
const { calculatePayout } = require('../src/utils/payout');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Demo customers (referrers) ────────────────────────────────
const DEMO_CUSTOMERS = [
  { st_customer_id: 'DEMO-001', name: 'Sarah Mitchell',  phone: '9724560001', email: 'sarah.mitchell@example.com' },
  { st_customer_id: 'DEMO-002', name: 'James Thornton',  phone: '9724560002', email: 'james.thornton@example.com' },
  { st_customer_id: 'DEMO-003', name: 'Maria Gonzalez',  phone: '9724560003', email: 'maria.gonzalez@example.com' },
  { st_customer_id: 'DEMO-004', name: 'Robert Chen',     phone: '9724560004', email: 'robert.chen@example.com' },
  { st_customer_id: 'DEMO-005', name: 'Linda Patterson', phone: '9724560005', email: 'linda.patt@example.com' },
];

// ── Demo referrals — referrerIdx is the index in DEMO_CUSTOMERS ─
const DEMO_REFERRALS = [
  // Sarah — top performer, 2 rewarded; Amy's $5,500 invoice hits the $250 cap
  { referrerIdx: 0, name: 'Kevin Mitchell', phone: '9724562001', email: 'kevin.m@example.com', status: 'rewarded',  jobValue: 485,  daysAgo: 45 },
  { referrerIdx: 0, name: 'Amy Caldwell',   phone: '9724562002', email: 'amy.c@example.com',   status: 'rewarded',  jobValue: 5500, daysAgo: 22 },

  // James — 1 rewarded, 1 awaiting payout (lights up the dashboard alert)
  { referrerIdx: 1, name: 'Donna Harper',   phone: '9724562003', email: 'donna.h@example.com', status: 'rewarded',  jobValue: 750,  daysAgo: 30 },
  { referrerIdx: 1, name: 'Steve Olson',    phone: '9724562004', email: 'steve.o@example.com', status: 'completed', jobValue: 1200, daysAgo: 3  },

  // Maria — referral booked but job not yet complete
  { referrerIdx: 2, name: 'Carlos Mendez',  phone: '9724562005', email: null,                  status: 'booked',    jobValue: null, daysAgo: 1  },

  // Linda — referral rejected (below $150 minimum)
  { referrerIdx: 4, name: 'Tina Wallace',   phone: '9724562006', email: 'tina.w@example.com',  status: 'rejected',  jobValue: 85,   daysAgo: 12, rejectionReason: 'Job total $85 below minimum threshold of $150' },

  // Robert (idx 3) intentionally has zero referrals
];

const PAYMENT_METHODS = ['physical_card', 'virtual_card'];
const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function loadPayoutSettings() {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['payout_percentage', 'payout_cap', 'min_job_value']);
  const out = {};
  (data || []).forEach(row => { out[row.key] = row.value; });
  return out;
}

async function clearAll() {
  console.log('\n🗑  Clearing customer/referral data...');
  // Delete order matters because of FKs:
  // payouts → referrals → texts_log → customers; job_events is independent
  for (const table of ['payouts', 'texts_log', 'referrals', 'job_events', 'customers']) {
    const { error } = await supabase.from(table).delete().neq('id', SENTINEL_UUID);
    if (error) {
      throw new Error(`Failed to clear ${table}: ${error.message}`);
    }
    console.log(`   ✓ ${table} cleared`);
  }
}

async function seed() {
  const shouldClear = process.argv.includes('--clear');

  console.log('\n🌱 LEX Referral Demo Seed');
  console.log('─────────────────────────');

  if (shouldClear) {
    await clearAll();
  } else {
    const { count } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true });
    if (count && count > 0) {
      console.error(`\n❌ Refusing to seed: ${count} customer row(s) already exist.`);
      console.error('   Re-run with --clear to wipe and reseed.');
      process.exit(1);
    }
  }

  const settings = await loadPayoutSettings();
  console.log(`\n⚙  Using payout settings: ${settings.payout_percentage || '5'}% capped at $${settings.payout_cap || '250'}`);

  // ── Step 1: Create customers with fresh codes ──
  console.log('\n👥 Creating customers...');
  const customers = [];
  for (const c of DEMO_CUSTOMERS) {
    const slug = generateSlug(c.name);
    const referralLink = buildReferralLink(slug);
    const referralCode = await generateUniqueReferralCode(supabase);

    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...c,
        referral_slug: slug,
        referral_link: referralLink,
        referral_code: referralCode,
        invite_sent_at: daysAgoIso(60),
      })
      .select()
      .single();

    if (error) {
      console.error(`   ✗ ${c.name}: ${error.message}`);
      customers.push(null);
    } else {
      console.log(`   ✓ ${c.name.padEnd(20)} code: ${referralCode}`);
      customers.push(data);
    }
  }

  // ── Step 2: Create referrals + (for rewarded) payout rows ──
  console.log('\n🔗 Creating referrals...');
  const totals = {}; // referrerIdx → { count, rewards }

  for (const ref of DEMO_REFERRALS) {
    const referrer = customers[ref.referrerIdx];
    if (!referrer) continue;

    const createdAt = daysAgoIso(ref.daysAgo);

    let rewardAmount = 0;
    if (ref.status === 'rewarded' || ref.status === 'completed') {
      const calc = calculatePayout({ invoiceTotal: ref.jobValue || 0, settings });
      rewardAmount = calc.amount;
    }

    const { data: insertedReferral, error } = await supabase
      .from('referrals')
      .insert({
        referrer_id:        referrer.id,
        referred_name:      ref.name,
        referred_phone:     ref.phone,
        referred_email:     ref.email,
        referred_st_id:     ref.name ? `DEMO-REF-${ref.referrerIdx}-${ref.daysAgo}` : null,
        referred_job_id:    ref.jobValue ? `DEMO-JOB-${ref.referrerIdx}-${ref.daysAgo}` : null,
        referred_job_value: ref.jobValue,
        status:             ref.status,
        rejection_reason:   ref.rejectionReason || null,
        reward_amount:      rewardAmount,
        created_at:         createdAt,
        updated_at:         createdAt,
      })
      .select()
      .single();

    if (error) {
      console.error(`   ✗ ${referrer.name} → ${ref.name || '(pending)'}: ${error.message}`);
      continue;
    }

    console.log(`   ✓ ${referrer.name.padEnd(20)} → ${(ref.name || '(pending)').padEnd(18)} [${ref.status}]${rewardAmount ? ` $${rewardAmount}` : ''}`);

    if (ref.status === 'rewarded') {
      const paidAt = daysAgoIso(Math.max(0, ref.daysAgo - 2));
      const method = PAYMENT_METHODS[ref.referrerIdx % PAYMENT_METHODS.length];
      const { error: payoutErr } = await supabase.from('payouts').insert({
        referral_id:    insertedReferral.id,
        admin_user_id:  null,
        amount:         rewardAmount,
        payment_method: method,
        reference_note: 'Seed data',
        paid_at:        paidAt,
        created_at:     paidAt,
      });
      if (payoutErr) {
        console.error(`     ✗ payout row: ${payoutErr.message}`);
      } else {
        if (!totals[ref.referrerIdx]) totals[ref.referrerIdx] = { count: 0, rewards: 0 };
        totals[ref.referrerIdx].count++;
        totals[ref.referrerIdx].rewards += rewardAmount;
      }
    }
  }

  // ── Step 3: Update customer totals to match payouts ──
  console.log('\n📊 Updating customer totals...');
  for (const [idxStr, t] of Object.entries(totals)) {
    const customer = customers[parseInt(idxStr)];
    if (!customer) continue;
    await supabase
      .from('customers')
      .update({ total_referrals: t.count, total_rewards: t.rewards })
      .eq('id', customer.id);
    console.log(`   ✓ ${customer.name}: ${t.count} rewarded, $${t.rewards.toFixed(2)} earned`);
  }

  // ── Step 4: Texts_log entries (one invite per customer) ──
  console.log('\n💬 Logging invite texts...');
  let textCount = 0;
  for (const c of customers) {
    if (!c) continue;
    const { error } = await supabase.from('texts_log').insert({
      customer_id:   c.id,
      phone:         c.phone,
      message:       `Hey ${c.name.split(' ')[0]}! Thanks for choosing LEX. Share your referral code ${c.referral_code} with friends — they save $50, you earn 5% of their invoice.`,
      chiirp_msg_id: `DEMO-MSG-${c.st_customer_id}`,
      status:        'sent',
      sent_at:       daysAgoIso(60),
    });
    if (!error) textCount++;
  }
  console.log(`   ✓ ${textCount} invite text(s) logged`);

  // ── Summary ──
  const rewardedCount = DEMO_REFERRALS.filter(r => r.status === 'rewarded').length;
  const completedCount = DEMO_REFERRALS.filter(r => r.status === 'completed').length;
  const totalPaid = Object.values(totals).reduce((sum, t) => sum + t.rewards, 0);

  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────');
  console.log(`   Customers:        ${customers.filter(Boolean).length}`);
  console.log(`   Referrals:        ${DEMO_REFERRALS.length}`);
  console.log(`   Rewarded:         ${rewardedCount}`);
  console.log(`   Awaiting payout:  ${completedCount}`);
  console.log(`   Total paid:       $${totalPaid.toFixed(2)}`);
  console.log('\n   Visit /admin to see the dashboard.\n');
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
