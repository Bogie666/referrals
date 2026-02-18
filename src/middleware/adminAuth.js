const crypto = require('crypto');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Creates a signed session token containing the expiry timestamp.
 * Format: expiry_hex.signature
 * No server-side storage needed — works on serverless (Vercel).
 */
function createSession() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const signature = sign(payload);
  return payload + '.' + signature;
}

function isValidSession(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (sign(payload) !== sig) return false;
  const expiresAt = parseInt(payload, 10);
  return Date.now() < expiresAt;
}

function destroySession(token) {
  // No-op — cookie clearing handles logout
}

function sign(payload) {
  const secret = process.env.ADMIN_PASSWORD || 'fallback-secret';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Middleware: protect admin routes.
 * Reads session token from cookie.
 */
function requireAdmin(req, res, next) {
  const token = req.cookies?.lex_admin_session;
  if (isValidSession(token)) return next();
  res.redirect('/admin/login');
}

module.exports = { requireAdmin, createSession, isValidSession, destroySession };
