/**
 * Send a test Chiirp invite or reward notification to a known customer.
 *
 * Looks up the customer by referral_code or phone, then fires the same
 * Chiirp webhook the production code path uses. Useful for previewing
 * how the SMS / email actually renders without waiting on a real ST
 * job to come through.
 *
 * Usage:
 *   node scripts/send-test-text.js invite <code-or-phone>
 *   node scripts/send-test-text.js reward <code-or-phone> [amount] [method] [referredName]
 *
 * Examples:
 *   node scripts/send-test-text.js invite 3VHRCD
 *   node scripts/send-test-text.js invite 4699905610
 *   node scripts/send-test-text.js reward 3VHRCD 27.50 virtual_card "Sarah Mitchell"
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { sendReferralInvite, sendRewardNotification } = require('../src/services/chiirp');
const { normalizeCode } = require('../src/utils/slugs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function findCustomer(arg) {
  const digits = String(arg).replace(/\D/g, '');
  const codeNorm = normalizeCode(arg);

  // Phone-shaped input (10 digits) → look up by phone
  if (digits.length === 10) {
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, email, referral_code, referral_link')
      .eq('phone', digits)
      .single();
    if (data) return data;
  }

  // Otherwise look up by normalized referral code
  if (codeNorm) {
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, email, referral_code, referral_link')
      .eq('referral_code', codeNorm)
      .single();
    if (data) return data;
  }

  return null;
}

async function main() {
  const [, , type, target, ...rest] = process.argv;

  if (!type || !target || !['invite', 'reward'].includes(type)) {
    console.error('Usage:');
    console.error('  node scripts/send-test-text.js invite <code-or-phone>');
    console.error('  node scripts/send-test-text.js reward <code-or-phone> [amount] [method] [referredName]');
    process.exit(1);
  }

  if (!process.env.CHIIRP_WEBHOOK_URL) {
    console.error('CHIIRP_WEBHOOK_URL is not set in your .env — nothing would actually fire.');
    process.exit(1);
  }

  const customer = await findCustomer(target);
  if (!customer) {
    console.error(`No customer found for "${target}"`);
    process.exit(1);
  }

  console.log(`Found customer: ${customer.name} (${customer.phone})`);
  console.log(`  Code:         ${customer.referral_code}`);
  console.log(`  Link:         ${customer.referral_link}`);
  console.log('');

  if (type === 'invite') {
    console.log('Firing Chiirp invite webhook...');
    const result = await sendReferralInvite(customer);
    console.log('Result:', result);
    return;
  }

  // reward
  const amount = parseFloat(rest[0] || '25');
  const method = rest[1] || 'virtual_card';
  const referredName = rest[2] || 'Sarah Mitchell';

  if (!['physical_card', 'virtual_card'].includes(method)) {
    console.error(`Invalid payment method "${method}". Must be physical_card or virtual_card.`);
    process.exit(1);
  }

  console.log(`Firing Chiirp reward webhook ($${amount} via ${method}, referred: ${referredName})...`);
  const result = await sendRewardNotification(customer, referredName, amount, method);
  console.log('Result:', result);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
