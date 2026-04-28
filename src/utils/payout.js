// Payout calculation rules:
//   - Membership-only invoice  → flat $25 (membership_flat)
//   - Anything else            → invoice_total * payout_percentage,
//                                capped at payout_cap
// Settings are stored in system_settings as strings.

const DEFAULTS = {
  payout_percentage: 5,
  payout_cap: 250,
  membership_flat: 25,
  membership_item_codes: 'Cool Club 1 System,Cool Club 2-3 Systems,Cool Club 4-5 Systems,Cool Club 6+ Systems',
};

function num(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseCodes(raw) {
  return String(raw || '')
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);
}

function extractLineItems(payload) {
  if (!payload) return [];
  const candidates = [
    payload.lineItems,
    payload.items,
    payload.invoice?.items,
    payload.invoice?.lineItems,
    payload.job?.items,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function isMembershipItem(item, codes) {
  const code = String(item.code || item.sku || item.itemCode || item.skuCode || '').toUpperCase();
  const name = String(item.name || item.description || item.itemName || '').toUpperCase();
  return codes.some(c => code === c || name.includes(c));
}

function classifyInvoice(items, codes) {
  if (!items.length || !codes.length) {
    return { hasMembership: false, membershipOnly: false };
  }
  const memberships = items.filter(i => isMembershipItem(i, codes));
  return {
    hasMembership: memberships.length > 0,
    membershipOnly: memberships.length > 0 && memberships.length === items.length,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Calculate the payout amount for a referral based on the invoice and settings.
// `settings` is the key/value object from system_settings.
function calculatePayout({ invoiceTotal, lineItems = [], settings = {} }) {
  const percentage = num(settings.payout_percentage, DEFAULTS.payout_percentage);
  const cap = num(settings.payout_cap, DEFAULTS.payout_cap);
  const flat = num(settings.membership_flat, DEFAULTS.membership_flat);
  const codes = parseCodes(settings.membership_item_codes || DEFAULTS.membership_item_codes);

  const total = num(invoiceTotal, 0);
  const { hasMembership, membershipOnly } = classifyInvoice(lineItems, codes);

  if (membershipOnly) {
    return { amount: round2(flat), rule: 'membership_flat', hasMembership, membershipOnly };
  }

  const pct = (total * percentage) / 100;
  const capped = Math.min(pct, cap);
  return {
    amount: round2(capped),
    rule: pct > cap ? 'percentage_capped' : 'percentage',
    hasMembership,
    membershipOnly,
  };
}

module.exports = {
  calculatePayout,
  extractLineItems,
  classifyInvoice,
  parseCodes,
  DEFAULTS,
};
