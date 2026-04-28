// Payout calculation: invoice_total * payout_percentage, capped at payout_cap.
// Settings are stored in system_settings as strings.

const DEFAULTS = {
  payout_percentage: 5,
  payout_cap: 250,
};

function num(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Calculate the payout amount for a referral based on the invoice and settings.
// `settings` is the key/value object from system_settings.
function calculatePayout({ invoiceTotal, settings = {} }) {
  const percentage = num(settings.payout_percentage, DEFAULTS.payout_percentage);
  const cap = num(settings.payout_cap, DEFAULTS.payout_cap);

  const total = num(invoiceTotal, 0);
  const pct = (total * percentage) / 100;
  const capped = Math.min(pct, cap);
  return {
    amount: round2(capped),
    rule: pct > cap ? 'percentage_capped' : 'percentage',
  };
}

module.exports = { calculatePayout, DEFAULTS };
