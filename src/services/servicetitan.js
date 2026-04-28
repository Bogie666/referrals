/**
 * ServiceTitan API Service
 * ─────────────────────────────────────────────────────────────
 * Handles OAuth token management, customer lookups,
 * job polling, and referral code write-backs.
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const APP_KEY       = process.env.ST_APP_KEY  || process.env.ST_APP_ID;
const TENANT_ID     = process.env.ST_TENANT_ID;
const CLIENT_ID     = process.env.ST_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET;

// ── Token cache ───────────────────────────────────────────────
let cachedToken    = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

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
    Authorization:  `Bearer ${token}`,
    'ST-App-Key':   APP_KEY,
    'Content-Type': 'application/json',
  };
}

// ── Polling: Get completed jobs ───────────────────────────────
/**
 * Fetches jobs completed since the given ISO timestamp.
 * Handles pagination automatically.
 *
 * @param {string} token - ST access token
 * @param {string} completedOnOrAfter - ISO 8601 timestamp
 * @returns {Array} array of job objects
 */
async function getCompletedJobs(token, completedOnOrAfter) {
  if (process.env.DEMO_MODE === 'true') {
    console.log('[DEMO] Skipping ST jobs poll');
    return [];
  }

  const allJobs = [];
  let page = 1;
  const pageSize = 50;

  try {
    while (true) {
      const res = await axios.get(
        `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs`,
        {
          headers: stHeaders(token),
          params: {
            jobStatus:          'Completed',
            completedOnOrAfter,
            pageSize,
            page,
          },
        }
      );

      const jobs = res.data?.data || [];
      allJobs.push(...jobs);

      // Stop if we got fewer than a full page
      if (jobs.length < pageSize) break;
      page++;

      // Safety limit — don't fetch more than 500 jobs in one poll
      if (allJobs.length >= 500) {
        console.warn('[ST API] Hit 500 job limit during poll — increase frequency or lookback window');
        break;
      }
    }

    return allJobs;

  } catch (err) {
    console.error('[ST API] getCompletedJobs failed:', err.response?.data || err.message);
    throw err;
  }
}

// ── Get a single customer ─────────────────────────────────────
/**
 * @param {string} token
 * @param {number|string} customerId
 * @returns {object|null}
 */
async function getCustomer(token, customerId) {
  if (process.env.DEMO_MODE === 'true') {
    return simulateDemoCustomer(customerId);
  }

  try {
    const res = await axios.get(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers/${customerId}`,
      { headers: stHeaders(token) }
    );
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    console.error(`[ST API] getCustomer ${customerId} failed:`, err.response?.data || err.message);
    return null;
  }
}

// ── Get customer contacts (phone + email) ─────────────────────
/**
 * @param {string} token
 * @param {number|string} customerId
 * @returns {Array} contacts array
 */
async function getCustomerContacts(token, customerId) {
  if (process.env.DEMO_MODE === 'true') {
    return simulateDemoContacts(customerId);
  }

  try {
    const res = await axios.get(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers/${customerId}/contacts`,
      { headers: stHeaders(token) }
    );
    return res.data?.data || [];
  } catch (err) {
    console.error(`[ST API] getCustomerContacts ${customerId} failed:`, err.response?.data || err.message);
    return [];
  }
}

// ── Write referral code back to ST customer ───────────────────
/**
 * PATCHes the customer record with the referral code
 * in the custom field specified by typeId.
 *
 * @param {string} token
 * @param {number|string} customerId
 * @param {string} referralCode - e.g. "SARAH-1917"
 * @param {number} typeId - ST custom field type ID (406119043)
 * @returns {boolean} success
 */
