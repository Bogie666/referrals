#!/usr/bin/env node
/**
 * Setup script — creates the first super_admin user.
 * Usage: node scripts/setup-admin.js <name> <email> <password>
 *
 * Alternatively, POST to /admin/api/setup with { name, email, password }
 * (only works when no admin users exist yet).
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const name = process.argv[2];
  const email = process.argv[3];
  const password = process.argv[4];

  if (!name || !email || !password) {
    console.error('Usage: node scripts/setup-admin.js <name> <email> <password>');
    process.exit(1);
  }

  const { count } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true });

  if (count > 0) {
    console.error('Admin users already exist. This script only runs on first setup.');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 12);

  const { error } = await supabase.from('admin_users').insert({
    name,
    email: email.toLowerCase().trim(),
    password_hash,
    role: 'super_admin',
  });

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log(`Super admin created: ${email}`);
  console.log('You can now log in at /admin/login');
}

main();
