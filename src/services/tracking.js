const supabase = require('../db');
const { normalizeCode } = require('../utils/slugs');

const EVENT_TYPES = new Set([
  'link_click',
  'portal_view',
  'share',
  'scheduler_opened',
  'slot_selected',
  'customer_info_submitted',
  'booking_confirmed',
]);

const SHARE_CHANNELS = new Set([
  'sms', 'email', 'copy', 'copy_code', 'qr', 'native', 'other',
]);

async function resolveReferrerByCode(rawCode) {
  if (!rawCode) return null;
  const normalized = normalizeCode(rawCode);
  const { data } = await supabase
    .from('customers')
    .select('id, referral_code, referral_slug')
    .or(`referral_slug.eq.${rawCode},referral_code.eq.${normalized}`)
    .maybeSingle();
  return data || null;
}

function extractRequestContext(req) {
  const q = req.query || {};
  const b = req.body  || {};
  const pick = (k) => {
    const v = q[k] ?? b[k];
    return v ? String(v).slice(0, 100) : null;
  };
  return {
    user_agent:   (req.get('user-agent') || '').slice(0, 500) || null,
    referer:      (req.get('referer')    || '').slice(0, 500) || null,
    utm_source:   pick('utm_source'),
    utm_medium:   pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
  };
}

async function recordEvent({ eventType, code, referrerId, channel, sessionId, metadata, requestContext }) {
  if (!EVENT_TYPES.has(eventType)) {
    return { ok: false, error: `unknown event_type: ${eventType}` };
  }

  const row = {
    event_type:    eventType,
    referral_code: code ? normalizeCode(code) : null,
    referrer_id:   referrerId || null,
    channel:       channel || null,
    session_id:    sessionId ? String(sessionId).slice(0, 64) : null,
    metadata:      metadata || null,
    user_agent:    requestContext?.user_agent   || null,
    referer:       requestContext?.referer      || null,
    utm_source:    requestContext?.utm_source   || null,
    utm_medium:    requestContext?.utm_medium   || null,
    utm_campaign:  requestContext?.utm_campaign || null,
  };

  const { error } = await supabase.from('tracking_events').insert(row);
  if (error) {
    console.error('[tracking] insert failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

module.exports = {
  EVENT_TYPES,
  SHARE_CHANNELS,
  resolveReferrerByCode,
  extractRequestContext,
  recordEvent,
};
