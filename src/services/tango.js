const axios = require('axios');
const supabase = require('../db');

const TANGO_BASE = 'https://api.tangocard.com/raas/v2';

/**
 * Issues a digital gift card via Tango Card API.
 * Called automatically when a referral is validated.
 *
 * @param {object} params
 * @param {string} params.recipientEmail  - Referrer's email address
 * @param {string} params.recipientName   - Referrer's full name
 * @param {number} params.amount          - Dollar amount (e.g. 75)
 * @param {string} params.referralId      - Our referral UUID (used as external ref)
 * @param {string} [params.catalogItem]   - Tango catalog item code (default from env)
 */
async function issueGiftCard({ recipientEmail, recipientName, amount, referralId, catalogItem }) {
  const item = catalogItem || process.env.TANGO_DEFAULT_CATALOG_ITEM || 'VISA_VIRTUAL';

  try {
    const response = await axios.post(
      `${TANGO_BASE}/orders`,
      {
        accountIdentifier: process.env.TANGO_ACCOUNT_ID,
        fundId: process.env.TANGO_FUND_ID,
        amount: { currencyCode: 'USD', value: amount },
        utid: item,
        recipient: {
          email: recipientEmail,
          firstName: recipientName.split(' ')[0],
          lastName: recipientName.split(' ').slice(1).join(' ') || '',
        },
        sendEmail: true,
        externalRefID: referralId,
        notes: `LEX Referral Reward — Referral ID: ${referralId}`,
      },
      {
        auth: {
          username: process.env.TANGO_ACCOUNT_ID,
          password: process.env.TANGO_API_KEY,
        },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const orderId = response.data?.referenceOrderID || response.data?.orderID || null;
    console.log(`[Tango] Gift card issued | Order: ${orderId} | To: ${recipientEmail}`);

    // Update referral record with Tango order details
    await supabase
      .from('referrals')
      .update({
        status: 'rewarded',
        tango_order_id: orderId,
        tango_sent_at: new Date().toISOString(),
        reward_amount: amount,
      })
      .eq('id', referralId);

    // Increment customer's total_rewards
    // (done via a separate rpc or manual update — keeping it simple here)

    return { success: true, orderId };
  } catch (err) {
    console.error('[Tango] Gift card failed:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

const { demoIssueGiftCard } = require('./demoMode');
module.exports = { issueGiftCard: demoIssueGiftCard(issueGiftCard) };
