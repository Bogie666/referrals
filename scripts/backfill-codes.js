#!/usr/bin/env node
/**
 * Backfill referral_code for existing customers who don't have one.
 * Run after migration-v2.sql.
 * Usage: node scripts/backfill-codes.js
 */
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function generateReferralCode() {
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return hex.slice(0, 4) + '-' + hex.slice(4);
}

async function main() {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name')
    .is('referral_code', null);

  if (error) {
    console.error('Failed to fetch customers:', error.message);
    process.exit(1);
  }

  console.log(`Found ${customers.length} customers without referral codes`);

  for (const customer of customers) {
    const code = generateReferralCode();
    const { error: updateErr } = await supabase
      .from('customers')
      .update({ referral_code: code })
      .eq('id', customer.id);

    if (updateErr) {
      console.error(`  Failed for ${customer.name}: ${updateErr.message}`);
    } else {
      console.log(`  ${customer.name} -> ${code}`);
    }
  }

  console.log('Done');
}

main();
