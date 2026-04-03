const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = require('../db');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Creates a signed session token containing user ID and expiry.
 * Format: userId:expiry_hex.signature
 */
function createSession(userId) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}:${expiresAt}`;
  const signature = sign(payload);
  return payload + '.' + signature;
}

function parseSession(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (sign(payload) !== sig) return null;

  const [userId, expiresAtStr] = payload.split(':');
  const expiresAt = parseInt(expiresAtStr, 10);
  if (Date.now() >= expiresAt) return null;

  return { userId };
}

function destroySession(token) {
  // No-op — cookie clearing handles logout
}

function sign(payload) {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'fallback-secret';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Authenticate a user by email and password.
 * Returns the user record if valid, null otherwise.
 */
async function authenticateUser(email, password) {
  const { data: user } = await supabase
    .from('admin_users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .eq('active', true)
    .single();

  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  // Update last login
  await supabase
    .from('admin_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id);

  return user;
}

/**
 * Hash a password for storage.
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/**
 * Middleware: protect admin routes.
 * Reads session token from cookie, attaches req.adminUser.
 */
function requireAdmin(req, res, next) {
  const token = req.cookies?.lex_admin_session;
  const session = parseSession(token);

  if (session) {
    req.adminUserId = session.userId;
    return next();
  }

  res.redirect('/admin/login');
}

/**
 * Middleware: require super_admin role.
 */
function requireSuperAdmin(req, res, next) {
  // First run requireAdmin logic
  const token = req.cookies?.lex_admin_session;
  const session = parseSession(token);

  if (!session) return res.redirect('/admin/login');

  req.adminUserId = session.userId;

  // Check role async
  supabase
    .from('admin_users')
    .select('role')
    .eq('id', session.userId)
    .single()
    .then(({ data }) => {
      if (data?.role === 'super_admin') return next();
      res.status(403).json({ error: 'Requires super_admin role' });
    })
    .catch(() => res.status(403).json({ error: 'Unauthorized' }));
}

module.exports = { requireAdmin, requireSuperAdmin, createSession, parseSession, destroySession, authenticateUser, hashPassword };
