const supabase = require('../db');

/**
 * Top-level KPI stats for the dashboard header cards.
 */
async function getStats() {
  const { data: statusCounts } = await supabase
    .from('referrals')
    .select('status');

  const counts = { pending: 0, booked: 0, completed: 0, rewarded: 0, rejected: 0 };
  (statusCounts || []).forEach(r => {
    if (counts[r.status] !== undefined) counts[r.status]++;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Total rewards paid (from payouts table)
  const { data: payoutData } = await supabase
    .from('payouts')
    .select('amount');

  const totalRewardsPaid = (payoutData || []).reduce(
    (sum, p) => sum + parseFloat(p.amount || 0), 0
  );

  // Fallback: also check referrals marked rewarded (for legacy data)
  if (totalRewardsPaid === 0) {
    const { data: rewardData } = await supabase
      .from('referrals')
      .select('reward_amount')
      .eq('status', 'rewarded');

    const legacyTotal = (rewardData || []).reduce(
      (sum, r) => sum + parseFloat(r.reward_amount || 0), 0
    );
    if (legacyTotal > 0) {
      // Use legacy total if no payouts exist yet
      return buildStats(counts, total, legacyTotal);
    }
  }

  return buildStats(counts, total, totalRewardsPaid);
}

async function buildStats(counts, total, totalRewardsPaid) {
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true });

  const qualified = counts.booked + counts.completed + counts.rewarded + counts.rejected;
  const conversionRate = qualified > 0
    ? Math.round((counts.rewarded / qualified) * 100)
    : 0;

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
      reward_amount, tier_id,
      created_at, updated_at,
      referrer:referrer_id (
        id, name, phone, email, referral_slug, total_referrals, total_rewards
      )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  return { referrals: data || [], error };
}

/**
 * Get payout history for a referral.
 */