async function writeReferralCodeToCustomer(token, customerId, referralCode, typeId) {
  try {
    await axios.patch(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers/${customerId}`,
      {
        customFields: [
          { typeId, value: referralCode }
        ],
      },
      { headers: stHeaders(token) }
    );
    console.log(`[ST API] Wrote referral code ${referralCode} to customer ${customerId}`);
    return true;
  } catch (err) {
    console.error(
      `[ST API] writeReferralCode failed for ${customerId}:`,
      err.response?.data || err.message
    );
    return false;
  }
}

// ── Get invoice for a job (line items + total) ────────────────
/**
 * Fetches the invoice associated with a job, returning the
 * total and line items for payout calculation.
 *
 * @param {string} token
 * @param {number|string} jobId
 * @returns {{ total: number, items: Array }|null}
 */
async function getInvoiceForJob(token, jobId) {
  if (process.env.DEMO_MODE === 'true') {
    return { total: 0, items: [] };
  }

  try {
    const res = await axios.get(
      `${ST_API_BASE}/accounting/v2/tenant/${TENANT_ID}/invoices`,
      {
        headers: stHeaders(token),
        params: { jobIds: String(jobId), pageSize: 50 },
      }
    );

    const invoices = res.data?.data || [];
    if (!invoices.length) return null;

    // A job can have multiple invoices (e.g. progress invoicing). Aggregate.
    const items = [];
    let total = 0;
    for (const inv of invoices) {
      total += parseFloat(inv.total || inv.subtotal || 0);
      const invItems = inv.items || inv.lineItems || [];
      for (const it of invItems) {
        items.push({
          code: it.skuCode || it.code || it.sku || '',
          name: it.skuName || it.description || it.name || '',
          quantity: it.quantity,
          total: it.total,
        });
      }
    }
    return { total, items };

  } catch (err) {
    console.error(`[ST API] getInvoiceForJob ${jobId} failed:`, err.response?.data || err.message);
    return null;
  }
}

// ── Customer lookup by phone (for portal self-signup) ─────────
/**
 * @param {string} phone - 10-digit normalized phone
 * @returns {object|null} ST customer or null
 */
async function findCustomerByPhone(phone) {
  if (process.env.DEMO_MODE === 'true') {
    return simulateDemoLookup(phone);
  }

  try {
    const token = await getAccessToken();
    const formatted = `(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}`;

    // Try raw digits first
    let res = await axios.get(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers`,
      {
        headers: stHeaders(token),
        params: { phone, active: true, pageSize: 5 },
      }
    );

    let customers = res.data?.data || [];

    if (!customers.length) {
      // Try formatted fallback
      res = await axios.get(
        `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers`,
        {
          headers: stHeaders(token),
          params: { phone: formatted, active: true, pageSize: 5 },
        }
      );
      customers = res.data?.data || [];
    }

    return customers[0] || null;

  } catch (err) {
    console.error('[ST API] findCustomerByPhone failed:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Gets count of completed jobs for a customer.
 * Used for portal self-signup eligibility check.
 */
async function getCompletedJobCount(stCustomerId) {
  if (process.env.DEMO_MODE === 'true') return 1;

  try {
    const token = await getAccessToken();
    const res = await axios.get(
      `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs`,
      {
        headers: stHeaders(token),
        params: {
          customerId:   stCustomerId,
          jobStatus:    'Completed',
          pageSize:     1,
          includeTotal: true,
        },
      }
    );
    return res.data?.totalCount || res.data?.data?.length || 0;
  } catch (err) {
    console.error('[ST API] getCompletedJobCount failed:', err.response?.data || err.message);
    return 1; // Fail open
  }
}

/**
 * Extracts normalized contact info from an ST customer object.
 */
function extractContactInfo(stCustomer) {
  const contacts    = stCustomer.contacts || [];
  const phoneContact = contacts.find(c =>
    c.type === 'MobilePhone' || c.type === 'Phone' || c.type === 'Cell'
  );
  const emailContact = contacts.find(c =>
    c.type === 'Email' || (c.value || '').includes('@')
  );
  const rawPhone = (phoneContact?.value || '').replace(/\D/g, '').replace(/^1/, '');

  return {
    stCustomerId: String(stCustomer.id),
    name:  stCustomer.name || '',
    phone: rawPhone,
    email: emailContact?.value?.toLowerCase() || stCustomer.email || null,
  };
}

// ── Demo simulators ───────────────────────────────────────────

const DEMO_ST_CUSTOMERS = {
  '9725550101': { id: 'ST-90001', name: 'JENNIFER WALSH',  email: 'j.walsh@email.com',   hasJobs: true  },
  '9725550102': { id: 'ST-90002', name: 'MIKE CASTILLO',   email: 'm.cast@email.com',    hasJobs: true  },
  '9725550103': { id: 'ST-90003', name: 'BRENDA HOFFMAN',  email: 'brenda.h@email.com',  hasJobs: true  },
  '9725550201': { id: 'ST-90010', name: 'TYLER BROOKS',    email: 'tyler.b@email.com',   hasJobs: false },
};

function simulateDemoLookup(phone) {
  const match = DEMO_ST_CUSTOMERS[phone];
  if (!match) return null;
  return {
    id:        match.id,
    name:      match.name,
    email:     match.email,
    _hasJobs:  match.hasJobs,
    customFields: [],
    contacts: [
      { type: 'MobilePhone', value: phone, phoneSettings: { doNotText: false } },
      { type: 'Email',       value: match.email },
    ],
  };
}

function simulateDemoCustomer(customerId) {
  return {
    id:           customerId,
    name:         'DEMO CUSTOMER',
    customFields: [],
    balance:      0,
  };
}

function simulateDemoContacts(customerId) {
  return [
    { type: 'MobilePhone', value: '9725550000', phoneSettings: { doNotText: false } },
    { type: 'Email',       value: 'demo@lexair.com' },
  ];
}

module.exports = {
  getAccessToken,
  getCompletedJobs,
  getCustomer,
  getCustomerContacts,
  getInvoiceForJob,
  writeReferralCodeToCustomer,
  findCustomerByPhone,
  getCompletedJobCount,
  extractContactInfo,
};
