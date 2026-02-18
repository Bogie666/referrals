const supabase = require('../db');

/**
 * Top-level KPI stats for the dashboard header cards.
 */
async function getStats() {
  // Total referrals by status
  const { data: statusCounts } = await supabase
    .from('referrals')
    .select('status');

  const counts = { pending: 0, booked: 0, completed: 0, rewarded: 0, rejected: 0 };
  (statusCounts || []).forEach(r => {
    if (counts[r.status] !== undefined) counts[r.status]++;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Total rewards paid
  const { data: rewardData } = await supabase
    .from('referrals')
    .select('reward_amount')
    .eq('status', 'rewarded');

  const totalRewardsPaid = (rewardData || []).reduce(
    (sum, r) => sum + parseFloat(r.reward_amount || 0), 0
  );

  // Total customers enrolled
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true });

  // Conversion rate: rewarded / total (excluding pending)
  const qualified = counts.booked + counts.completed + counts.rewarded + counts.rejected;
  const conversionRate = qualified > 0
    ? Math.round((counts.rewarded / qualified) * 100)
    : 0;

  // Texts sent this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: textsSentMonth } = await supabase
    .from('texts_log')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', startOfMonth.toISOString());

  return {
    total,
    statusCounts: counts,
    totalRewardsPaid,
    totalCustomers: totalCustomers || 0,
    conversionRate,
    textsSentMonth: textsSentMonth || 0,
  };
}

/**
 * Full referral list with referrer info, sorted newest first.
 */
async function getReferrals({ status = null, limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('referrals')
    .select(`
      id, referred_name, referred_phone, referred_email,
      referred_job_value, status, rejection_reason,
      reward_amount, tango_order_id, tango_sent_at,
      created_at, updated_at,
      referrer:referrer_id (
        id, name, phone, email, referral_slug, total_referrals, total_rewards
      )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  return { referrals: data || [], error };
}

/**
 * Top referrers — customers with the most successful referrals.
 */
async function getTopReferrers(limit = 10) {
  const { data } = await supabase
    .from('customers')
    .select('id, name, phone, email, total_referrals, total_rewards, referral_link, created_at')
    .gt('total_referrals', 0)
    .order('total_referrals', { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Recent activity feed — last N events across referrals and texts.
 */
async function getRecentActivity(limit = 20) {
  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_name, status, reward_amount, updated_at, referrer:referrer_id(name)')
    .order('updated_at', { ascending: false })
    .limit(limit);

  return (referrals || []).map(r => ({
    type: 'referral',
    id: r.id,
    timestamp: r.updated_at,
    status: r.status,
    referrerName: r.referrer?.name || 'Unknown',
    referredName: r.referred_name || 'New Customer',
    rewardAmount: r.reward_amount,
  }));
}

/**
 * Monthly referral trend — last 6 months.
 */
async function getMonthlyTrend() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });

    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    const { count: created } = await supabase
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', end);

    const { count: rewarded } = await supabase
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'rewarded')
      .gte('updated_at', start)
      .lte('updated_at', end);

    months.push({ label, created: created || 0, rewarded: rewarded || 0 });
  }
  return months;
}

module.exports = { getStats, getReferrals, getTopReferrers, getRecentActivity, getMonthlyTrend };
