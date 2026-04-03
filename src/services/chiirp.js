const axios = require('axios');
const supabase = require('../db');

const CHIIRP_BASE = 'https://api.chiirp.com/v1';

/**
 * Sends a text message via Chiirp API.
 * Logs the message to texts_log table.
 */
async function sendText({ to, message, customerId = null, referralId = null }) {
  try {
    const response = await axios.post(
      `${CHIIRP_BASE}/messages`,
      {
        to,
        from: process.env.CHIIRP_FROM_NUMBER,
        body: message,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHIIRP_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const chiirpMsgId = response.data?.id || null;

    await supabase.from('texts_log').insert({
      customer_id: customerId,
      referral_id: referralId,
      phone: to,
      message,
      chiirp_msg_id: chiirpMsgId,
      status: 'sent',
    });

    console.log(`[Chiirp] Text sent to ${to} | Msg ID: ${chiirpMsgId}`);
    return { success: true, chiirpMsgId };
  } catch (err) {
    console.error('[Chiirp] Failed to send text:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Sends the referral invite text to a customer after their job completes.
 * Includes both the full link and the short referral code.
 */
async function sendReferralInvite(customer) {
  const { name, phone, referral_link, referral_code, id: customerId } = customer;
  const firstName = name.split(' ')[0];
  const discount = process.env.NEW_CUSTOMER_DISCOUNT || '50';
  const reward = process.env.REFERRER_REWARD || '75';

  const codeLine = referral_code ? `\nYour code: ${referral_code}` : '';

  const message =
    `Hey ${firstName}! Thanks for choosing LEX Air Conditioning.\n\n` +
    `Know someone who needs AC, heating, plumbing, or electrical work? ` +
    `Share your personal link and when they complete their first service, ` +
    `you get a $${reward} gift card and they save $${discount}!\n\n` +
    `Your link: ${referral_link}${codeLine}\n\n` +
    `Reply STOP to opt out.`;

  return wrappedSendText({ to: phone, message, customerId });
}

/**
 * Sends a reward notification text to the referrer after a payout is recorded.
 */
async function sendRewardNotification(customer, referredName, amount, paymentMethod) {
  const firstName = customer.name.split(' ')[0];
  const referredFirst = (referredName || 'your friend').split(' ')[0];
  const methodLabel = paymentMethod === 'physical_card' ? 'gift card in the mail' : 'gift card via email';

  const message =
    `Great news, ${firstName}! ${referredFirst} just completed their first LEX service. ` +
    `Your $${amount} ${methodLabel} is on the way!`;

  return wrappedSendText({ to: customer.phone, message, customerId: customer.id });
}

const { demoSendText } = require('./demoMode');
const wrappedSendText = demoSendText(sendText);

module.exports = {
  sendText: wrappedSendText,
  sendReferralInvite,
  sendRewardNotification,
};
