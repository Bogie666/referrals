/**
 * Demo Mode
 * ---------------------------------------------------------
 * When DEMO_MODE=true in your .env, Chiirp calls are
 * intercepted and logged to the console instead of hitting real APIs.
 *
 * This lets you run the full app without Chiirp credentials.
 * Everything else (Supabase, webhook handling, admin dashboard) works normally.
 * ---------------------------------------------------------
 */

const DEMO_MODE = process.env.DEMO_MODE === 'true';

if (DEMO_MODE) {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  DEMO MODE ACTIVE                       │');
  console.log('│  Chiirp texts → logged to console       │');
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
    console.log(`\n[DEMO] Text would be sent:`);
    console.log(`   To:      ${to}`);
    console.log(`   Message: ${preview}`);
    console.log('');
    return { success: true, chiirpMsgId: `DEMO-MSG-${Date.now()}` };
  };
}

module.exports = { DEMO_MODE, demoSendText };
