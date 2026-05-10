const axios = require('axios');
const supabase = require('../db');

const CHIIRP_WEBHOOK_URL = process.env.CHIIRP_WEBHOOK_URL;
const REFERRAL_BASE_URL  = process.env.REFERRAL_BASE_URL || 'https://lexperks.com/referral';

function buildShareLink(code) {
  if (!code) return '';
  try {
    return new URL(REFERRAL_BASE_URL).origin + '/share/' + code;
  } catch (e) {
    return 'https://lexperks.com/share/' + code;
  }
}

/**
 * Triggers a Chiirp webhook with customer data.
 * Chiirp handles the messaging automation from there.
 * Logs the event to texts_log table.
 */
async function sendText({ to, message, customerId = null, referralId = null, webhookData = {} }) {
  try {
    const response = await axios.post(
      CHIIRP_WEBHOOK_URL,
      {
        phone: to,
        ...webhookData,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    await supabase.from('texts_log').insert({
      customer_id: customerId,
      referral_id: referralId,
      phone: to,
      message,
      status: 'sent',
    });

    console.log(`[Chiirp] Webhook triggered for ${to}`);
    return { success: true };
  } catch (err) {
    console.error('[Chiirp] Webhook failed:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sends the referral invite to a customer after their job completes.
 * Posts customer data to the Chiirp webhook — Chiirp handles the text content.
 */
async function sendReferralInvite(customer) {
  const { name, phone, email, referral_link, referral_code, id: customerId } = customer;
  const nameParts = (name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ');

  const message = `Referral invite triggered for ${firstName}`;

  return wrappedSendText({
    to: phone,
    message,
    customerId,
    webhookData: {
      first_name:    firstName,
      last_name:     lastName,
      email:         email || '',
      referral_code: referral_code || '',
      referral_link: referral_link || '',
      share_link:    buildShareLink(referral_code),
    },
  });
}

/**
 * Sends a reward notification to the referrer after a payout is recorded.
 * Posts data to the Chiirp webhook — Chiirp handles the text content.
 */
async function sendRewardNotification(customer, referredName, amount, paymentMethod) {
  const nameParts = (customer.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ');
  const referredFirst = (referredName || 'your friend').split(' ')[0];

  const message = `Reward notification triggered for ${firstName}`;

  return wrappedSendText({
    to: customer.phone,
    message,
    customerId: customer.id,
    webhookData: {
      first_name:     firstName,
      last_name:      lastName,
      email:          customer.email || '',
      referred_name:  referredFirst,
      reward_amount:  String(amount),
      payment_method: paymentMethod,
      share_link:     buildShareLink(customer.referral_code),
    },
  });
}

const { demoSendText } = require('./demoMode');
const wrappedSendText = demoSendText(sendText);

module.exports = {
  sendText: wrappedSendText,
  sendReferralInvite,
  sendRewardNotification,
};
