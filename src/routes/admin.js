const express = require('express');
const router = express.Router();
const { requireAdmin, createSession, destroySession } = require('../middleware/adminAuth');
const { getStats, getReferrals, getTopReferrers, getRecentActivity, getMonthlyTrend } = require('../services/adminData');
const { renderLogin, renderDashboard } = require('../views/dashboard');
const supabase = require('../db');

// ──────────────────────────────────────────────────────────────
// GET /admin/login
// ──────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  res.send(renderLogin());
});

// ──────────────────────────────────────────────────────────────
// POST /admin/login
// ──────────────────────────────────────────────────────────────
router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const { password } = req.body;
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (!correctPassword) {
    return res.send(renderLogin('ADMIN_PASSWORD is not set in environment variables.'));
  }

  if (password !== correctPassword) {
    return res.send(renderLogin('Incorrect password. Please try again.'));
  }

  const token = createSession();

  res.cookie('lex_admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
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
// GET /admin/referrals  (Referrals tab, with optional ?status= filter)
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
// GET /admin/referrers  (Top Referrers tab)
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
// GET /admin/activity  (Activity feed tab)
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
// GET /admin/portal  (Customer Portal Preview tab)
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
// GET /admin/api/stats  (JSON endpoint for potential future use)
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
// POST /admin/api/referral/:id/mark-rewarded
// Manually marks a completed referral as rewarded after you've
// sent the gift card yourself. Updates customer totals too.
// ──────────────────────────────────────────────────────────────
router.post('/api/referral/:id/mark-rewarded', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body; // optional: e.g. "Sent $75 Visa via email 2/18"

  try {
    // Fetch the referral + referrer
    const { data: referral, error: fetchErr } = await supabase
      .from('referrals')
      .select('*, referrer:referrer_id(id, name, total_referrals, total_rewards)')
      .eq('id', id)
      .single();

    if (fetchErr || !referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    if (referral.status === 'rewarded') {
      return res.status(400).json({ error: 'Referral is already marked as rewarded' });
    }

    if (referral.status !== 'completed') {
      return res.status(400).json({ error: `Cannot reward a referral with status: ${referral.status}` });
    }

    const rewardAmount = parseFloat(process.env.REFERRER_REWARD || '75');

    // Mark referral as rewarded
    await supabase
      .from('referrals')
      .update({
        status: 'rewarded',
        reward_amount: rewardAmount,
        tango_sent_at: new Date().toISOString(),
        tango_order_id: notes ? `MANUAL: ${notes}` : 'MANUAL',
      })
      .eq('id', id);

    // Update customer totals
    const referrer = referral.referrer;
    await supabase
      .from('customers')
      .update({
        total_referrals: (referrer.total_referrals || 0) + 1,
        total_rewards:   (referrer.total_rewards || 0) + rewardAmount,
      })
      .eq('id', referrer.id);

    console.log(`[Admin] ✅ Manually rewarded referral ${id} — ${referrer.name} $${rewardAmount}`);
    res.json({ success: true, rewardAmount });

  } catch (err) {
    console.error('[Admin] mark-rewarded error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /admin/api/referral/:id/mark-rejected
// Manually rejects a referral (e.g. duplicate household, fraud).
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

module.exports = router;
