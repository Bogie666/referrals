const { nanoid } = require('nanoid');

/**
 * Generates a human-friendly referral slug from a customer's name.
 * e.g. "Sarah Miller" → "sarah-m-4f2a"
 * The nanoid suffix prevents collisions while keeping it short.
 */
function generateSlug(fullName = '') {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  const first = parts[0] || 'customer';
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : '';
  const suffix = nanoid(4); // 4-char random suffix
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

module.exports = { generateSlug, buildReferralLink };
