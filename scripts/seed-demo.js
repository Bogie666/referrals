/**
 * LEX Referral App — Demo Seed Script
 * ─────────────────────────────────────────────────────────────
 * Populates the database with realistic fake data for demos.
 *
 * Usage:
 *   node scripts/seed-demo.js          ← seeds the database
 *   node scripts/seed-demo.js --clear  ← wipes all demo data first, then re-seeds
 *
 * Safe to run multiple times with --clear.
 * Does NOT affect real ServiceTitan or send any texts/gift cards.
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { generateSlug, buildReferralLink } = require('../src/utils/slugs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Fake customers (these will become referrers) ──────────────
const DEMO_CUSTOMERS = [
  { st_customer_id: 'DEMO-001', name: 'Sarah Mitchell',  phone: '9724561001', email: 'sarah.mitchell@email.com' },
  { st_customer_id: 'DEMO-002', name: 'James Thornton',  phone: '9724561002', email: 'james.thornton@email.com' },
  { st_customer_id: 'DEMO-003', name: 'Maria Gonzalez',  phone: '9724561003', email: 'maria.gonzalez@email.com' },
  { st_customer_id: 'DEMO-004', name: 'Robert Chen',     phone: '9724561004', email: 'robert.chen@email.com'    },
  { st_customer_id: 'DEMO-005', name: 'Linda Patterson', phone: '9724561005', email: 'linda.patt@email.com'     },
  { st_customer_id: 'DEMO-006', name: 'David Nguyen',    phone: '9724561006', email: 'david.nguyen@email.com'   },
  { st_customer_id: 'DEMO-007', name: 'Karen Williams',  phone: '9724561007', email: 'karen.w@email.com'        },
  { st_customer_id: 'DEMO-008', name: 'Marcus Johnson',  phone: '9724561008', email: 'marcus.j@email.com'       },
  { st_customer_id: 'DEMO-009', name: 'Patricia Lee',    phone: '9724561009', email: 'pat.lee@email.com'        },
  { st_customer_id: 'DEMO-010', name: 'Tom Ramirez',     phone: '9724561010', email: 'tom.ramirez@email.com'    },
  { st_customer_id: 'DEMO-011', name: 'Angela Brooks',   phone: '9724561011', email: 'angela.b@email.com'       },
  { st_customer_id: 'DEMO-012', name: 'Chris Walker',    phone: '9724561012', email: 'cwalker@email.com'        },
];

// ── Fake referred people + their outcomes ─────────────────────
const DEMO_REFERRALS = [
  // Sarah has 3 referrals — your top performer
  { referrerIdx: 0, name: 'Kevin Mitchell',  phone: '9724562001', email: 'kevin.m@email.com',    status: 'rewarded',  jobValue: 485, daysAgo: 45 },
  { referrerIdx: 0, name: 'Amy Caldwell',    phone: '9724562002', email: 'amy.c@email.com',       status: 'rewarded',  jobValue: 320, daysAgo: 22 },
  { referrerIdx: 0, name: 'Brett Simpson',   phone: '9724562003', email: null,                    status: 'booked',    jobValue: null,daysAgo: 5  },

  // James has 2
  { referrerIdx: 1, name: 'Donna Harper',    phone: '9724562004', email: 'donna.h@email.com',     status: 'rewarded',  jobValue: 210, daysAgo: 30 },
  { referrerIdx: 1, name: 'Steve Olson',     phone: '9724562005', email: null,                    status: 'completed', jobValue: 575, daysAgo: 3  },

  // Maria has 2
  { referrerIdx: 2, name: 'Julia Reyes',     phone: '9724562006', email: 'julia.r@email.com',     status: 'rewarded',  jobValue: 890, daysAgo: 60 },
  { referrerIdx: 2, name: 'Carlos Mendez',   phone: '9724562007', email: null,                    status: 'pending',   jobValue: null,daysAgo: 1  },

  // Robert has 1
  { referrerIdx: 3, name: 'Fiona Chang',     phone: '9724562008', email: 'fiona.c@email.com',     status: 'rewarded',  jobValue: 340, daysAgo: 15 },

  // Linda has 1
  { referrerIdx: 4, name: 'Gary Simmons',    phone: '9724562009', email: null,                    status: 'booked',    jobValue: null,daysAgo: 8  },

  // David has 1
  { referrerIdx: 5, name: 'Tina Wallace',    phone: '9724562010', email: 'tina.w@email.com',      status: 'rejected',  jobValue: 85,  daysAgo: 12, rejectionReason: 'Job total $85 below minimum threshold of $150' },

  // Karen — pending only
  { referrerIdx: 6, name: null,              phone: null,          email: null,                   status: 'pending',   jobValue: null,daysAgo: 2  },

  // Marcus has 1 rewarded
  { referrerIdx: 7, name: 'Debra Stone',     phone: '9724562011', email: 'debra.s@email.com',     status: 'rewarded',  jobValue: 450, daysAgo: 20 },

  // Patricia — pending
  { referrerIdx: 8, name: null,              phone: null,          email: null,                   status: 'pending',   jobValue: null,daysAgo: 0  },

  // Tom — pending
  { referrerIdx: 9, name: null,              phone: null,          email: null,                   status: 'pending',   jobValue: null,daysAgo: 1  },
];

// ── Historical months for texts_log ───────────────────────────
function daysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Main ───────────────────────────────────────────────────────
async function seed() {
  const shouldClear = process.argv.includes('--clear');

  console.log('\n🌱 LEX Referral Demo Seed Script');
  console.log('─────────────────────────────────');

  if (shouldClear) {
    console.log('\n🗑  Clearing existing demo data...');
    // Delete in order to respect foreign keys
    await supabase.from('texts_log').delete().like('phone', '97245620%');
    await supabase.from('texts_log').delete().like('phone', '97245610%');
    await supabase.from('job_events').delete().like('st_job_id', 'DEMO-%');

    // Get demo customer IDs first
    const { data: demoCusts } = await supabase
      .from('customers')
      .select('id')
      .like('st_customer_id', 'DEMO-%');

    if (demoCusts?.length) {
      const ids = demoCusts.map(c => c.id);
      await supabase.from('referrals').delete().in('referrer_id', ids);
    }

    await supabase.from('customers').delete().like('st_customer_id', 'DEMO-%');
    console.log('   ✓ Demo data cleared');
  }

  // ── Step 1: Create customers ──
  console.log('\n👥 Creating demo customers...');
  const createdCustomers = [];

  for (const c of DEMO_CUSTOMERS) {
    const slug = generateSlug(c.name);
    const referral_link = buildReferralLink(slug);

    const { data, error } = await supabase
      .from('customers')
      .insert({ ...c, referral_slug: slug, referral_link })
      .select()
      .single();

    if (error) {
      console.error(`   ✗ Failed to create ${c.name}:`, error.message);
      createdCustomers.push(null);
    } else {
      console.log(`   ✓ ${c.name} → ${slug}`);
      createdCustomers.push(data);
    }
  }

  // ── Step 2: Create referrals ──
  console.log('\n🔗 Creating demo referrals...');
  const rewardAmount = parseFloat(process.env.REFERRER_REWARD || '75');

  for (const ref of DEMO_REFERRALS) {
    const referrer = createdCustomers[ref.referrerIdx];
    if (!referrer) continue;

    const createdAt = daysAgoDate(ref.daysAgo);
    const isRewarded = ref.status === 'rewarded';

    const { error } = await supabase.from('referrals').insert({
      referrer_id:        referrer.id,
      referred_name:      ref.name,
      referred_phone:     ref.phone,
      referred_email:     ref.email,
      referred_st_id:     ref.name ? `DEMO-REF-${Math.random().toString(36).slice(2,8).toUpperCase()}` : null,
      referred_job_id:    ref.jobValue ? `DEMO-JOB-${Math.random().toString(36).slice(2,8).toUpperCase()}` : null,
      referred_job_value: ref.jobValue,
      status:             ref.status,
      rejection_reason:   ref.rejectionReason || null,
      reward_amount:      rewardAmount,
      tango_order_id:     isRewarded ? `TANGO-DEMO-${Math.random().toString(36).slice(2,8).toUpperCase()}` : null,
      tango_sent_at:      isRewarded ? createdAt : null,
      created_at:         createdAt,
      updated_at:         createdAt,
    });

    if (error) {
      console.error(`   ✗ Referral for ${ref.name || 'pending'}:`, error.message);
    } else {
      console.log(`   ✓ ${referrer.name} → ${ref.name || '(pending click)'} [${ref.status}]`);
    }
  }

  // ── Step 3: Update customer totals ──
  console.log('\n📊 Updating customer referral totals...');
  const rewardedByReferrer = {};
  for (const ref of DEMO_REFERRALS) {
    const idx = ref.referrerIdx;
    if (!rewardedByReferrer[idx]) rewardedByReferrer[idx] = { count: 0, total: 0 };
    if (ref.status === 'rewarded') {
      rewardedByReferrer[idx].count++;
      rewardedByReferrer[idx].total += rewardAmount;
    }
  }

  for (const [idx, stats] of Object.entries(rewardedByReferrer)) {
    const customer = createdCustomers[parseInt(idx)];
    if (!customer || stats.count === 0) continue;
    await supabase
      .from('customers')
      .update({ total_referrals: stats.count, total_rewards: stats.total })
      .eq('id', customer.id);
    console.log(`   ✓ ${customer.name}: ${stats.count} referral(s), $${stats.total} earned`);
  }

  // ── Step 4: Create some texts_log entries ──
  console.log('\n💬 Creating texts log entries...');
  let textCount = 0;
  for (const customer of createdCustomers) {
    if (!customer) continue;
    const { error } = await supabase.from('texts_log').insert({
      customer_id:   customer.id,
      phone:         customer.phone,
      message:       `Hey ${customer.name.split(' ')[0]}! Thanks for choosing LEX Air Conditioning. Know someone who needs AC, heating, plumbing, or electrical work? Share your link and earn $${rewardAmount}! ${customer.referral_link}`,
      chiirp_msg_id: `DEMO-MSG-${Math.random().toString(36).slice(2,10).toUpperCase()}`,
      status:        'sent',
      sent_at:       daysAgoDate(randomBetween(1, 60)),
    });
    if (!error) textCount++;
  }
  console.log(`   ✓ ${textCount} invite texts logged`);

  // ── Step 5: Create some fake job events ──
  console.log('\n📋 Creating job event log...');
  let eventCount = 0;
  for (let i = 0; i < 8; i++) {
    const customer = createdCustomers[i % createdCustomers.length];
    if (!customer) continue;
    await supabase.from('job_events').insert({
      st_job_id:      `DEMO-JOB-${i.toString().padStart(3, '0')}`,
      st_customer_id: customer.st_customer_id,
      event_type:     'job.completed',
      payload:        { demo: true, customerId: customer.st_customer_id, total: randomBetween(150, 900) },
      processed:      true,
      created_at:     daysAgoDate(randomBetween(1, 60)),
    });
    eventCount++;
  }
  console.log(`   ✓ ${eventCount} job events logged`);

  // ── Summary ──
  console.log('\n✅ Demo seed complete!');
  console.log('─────────────────────────────────');
  console.log(`   Customers created:  ${createdCustomers.filter(Boolean).length}`);
  console.log(`   Referrals created:  ${DEMO_REFERRALS.length}`);
  console.log(`   Rewarded:           ${DEMO_REFERRALS.filter(r => r.status === 'rewarded').length}`);
  console.log(`   Total paid out:     $${DEMO_REFERRALS.filter(r => r.status === 'rewarded').length * rewardAmount}`);
  console.log('\n   Visit your admin dashboard to see the data:');
  console.log(`   ${process.env.SITE_URL || 'https://your-railway-url.up.railway.app'}/admin\n`);
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
