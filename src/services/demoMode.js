/**
 * Demo Mode
 * ─────────────────────────────────────────────────────────────
 * When DEMO_MODE=true in your .env, Chiirp and Tango calls are
 * intercepted and logged to the console instead of hitting real APIs.
 *
 * This lets you run the full app without Chiirp/Tango credentials.
 * Everything else (Supabase, webhook handling, admin dashboard) works normally.
 * ─────────────────────────────────────────────────────────────
 */

const DEMO_MODE = process.env.DEMO_MODE === 'true';

if (DEMO_MODE) {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  🎭 DEMO MODE ACTIVE                    │');
  console.log('│  Chiirp texts → logged to console       │');
  console.log('│  Tango gift cards → logged to console   │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
}

/**
 * Wraps the real Chiirp sendText function.
 * In demo mode, logs the text instead of sending it.
 */
function demoSendText(realSendText) {
  if (!DEMO_MODE) return realSendText;

  return async function ({ to, message, customerId, referralId }) {
    const preview = message.length > 80 ? message.slice(0, 80) + '...' : message;
    console.log(`\n📱 [DEMO] Text would be sent:`);
    console.log(`   To:      ${to}`);
    console.log(`   Message: ${preview}`);
    console.log('');
    return { success: true, chiirpMsgId: `DEMO-MSG-${Date.now()}` };
  };
}

/**
 * Wraps the real Tango issueGiftCard function.
 * In demo mode, logs the gift card details instead of issuing it,
 * but still updates the referral record in Supabase to 'rewarded'.
 */
function demoIssueGiftCard(realIssueGiftCard) {
  if (!DEMO_MODE) return realIssueGiftCard;

  const supabase = require('../db');

  return async function ({ recipientEmail, recipientName, amount, referralId, catalogItem }) {
    const orderId = `DEMO-ORDER-${Date.now()}`;
    console.log(`\n🎁 [DEMO] Gift card would be issued:`);
    console.log(`   To:       ${recipientName} <${recipientEmail}>`);
    console.log(`   Amount:   $${amount}`);
    console.log(`   Type:     ${catalogItem || process.env.TANGO_DEFAULT_CATALOG_ITEM || 'VISA_VIRTUAL'}`);
    console.log(`   Order ID: ${orderId}`);
    console.log('');

    // Still update the referral record so the dashboard shows it as rewarded
    await supabase
      .from('referrals')
      .update({
        status: 'rewarded',
        tango_order_id: orderId,
        tango_sent_at: new Date().toISOString(),
        reward_amount: amount,
      })
      .eq('id', referralId);

    return { success: true, orderId };
  };
}

module.exports = { DEMO_MODE, demoSendText, demoIssueGiftCard };
