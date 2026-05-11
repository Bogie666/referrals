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
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }
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
 * Loads the full admin_users row for the current session and attaches
 * it to req.adminUser (+ req.adminUserId for back-compat). Returns the
 * user on success, null if no/invalid/inactive session.
 *
 * Cached on the request so repeat lookups within a single request
 * (e.g. requireAdmin → requireWriteAccess chained) don't double-query.
 */
async function loadAdminUser(req) {
  if (req.adminUser) return req.adminUser;

  const token = req.cookies?.lex_admin_session;
  const session = parseSession(token);
  if (!session) return null;

  try {
    const { data: user } = await supabase
      .from('admin_users')
      .select('id, name, email, role, active')
      .eq('id', session.userId)
      .single();
    if (!user || !user.active) return null;
    req.adminUser   = user;
    req.adminUserId = user.id;
    return user;
  } catch (e) {
    return null;
  }
}

/**
 * Middleware: any authenticated admin (super_admin, admin, viewer).
 */
async function requireAdmin(req, res, next) {
  const user = await loadAdminUser(req);
  if (!user) return res.redirect('/admin/login');
  next();
}

/**
 * Middleware: super_admin only.
 */
async function requireSuperAdmin(req, res, next) {
  const user = await loadAdminUser(req);
  if (!user) return res.redirect('/admin/login');
  if (user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Requires super_admin role' });
  }
  next();
}

/**
 * Middleware: any role that can modify data (super_admin or admin).
 * Viewers are blocked.
 */
async function requireWriteAccess(req, res, next) {
  const user = await loadAdminUser(req);
  if (!user) return res.redirect('/admin/login');
  if (user.role === 'viewer') {
    return res.status(403).json({ error: 'This account is read-only' });
  }
  next();
}

module.exports = {
  requireAdmin,
  requireSuperAdmin,
  requireWriteAccess,
  createSession,
  parseSession,
  destroySession,
  authenticateUser,
  hashPassword,
};
