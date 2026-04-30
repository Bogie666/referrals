const { nanoid } = require('nanoid');

// 32-char unambiguous alphabet (no 0/1/I/O/L) — safe to read aloud over the phone.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

/**
 * Generates a human-friendly referral slug from a customer's name.
 * e.g. "Sarah Miller" -> "sarah-m-4f2a"
 */
function generateSlug(fullName = '') {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  const first = parts[0] || 'customer';
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : '';
  const suffix = nanoid(4);
  return [first, lastInitial, suffix].filter(Boolean).join('-');
}

/**
 * Builds the full shareable referral URL using the customer's
 * short referral code (e.g. K7M2P9). REFERRAL_BASE_URL should
 * be the full path up to the query string, e.g.
 *   https://lexperks.com/referral
 */
function buildReferralLink(code) {
  const base = process.env.REFERRAL_BASE_URL || 'https://lexperks.com/referral';
  return `${base}?r=${code}`;
}

/**
 * Generates a 6-character referral code from an unambiguous alphabet.
 * Example: "K7M2P9". 32^6 ≈ 1B combinations.
 */
function generateReferralCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normalizes a code as typed by a CSR or customer:
 * uppercases and strips anything that isn't A–Z or 0–9.
 * Use on every input that gets compared to a stored referral_code.
 */
function normalizeCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Generates a referral code that doesn't collide with any existing
 * customers.referral_code. Falls back after a few attempts; the
 * caller should still be prepared for a 23505 unique-violation
 * if a parallel insert wins the race.
 */
async function generateUniqueReferralCode(supabase, maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateReferralCode();
    const { count } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('referral_code', code);
    if (!count) return code;
  }
  throw new Error(`Could not generate unique referral code after ${maxAttempts} attempts`);
}

module.exports = {
  generateSlug,
  buildReferralLink,
  generateReferralCode,
  generateUniqueReferralCode,
  normalizeCode,
};
