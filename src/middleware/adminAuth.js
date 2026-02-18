const crypto = require('crypto');

/**
 * Simple session store (in-memory).
 * For production with multiple Railway instances, swap this for
 * a Supabase sessions table — but for LEX's scale this is fine.
 */
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

/**
 * Middleware: protect admin routes.
 * Reads session token from cookie.
 */
function requireAdmin(req, res, next) {
  const token = req.cookies?.lex_admin_session;
  if (isValidSession(token)) return next();

  // Redirect to login page
  res.redirect('/admin/login');
}

module.exports = { requireAdmin, createSession, isValidSession, destroySession };
