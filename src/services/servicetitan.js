/**
 * ServiceTitan API Service
 * ─────────────────────────────────────────────────────────────
 * Handles OAuth token management and customer/job lookups.
 *
 * ST uses client_credentials OAuth flow. Tokens expire in 1 hour
 * so we cache the token and refresh it automatically.
 *
 * Docs: https://developer.servicetitan.io/
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL  = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE  = 'https://api.servicetitan.io';
const APP_ID       = process.env.ST_APP_ID;
const TENANT_ID    = process.env.ST_TENANT_ID;
const CLIENT_ID    = process.env.ST_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET;

// ── Token cache ───────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  // In demo mode, skip real auth
  if (process.env.DEMO_MODE === 'true') {
    return 'demo-token';
  }

  if (!CLIENT_ID || !CLIENT_SECRET || CLIENT_ID === 'placeholder') {
    throw new Error('ServiceTitan API credentials are not configured');
  }

  try {
    const res = await axios.post(
      ST_AUTH_URL,
      new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    cachedToken    = res.data.access_token;
    tokenExpiresAt = Date.now() + (res.data.expires_in * 1000);

    console.log('[ST API] Access token refreshed');
    return cachedToken;

  } catch (err) {
    console.error('[ST API] Auth failed:', err.response?.data || err.message);
    throw new Error('Failed to authenticate with ServiceTitan');
  }
}

function stHeaders(token) {
  return {
    Authorization:    `Bearer ${token}`,
    'ST-App-Key':     APP_ID,
    'Content-Type':   'application/json',
  };
}

// ── Customer lookup ───────────────────────────────────────────

/**
 * Looks up a customer in ServiceTitan by phone number.
 * Returns the first matching customer or null.
 *
 * @param {string} phone - 10-digit phone number (no formatting)
 * @returns {object|null} ST customer object or null
 */
async function findCustomerByPhone(phone) {
  if (process.env.DEMO_MODE === 'true') {
    return simulateDemoLookup(phone);
  }

  try {
    const token = await getAccessToken();

    // ST phone search — try multiple formats
    const formattedPhone = `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}`;

    const res = await axios.get(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers`,
      {
        headers: stHeaders(token),
        params: {
          phone,
          active: true,
          pageSize: 5,
        },
      }
    );

    const customers = res.data?.data || [];
    if (!customers.length) {
      // Try with formatted phone as fallback
      const res2 = await axios.get(
        `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers`,
        {
          headers: stHeaders(token),
          params: { phone: formattedPhone, active: true, pageSize: 5 },
        }
      );
      const customers2 = res2.data?.data || [];
      return customers2[0] || null;
    }

    return customers[0];

  } catch (err) {
    console.error('[ST API] Customer lookup failed:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Gets the count of completed jobs for a given ST customer ID.
 * Used to verify the customer qualifies for a referral link.
 *
 * @param {string} stCustomerId
 * @returns {number} count of completed jobs
 */
async function getCompletedJobCount(stCustomerId) {
  if (process.env.DEMO_MODE === 'true') {
    // Demo: simulate some customers having completed jobs
    return 1;
  }

  try {
    const token = await getAccessToken();

    const res = await axios.get(
      `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs`,
      {
        headers: stHeaders(token),
        params: {
          customerId:  stCustomerId,
          jobStatus:   'Completed',
          pageSize:    1, // we only need the count
          includeTotal: true,
        },
      }
    );

    return res.data?.totalCount || res.data?.data?.length || 0;

  } catch (err) {
    console.error('[ST API] Job count lookup failed:', err.response?.data || err.message);
    // Fail open — if we can't check, assume they qualify
    // (better to give a link than turn away a real customer)
    return 1;
  }
}

/**
 * Pulls the best available contact info from an ST customer object.
 * ST stores contacts in a nested array — this flattens it.
 */
function extractContactInfo(stCustomer) {
  const contacts = stCustomer.contacts || [];

  // Find primary phone
  const phoneContact = contacts.find(c =>
    c.type === 'Phone' || c.type === 'MobilePhone' || c.type === 'Cell'
  ) || contacts.find(c => c.value && c.value.replace(/\D/g, '').length === 10);

  // Find primary email
  const emailContact = contacts.find(c => c.type === 'Email' || (c.value || '').includes('@'));

  const rawPhone = (phoneContact?.value || '').replace(/\D/g, '').replace(/^1/, '');

  return {
    stCustomerId: String(stCustomer.id),
    name:  stCustomer.name || stCustomer.firstName + ' ' + (stCustomer.lastName || ''),
    phone: rawPhone,
    email: emailContact?.value || stCustomer.email || null,
  };
}

// ── Demo mode simulator ───────────────────────────────────────
// Returns fake ST responses when DEMO_MODE=true so you can test
// the self-signup flow without real ST credentials.

const DEMO_ST_CUSTOMERS = {
  // Existing LEX customers not yet in our DB (qualify for link)
  '9725550101': { id: 'ST-90001', name: 'Jennifer Walsh',  email: 'j.walsh@email.com',   hasJobs: true  },
  '9725550102': { id: 'ST-90002', name: 'Mike Castillo',   email: 'm.cast@email.com',    hasJobs: true  },
  '9725550103': { id: 'ST-90003', name: 'Brenda Hoffman',  email: 'brenda.h@email.com',  hasJobs: true  },
  // Customer with no completed jobs yet
  '9725550201': { id: 'ST-90010', name: 'Tyler Brooks',    email: 'tyler.b@email.com',   hasJobs: false },
};

function simulateDemoLookup(phone) {
  const match = DEMO_ST_CUSTOMERS[phone];
  if (!match) return null;
  return {
    id:       match.id,
    name:     match.name,
    email:    match.email,
    _hasJobs: match.hasJobs, // internal demo flag
    contacts: [
      { type: 'Phone', value: phone },
      { type: 'Email', value: match.email },
    ],
  };
}

module.exports = {
  findCustomerByPhone,
  getCompletedJobCount,
  extractContactInfo,
};
