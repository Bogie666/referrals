const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('marking a referral paid does not update the referrer earned totals', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'admin.js'),
    'utf8'
  );
  const payoutRoute = source.slice(
    source.indexOf("router.post('/api/referral/:id/payout'"),
    source.indexOf("router.post('/api/referral/:id/mark-rejected'")
  );

  assert.match(payoutRoute, /status:\s*'rewarded'/);
  assert.doesNotMatch(
    payoutRoute,
    /\.from\('customers'\)[\s\S]*?\.update\(\{[\s\S]*?(?:total_referrals|total_rewards)/,
    'A payout records disbursement only; earned totals are updated when the referral completes.'
  );
});
