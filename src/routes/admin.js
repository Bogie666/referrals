const express = require('express');
const router = express.Router();
const { requireAdmin, requireSuperAdmin, requireWriteAccess, createSession, destroySession, authenticateUser, hashPassword } = require('../middleware/adminAuth');
const { getStats, getReferrals, getTopReferrers, getAllCustomers, getRecentActivity, getMonthlyTrend, getSettings, getAdminUsers, getSystemStatus } = require('../services/adminData');
const { renderLogin, renderDashboard } = require('../views/dashboard');
const { sendRewardNotification, sendReferralInvite } = require('../services/chiirp');
const { getAccessToken, writeReferralCodeToCustomer } = require('../services/servicetitan');
const { generateSlug, buildReferralLink, generateUniqueReferralCode } = require('../utils/slugs');
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
  const [stats, { referrals }, topReferrers, recentActivity, monthlyTrend, systemStatus] = await Promise.all([
    getStats(),
    getReferrals({ limit: 100 }),
    getTopReferrers(20),
    getRecentActivity(30),
    getMonthlyTrend(),
    getSystemStatus(),
  ]);
  return { stats, referrals, topReferrers, recentActivity, monthlyTrend, systemStatus };
}

router.get('/api/status', requireAdmin, async (req, res) => {
  try {
    const status = await getSystemStatus();
    res.json(status);
  } catch (err) {
    console.error('[Admin] Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin  (Overview)
// ──────────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const data = await loadDashboardData();
    res.send(renderDashboard({ ...data, currentUser: req.adminUser, activeTab: 'overview' }));
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
    res.send(renderDashboard({ ...data, referrals: filtered, currentUser: req.adminUser, activeTab: 'referrals' }));
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
    const [data, allCustomers] = await Promise.all([
      loadDashboardData(),
      getAllCustomers(500),
    ]);
    res.send(renderDashboard({ ...data, allCustomers, currentUser: req.adminUser, activeTab: 'customers' }));
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
    res.send(renderDashboard({ ...data, currentUser: req.adminUser, activeTab: 'activity' }));
  } catch (err) {
    console.error('[Admin] Activity error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /admin/settings
// ──────────────────────────────────────────────────────────────
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const [data, settings, adminUsers] = await Promise.all([
      loadDashboardData(),
      getSettings(),
      getAdminUsers(),
    ]);
    res.send(renderDashboard({ ...data, settings, adminUsers, currentUser: req.adminUser, activeTab: 'settings' }));
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
router.post('/api/referral/:id/payout', requireWriteAccess, async (req, res) => {
  const { id } = req.params;
  const { payment_method, amount, reference_note } = req.body;

  if (!payment_method || !['physical_card', 'virtual_card'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  try {
    const { data: referral, error: fetchErr } = await supabase
      .from('referrals')
      .select('*, referrer:referrer_id(id, name, phone, email, referral_code, total_referrals, total_rewards)')
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

    const payoutAmount = parseFloat(amount || referral.reward_amount || 0);
    if (!(payoutAmount > 0)) {
      return res.status(400).json({ error: 'Payout amount is missing or zero' });
    }

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
router.post('/api/referral/:id/mark-rejected', requireWriteAccess, async (req, res) => {
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
// POST /admin/api/customers
// Manually enroll a customer. Used for VIPs, manual data entry,
// or backfilling a customer the poller missed. Generates a fresh
// unique code, inserts in Supabase, and (when given a real ST
// customer ID) writes the code back to ST. Optionally fires the
// Chiirp invite immediately.
//
// Body: { name, phone, email?, st_customer_id?, send_invite? }
// Returns: { success, customer, stWriteResult, chiirpResult }
// ──────────────────────────────────────────────────────────────
router.post('/api/customers', requireWriteAccess, async (req, res) => {
  const { name, phone, email, st_customer_id, send_invite } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const phoneDigits = String(phone || '').replace(/\D/g, '').replace(/^1/, '');
  if (phoneDigits.length !== 10) {
    return res.status(400).json({ error: 'Phone must be a 10-digit number' });
  }
  const emailClean = email ? String(email).toLowerCase().trim() : '';

  // Resolve ST customer ID. If admin provides one, we'll try to
  // write the code back to that ST record. If they don't, we
  // generate a MANUAL- placeholder so the unique constraint is
  // happy but the ST write-back is skipped.
  const stIdInput = st_customer_id ? String(st_customer_id).trim() : '';
  const stId = stIdInput || `MANUAL-${Date.now()}`;
  const isRealStId = stIdInput && !stIdInput.startsWith('MANUAL-');

  let code, slug, link;
  try {
    code = await generateUniqueReferralCode(supabase);
    slug = generateSlug(name);
    link = buildReferralLink(code);
  } catch (err) {
    console.error('[Admin] code generation failed:', err.message);
    return res.status(500).json({ error: 'Failed to generate referral code' });
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      st_customer_id: stId,
      name:           String(name).trim(),
      phone:          phoneDigits,
      email:          emailClean,
      referral_slug:  slug,
      referral_link:  link,
      referral_code:  code,
      invite_sent_at: send_invite ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A customer with that ST customer ID or phone already exists' });
    }
    console.error('[Admin] manual enroll insert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  console.log(`[Admin] Manual enroll: ${customer.name} (${customer.phone}) → ${code}`);

  // Best-effort: write the code back to ST so CSRs see it on the
  // real customer record. Only fires when a real ST ID was given.
  let stWriteResult = null;
  if (isRealStId) {
    try {
      const token = await getAccessToken();
      const typeId = parseInt(process.env.ST_REFERRAL_CODE_TYPE_ID || '406119043');
      stWriteResult = await writeReferralCodeToCustomer(token, stId, code, typeId);
    } catch (err) {
      console.error(`[Admin] ST write-back failed for ${stId}:`, err.message);
      stWriteResult = false;
    }
  }

  // Best-effort: fire the Chiirp invite immediately if requested.
  let chiirpResult = null;
  if (send_invite) {
    try {
      const result = await sendReferralInvite(customer);
      chiirpResult = result?.success !== false;
    } catch (err) {
      console.error(`[Admin] Chiirp invite failed for ${customer.id}:`, err.message);
      chiirpResult = false;
    }
  }

  res.json({ success: true, customer, stWriteResult, chiirpResult });
});

// ──────────────────────────────────────────────────────────────
// POST /admin/api/customers/:id/send-invite
// Re-fires the Chiirp invite webhook for an existing customer.
// Useful when the original SMS/email got lost, or to manually
// onboard someone who was enrolled while DEMO_MODE was on.
// ──────────────────────────────────────────────────────────────
router.post('/api/customers/:id/send-invite', requireWriteAccess, async (req, res) => {
  const { id } = req.params;

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  if (!customer.phone) {
    return res.status(400).json({ error: 'Customer has no phone on file — nothing to send to' });
  }

  try {
    const result = await sendReferralInvite(customer);
    if (result?.success === false) {
      return res.status(502).json({ error: result.error || 'Chiirp webhook failed' });
    }

    await supabase
      .from('customers')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('id', id);

    console.log(`[Admin] Re-sent invite for ${customer.name} (${customer.phone})`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] send-invite error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────────────────────
const ALLOWED_SETTINGS = new Set([
  'min_job_value',
  'new_customer_discount',
  'payout_percentage',
  'payout_cap',
  'max_lookback_hours',
  'reengage_days',
  'reengage_max_age_days',
  'residential_only',
  'excluded_business_unit_ids',
]);

const NUMERIC_SETTINGS = {
  min_job_value:         { min: 0 },
  new_customer_discount: { min: 0 },
  payout_percentage:     { min: 0, max: 100 },
  payout_cap:            { min: 0 },
  max_lookback_hours:    { min: 1, max: 168 },
  reengage_max_age_days: { min: 1, max: 365 },
};

// Validate comma-separated list of positive integers for the BU
// exclusion setting. Returns a normalized string ("123, 456") or
// an { error } object.
function validateBusinessUnitIds(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (!Number.isFinite(n) || n <= 0 || String(n) !== p) {
      return { error: `excluded_business_unit_ids entry "${p}" must be a positive integer` };
    }
  }
  return parts.join(', ');
}

// Special validation for reengage_days (comma-separated list of positive integers)
function validateReengageDays(raw) {
  if (raw == null || String(raw).trim() === '') return ''; // empty disables
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (!Number.isFinite(n) || n <= 0 || String(n) !== p) {
      return { error: `reengage_days entry "${p}" must be a positive integer` };
    }
  }
  // Re-stringify cleanly: "7, 14, 30"
  return parts.join(', ');
}

router.post('/api/settings', requireSuperAdmin, async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Invalid settings' });
  }

  const updates = [];
  for (const [key, rawValue] of Object.entries(settings)) {
    if (!ALLOWED_SETTINGS.has(key)) {
      return res.status(400).json({ error: `Unknown setting: ${key}` });
    }
    const bounds = NUMERIC_SETTINGS[key];
    let value = rawValue;
    if (bounds) {
      const n = parseFloat(rawValue);
      if (!Number.isFinite(n)) {
        return res.status(400).json({ error: `${key} must be a number` });
      }
      if (bounds.min !== undefined && n < bounds.min) {
        return res.status(400).json({ error: `${key} must be ≥ ${bounds.min}` });
      }
      if (bounds.max !== undefined && n > bounds.max) {
        return res.status(400).json({ error: `${key} must be ≤ ${bounds.max}` });
      }
      value = String(n);
    } else if (key === 'reengage_days') {
      const result = validateReengageDays(rawValue);
      if (result && typeof result === 'object' && result.error) {
        return res.status(400).json({ error: result.error });
      }
      value = result;
    } else if (key === 'excluded_business_unit_ids') {
      const result = validateBusinessUnitIds(rawValue);
      if (result && typeof result === 'object' && result.error) {
        return res.status(400).json({ error: result.error });
      }
      value = result;
    } else if (key === 'residential_only') {
      value = (rawValue === true || rawValue === 'true') ? 'true' : 'false';
    } else {
      value = String(rawValue ?? '');
    }
    updates.push({ key, value });
  }

  for (const row of updates) {
    await supabase
      .from('system_settings')
      .upsert({ key: row.key, value: row.value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
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

  const validRoles = ['super_admin', 'admin', 'viewer'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Role must be super_admin, admin, or viewer' });
  }

  const password_hash = await hashPassword(password);

  const { data, error } = await supabase.from('admin_users').insert({
    name,
    email: email.toLowerCase().trim(),
    password_hash,
    role: role || 'admin',
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