async function getPayoutForReferral(referralId) {
  const { data } = await supabase
    .from('payouts')
    .select('*, admin:admin_user_id(name)')
    .eq('referral_id', referralId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

/**
 * Top referrers — customers with the most successful referrals.
 */
async function getTopReferrers(limit = 10) {
  const { data } = await supabase
    .from('customers')
    .select('id, name, phone, email, total_referrals, total_rewards, referral_link, referral_code, created_at')
    .gt('total_referrals', 0)
    .order('total_referrals', { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * All customers, newest first. Used by the admin Customers tab so
 * staff can look anyone up — including customers who've been enrolled
 * but haven't yet had a referral come back.
 */
async function getAllCustomers(limit = 500) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, email, st_customer_id, total_referrals, total_rewards, referral_link, referral_code, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[adminData] getAllCustomers failed:', error.message, error.details || '');
    return [];
  }
  return data || [];
}

/**
 * Recent activity feed.
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
 * Unified timeline: referral state transitions + tracking_events,
 * merged by timestamp. Used by the /admin/activity tab so the feed
 * shows clicks, portal views, shares, and scheduler-funnel events
 * alongside booked / completed / rewarded transitions.
 */
async function getActivityTimeline(limit = 100) {
  const [{ data: referrals }, { data: events }] = await Promise.all([
    supabase
      .from('referrals')
      .select('id, referred_name, status, reward_amount, updated_at, created_at, referrer:referrer_id(name)')
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabase
      .from('tracking_events')
      .select('id, event_type, referral_code, channel, session_id, referer, created_at, referrer:referrer_id(name)')
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const refItems = (referrals || []).map(r => ({
    kind:         'referral',
    id:           r.id,
    timestamp:    r.updated_at || r.created_at,
    subtype:      r.status,
    referrerName: r.referrer?.name || 'Unknown',
    referredName: r.referred_name || null,
    rewardAmount: r.reward_amount,
  }));

  const eventItems = (events || []).map(e => ({
    kind:         'tracking',
    id:           e.id,
    timestamp:    e.created_at,
    subtype:      e.event_type,
    referrerName: e.referrer?.name || null,
    referralCode: e.referral_code,
    channel:      e.channel,
    sessionId:    e.session_id,
    referer:      e.referer,
  }));

  return [...refItems, ...eventItems]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
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

/**
 * Get all system settings.
 */
async function getSettings() {
  const { data } = await supabase
    .from('system_settings')
    .select('*');
  const settings = {};
  (data || []).forEach(s => { settings[s.key] = s.value; });
  return settings;
}

/**
 * Get all admin users (exclude password hash).
 */
async function getAdminUsers() {
  const { data } = await supabase
    .from('admin_users')
    .select('id, name, email, role, active, last_login_at, created_at')
    .order('created_at', { ascending: true });
  return data || [];
}

/**
 * System health: poller liveness + recent Chiirp webhook outcomes.
 * Read-only; safe to poll on every dashboard load.
 */
async function getSystemStatus() {
  const now = Date.now();

  const { data: pollRow } = await supabase
    .from('poll_state')
    .select('last_polled_at, updated_at')
    .eq('id', 'jobs')
    .maybeSingle();

  const lastPolledAt = pollRow?.last_polled_at || null;
  const minutesSincePoll = lastPolledAt
    ? Math.floor((now - new Date(lastPolledAt).getTime()) / 60000)
    : null;

  let pollerStatus = 'unknown';
  if (minutesSincePoll === null)       pollerStatus = 'unknown';
  else if (minutesSincePoll <= 90)     pollerStatus = 'green';
  else if (minutesSincePoll <= 180)    pollerStatus = 'yellow';
  else                                  pollerStatus = 'red';

  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentJobs } = await supabase
    .from('job_events')
    .select('event_type, created_at')
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(100);

  const jobsLast24h = (recentJobs || []).length;

  const { data: recentTexts } = await supabase
    .from('texts_log')
    .select('id, phone, message, status, sent_at')
    .order('sent_at', { ascending: false })
    .limit(10);

  const texts = recentTexts || [];
  const lastSuccess = texts.find(t => t.status === 'sent') || null;
  const lastFailure = texts.find(t => t.status === 'failed') || null;
  const mostRecent  = texts[0] || null;

  let chiirpStatus = 'unknown';
  if (!mostRecent)                                          chiirpStatus = 'unknown';
  else if (mostRecent.status === 'failed')                  chiirpStatus = 'red';
  else if (lastFailure
           && new Date(lastFailure.sent_at).getTime() > now - 24 * 60 * 60 * 1000) chiirpStatus = 'yellow';
  else                                                       chiirpStatus = 'green';

  const { data: recentEvents } = await supabase
    .from('tracking_events')
    .select('event_type, created_at')
    .gte('created_at', since24h);

  const counts = {
    portal_view: 0, share: 0, link_click: 0,
    scheduler_opened: 0, slot_selected: 0,
    customer_info_submitted: 0, booking_confirmed: 0,
  };
  (recentEvents || []).forEach(e => {
    if (counts[e.event_type] !== undefined) counts[e.event_type]++;
  });

  const trackingTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const trackingStatus = trackingTotal > 0 ? 'green' : 'unknown';

  return {
    poller: {
      status: pollerStatus,
      lastPolledAt,
      minutesSincePoll,
      jobsLast24h,
    },
    chiirp: {
      status: chiirpStatus,
      lastSendAt: mostRecent?.sent_at || null,
      lastFailureAt: lastFailure?.sent_at || null,
      recent: texts.map(t => ({
        phone: t.phone,
        status: t.status,
        sentAt: t.sent_at,
        message: (t.message || '').slice(0, 200),
      })),
    },
    tracking: {
      status: trackingStatus,
      total24h: trackingTotal,
      counts,
    },
  };
}

module.exports = {
  getStats, getReferrals, getPayoutForReferral, getTopReferrers, getAllCustomers,
  getRecentActivity, getActivityTimeline, getMonthlyTrend, getSettings, getAdminUsers, getSystemStatus,
};
