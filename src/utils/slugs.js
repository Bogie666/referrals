const { nanoid } = require('nanoid');
const crypto = require('crypto');

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
 * Builds the full shareable referral URL.
 */
function buildReferralLink(slug) {
  const base = process.env.SITE_URL || 'https://lexair.com';
  const page = process.env.REFERRAL_PAGE_SLUG || 'referral';
  return `${base}/${page}?r=${slug}`;
}

/**
 * Generates a short referral code like "4F2A-8B1C".
 * 8 hex characters, uppercase, hyphen in middle.
 */
function generateReferralCode() {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return hex.slice(0, 4) + '-' + hex.slice(4);
}

module.exports = { generateSlug, buildReferralLink, generateReferralCode };
