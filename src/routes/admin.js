const express = require('express');
const router = express.Router();
const { requireAdmin, requireSuperAdmin, createSession, destroySession, authenticateUser, hashPassword } = require('../middleware/adminAuth');
const { getStats, getReferrals, getTopReferrers, getRecentActivity, getMonthlyTrend, getTiers, getSettings, getAdminUsers } = require('../services/adminData');
const { renderLogin, renderDashboard } = require('../views/dashboard');
const { sendRewardNotification } = require('../services/chiirp');
const supabase = require('../db');

// ──────────────────────────────────────────────────────────────
// GET /admin/login
// ──────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  res.send(renderLogin());
});

// ──────────────────────────────────────────────────────────────
// POST /admin/login — per-user auth with bcrypt
// ──────────────────────────────────────────────────────────────
router.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.send(renderLogin('Please enter your email and password.'));
  }

  const user = await authenticateUser(email, password);

  if (!user) {
    return res.send(renderLogin('Invalid email or password.'));
  }

  const token = createSession(user.id);

  res.cookie('lex_admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.redirect('/admin');
});

// ──────────────────────────────────────────────────────────────
// GET /admin/logout
// ──────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  const token = req.cookies?.lex_admin_session;
  if (token) destroySession(token);
  res.clearCookie('lex_admin_session');
  res.redirect('/admin/login');
});

// ──────────────────────────────────────────────────────────────
// Load shared data for all dashboard pages
// ──────────────────────────────────────────────────────────────
async function loadDashboardData() {
  const [stats, { referrals }, topReferrers, recentActivity, monthlyTrend] = await Promise.all([
    getStats(),
    getReferrals({ limit: 100 }),
    getTopReferrers(20),
    getRecentActivity(30),
    getMonthlyTrend(),
  ]);
  return { stats, referrals, topReferrers, recentActivity, monthlyTrend };
}

// ──────────────────────────────────────────────────────────────
// GET /admin  (Overview)
// ──────────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const data = await loadDashboardData();
    res.send(renderDashboard({ ...data, activeTab: 'overview' }));
  } catch (err) {
    console.error('[Admin] Overview error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin/referrals
// ──────────────────────────────────────────────────────────────
router.get('/referrals', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || null;
    const [data, { referrals: filtered }] = await Promise.all([
      loadDashboardData(),
      getReferrals({ status, limit: 200 }),
    ]);
    res.send(renderDashboard({ ...data, referrals: filtered, activeTab: 'referrals' }));
  } catch (err) {
    console.error('[Admin] Referrals error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin/referrers
// ──────────────────────────────────────────────────────────────
router.get('/referrers', requireAdmin, async (req, res) => {
  try {
    const data = await loadDashboardData();
    res.send(renderDashboard({ ...data, activeTab: 'customers' }));
  } catch (err) {
    console.error('[Admin] Referrers error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin/activity
// ──────────────────────────────────────────────────────────────
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const data = await loadDashboardData();
    res.send(renderDashboard({ ...data, activeTab: 'activity' }));
  } catch (err) {
    console.error('[Admin] Activity error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin/portal
// ──────────────────────────────────────────────────────────────
router.get('/portal', requireAdmin, async (req, res) => {
  try {
    const data = await loadDashboardData();
    res.send(renderDashboard({ ...data, activeTab: 'portal' }));
  } catch (err) {
    console.error('[Admin] Portal preview error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin/settings
// ──────────────────────────────────────────────────────────────
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const [data, tiers, settings, adminUsers] = await Promise.all([
      loadDashboardData(),
      getTiers(),
      getSettings(),
      getAdminUsers(),
    ]);
    res.send(renderDashboard({ ...data, tiers, settings, adminUsers, activeTab: 'settings' }));
  } catch (err) {
    console.error('[Admin] Settings error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin/api/stats
// ──────────────────────────────────────────────────────────────
router.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /admin/api/referral/:id/payout
// Records a payout for a completed referral.
// Creates payout record, updates referral status, sends notification.
// ──────────────────────────────────────────────────────────────
router.post('/api/referral/:id/payout', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { payment_method, amount, reference_note } = req.body;

  if (!payment_method || !['physical_card', 'virtual_card'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  try {
    const { data: referral, error: fetchErr } = await supabase
      .from('referrals')
      .select('*, referrer:referrer_id(id, name, phone, email, total_referrals, total_rewards)')
      .eq('id', id)
      .single();

    if (fetchErr || !referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    if (referral.status === 'rewarded') {
      return res.status(400).json({ error: 'Referral is already rewarded' });
    }

    if (referral.status !== 'completed') {
      return res.status(400).json({ error: `Cannot pay out a referral with status: ${referral.status}` });
    }

    const payoutAmount = parseFloat(amount || referral.reward_amount || 75);

    // Create payout record
    await supabase.from('payouts').insert({
      referral_id: id,
      admin_user_id: req.adminUserId || null,
      amount: payoutAmount,
      payment_method,
      reference_note: reference_note || null,
    });

    // Update referral status
    await supabase
      .from('referrals')
      .update({
        status: 'rewarded',
        reward_amount: payoutAmount,
      })
      .eq('id', id);

    // Update customer totals
    const referrer = referral.referrer;
    await supabase
      .from('customers')
      .update({
        total_referrals: (referrer.total_referrals || 0) + 1,
        total_rewards:   (referrer.total_rewards || 0) + payoutAmount,
      })
      .eq('id', referrer.id);

    // Send reward notification text
    if (referrer.phone) {
      await sendRewardNotification(referrer, referral.referred_name, payoutAmount, payment_method);
    }

    console.log(`[Admin] Payout recorded — ${referrer.name} $${payoutAmount} via ${payment_method}`);
    res.json({ success: true, payoutAmount, paymentMethod: payment_method });

  } catch (err) {
    console.error('[Admin] payout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /admin/api/referral/:id/mark-rejected
// ──────────────────────────────────────────────────────────────
router.post('/api/referral/:id/mark-rejected', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const { error } = await supabase
      .from('referrals')
      .update({
        status: 'rejected',
        rejection_reason: reason || 'Manually rejected by admin',
      })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    console.log(`[Admin] Referral ${id} manually rejected — reason: ${reason}`);
    res.json({ success: true });

  } catch (err) {
    console.error('[Admin] mark-rejected error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// TIERS CRUD (super_admin only)
// ──────────────────────────────────────────────────────────────
router.post('/api/tiers', requireSuperAdmin, async (req, res) => {
  const { label, min_job_value, max_job_value, payout_amount } = req.body;

  if (!label || min_job_value == null || !payout_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data, error } = await supabase.from('referral_tiers').insert({
    label,
    min_job_value: parseFloat(min_job_value),
    max_job_value: max_job_value ? parseFloat(max_job_value) : null,
    payout_amount: parseFloat(payout_amount),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, tier: data });
});

router.put('/api/tiers/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { label, min_job_value, max_job_value, payout_amount, active } = req.body;

  const updates = {};
  if (label !== undefined) updates.label = label;
  if (min_job_value !== undefined) updates.min_job_value = parseFloat(min_job_value);
  if (max_job_value !== undefined) updates.max_job_value = max_job_value ? parseFloat(max_job_value) : null;
  if (payout_amount !== undefined) updates.payout_amount = parseFloat(payout_amount);
  if (active !== undefined) updates.active = active;

  const { error } = await supabase.from('referral_tiers').update(updates).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete('/api/tiers/:id', requireSuperAdmin, async (req, res) => {
  const { error } = await supabase.from('referral_tiers').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────────────────────
router.post('/api/settings', requireSuperAdmin, async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Invalid settings' });
  }

  for (const [key, value] of Object.entries(settings)) {
    await supabase
      .from('system_settings')
      .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }

  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// USER MANAGEMENT (super_admin only)
// ──────────────────────────────────────────────────────────────
router.post('/api/users', requireSuperAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const validRoles = ['admin', 'user'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or user' });
  }

  const password_hash = await hashPassword(password);

  const { data, error } = await supabase.from('admin_users').insert({
    name,
    email: email.toLowerCase().trim(),
    password_hash,
    role: role || 'user',
  }).select('id, name, email, role, active, created_at').single();

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'A user with that email already exists' });
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, user: data });
});

router.put('/api/users/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, role, active, password } = req.body;
  const updates = {};

  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email.toLowerCase().trim();
  if (role !== undefined) updates.role = role;
  if (active !== undefined) updates.active = active;
  if (password) updates.password_hash = await hashPassword(password);

  const { data, error } = await supabase
    .from('admin_users')
    .update(updates)
    .eq('id', id)
    .select('id, name, email, role, active, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, user: data });
});

// ──────────────────────────────────────────────────────────────
// ADMIN USER SETUP — seed initial super_admin
// POST /admin/api/setup — one-time setup, only works if no admin_users exist
// ──────────────────────────────────────────────────────────────
router.post('/api/setup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // Only allow if no users exist
  const { count } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true });

  if (count > 0) {
    return res.status(403).json({ error: 'Setup already completed. Admin users already exist.' });
  }

  const password_hash = await hashPassword(password);

  const { data, error } = await supabase.from('admin_users').insert({
    name,
    email: email.toLowerCase().trim(),
    password_hash,
    role: 'super_admin',
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  console.log(`[Admin] Super admin created: ${email}`);
  res.json({ success: true, message: `Super admin ${email} created. You can now log in.` });
});

module.exports = router;
