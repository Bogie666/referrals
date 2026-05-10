/**
 * GET /referral?r=CODE
 * ─────────────────────────────────────────────────────────────
 * Friend-facing landing page. The friend tapped a referral link
 * shared by an existing LEX customer; this page personalizes the
 * pitch, shows the $50 welcome gift and the referrer's code, and
 * routes them into the LEX scheduler with the code attached.
 *
 * Layout follows the lexperksfriendlanding.html mockup, minus
 * the "Meet your potential techs" and "We probably serve your
 * area" sections (per design decision). All dollar amounts are
 * pulled from system_settings so admin edits flow through.
 *
 * If the code doesn't resolve to a customer, render a friendly
 * fallback page that still lets the visitor call the office.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const supabase = require('../db');
const { normalizeCode } = require('../utils/slugs');

const LEX_PHONE = '(972) 466-1917';
const LEX_PHONE_TEL = '9724661917';
const LEX_MASCOT_URL = 'https://www.lexairconditioning.com/wp-content/uploads/2026/05/lex_gabe-2.png';

const SCHEDULER_CSS = 'https://scheduler-mu-three.vercel.app/lex-scheduler.css';
const SCHEDULER_JS  = 'https://scheduler-mu-three.vercel.app/lex-scheduler.iife.js';
const BOOKING_API   = 'https://scheduler-mu-three.vercel.app/api/lex-booking';

// ── Data loaders ──────────────────────────────────────────────

async function loadSettings() {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['new_customer_discount', 'min_job_value', 'payout_percentage', 'payout_cap']);
  const map = {};
  (data || []).forEach(row => { map[row.key] = row.value; });
  const num = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    discount:    num(map.new_customer_discount, 50),
    minJobValue: num(map.min_job_value, 350),
    payoutPct:   num(map.payout_percentage, 5),
    payoutCap:   num(map.payout_cap, 250),
  };
}

async function loadCustomerByCodeOrSlug(rawInput) {
  if (!rawInput) return null;
  const code = normalizeCode(rawInput);
  // Look up by either the legacy referral_slug or the canonical
  // referral_code (uppercased). One of them will match.
  const { data } = await supabase
    .from('customers')
    .select('id, name, referral_slug, referral_code, referral_link')
    .or(`referral_slug.eq.${rawInput},referral_code.eq.${code}`)
    .single();
  return data;
}

// ── Helpers ───────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\//g, '<\\/');
}

function formatCurrency(n) {
  const v = parseFloat(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Route ─────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const rawInput = req.query.r ? String(req.query.r) : '';

  const [customer, settings] = await Promise.all([
    loadCustomerByCodeOrSlug(rawInput),
    loadSettings(),
  ]);

  if (!customer) {
    return res.send(renderInvalidPage({ rawInput, settings }));
  }

  res.send(renderLandingPage({ customer, settings }));
});

// ── Render: valid landing page ────────────────────────────────

function renderLandingPage({ customer, settings }) {
  const fullName  = customer.name || 'A friend';
  const firstName = fullName.split(' ')[0];
  const initial   = firstName.charAt(0).toUpperCase();
  const code      = customer.referral_code || '';
  const slug      = customer.referral_slug || '';
  const discount  = settings.discount;
  const minJob    = settings.minJobValue;

  const title = `${escapeHtml(firstName)} sent you ${formatCurrency(discount)} off LEX — Same-day HVAC, Plumbing, Electrical`;
  const description = `${escapeHtml(firstName)} just sent you ${formatCurrency(discount)} off your first LEX service. Family-owned, 2,200+ five-star reviews, serving DFW since 2004.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#1d3a6e" />
<title>${title}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(firstName)} sent you ${formatCurrency(discount)} off LEX" />
<meta property="og:description" content="Family-owned HVAC, plumbing &amp; electrical in DFW since 2004." />
<meta name="twitter:card" content="summary" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=Open+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="${SCHEDULER_CSS}" />
<style>${PAGE_STYLES}</style>
</head>
<body>

<div class="topbar">
  <a class="topbar-brand" href="https://www.lexairconditioning.com" aria-label="LEX Air Conditioning home">
    <img class="logo-mark" src="${LEX_MASCOT_URL}" alt="LEX" />
    <div class="wordmark">LEX <span>AIR</span></div>
  </a>
  <a href="tel:${LEX_PHONE_TEL}" class="call-link">📞 ${LEX_PHONE}</a>
</div>

<div class="wrap">

  <!-- REFERRER STRIP -->
  <div class="referrer-strip">
    <div class="referrer-avatar">${escapeHtml(initial)}</div>
    <div class="referrer-text">
      <div class="referrer-eyebrow">Sent by a friend</div>
      <div class="referrer-name">${escapeHtml(firstName)}<br><span>has referred you to LEX</span></div>
    </div>
  </div>

  <!-- VOUCHER -->
  <div class="voucher">
    <div class="voucher-eyebrow">Your Welcome Gift</div>
    <div class="voucher-amount"><sup>$</sup>${discount}</div>
    <div class="voucher-label">Off Your First Service</div>
    <div class="voucher-tag">Applied automatically when you book through this link</div>
    <div class="voucher-meta">
      <span class="voucher-meta-label">CODE</span>
      <span class="voucher-meta-value">${escapeHtml(code)}</span>
    </div>
  </div>

  <!-- TRUST BAR -->
  <div class="trust-bar">
    <div class="trust-cell">
      <div class="trust-stars">★★★★★</div>
      <div class="trust-value">4.9</div>
      <div class="trust-label">2,200+ Reviews</div>
    </div>
    <div class="trust-cell">
      <div class="trust-stars" style="font-size:18px; letter-spacing:-1px; color:var(--navy);">A+</div>
      <div class="trust-value">BBB</div>
      <div class="trust-label">Accredited</div>
    </div>
    <div class="trust-cell">
      <div class="trust-stars" style="font-size:18px; color:var(--navy); font-family:'Montserrat'; font-weight:800;">22</div>
      <div class="trust-value">Years</div>
      <div class="trust-label">Family-Owned</div>
    </div>
  </div>

  <!-- SERVICE SELECTOR -->
  <div class="card">
    <div class="section-title">What do you need help with?</div>
    <div class="section-sub">Pick one and we'll route you to the right team.</div>

    <div class="service-grid">
      <button type="button" class="service-card active" data-service="hvac" onclick="selectService('hvac')">
        <span class="service-icon">❄️</span>
        <div class="service-name">HVAC</div>
        <div class="service-tag">AC · Heat</div>
      </button>
      <button type="button" class="service-card" data-service="plumbing" onclick="selectService('plumbing')">
        <span class="service-icon">🔧</span>
        <div class="service-name">Plumbing</div>
        <div class="service-tag">Leaks · Drains</div>
      </button>
      <button type="button" class="service-card" data-service="electrical" onclick="selectService('electrical')">
        <span class="service-icon">⚡</span>
        <div class="service-name">Electrical</div>
        <div class="service-tag">Panels · Wiring</div>
      </button>
    </div>

    <div class="availability">
      <div class="avail-dot"></div>
      <div class="avail-text">
        <strong>Same-day appointments often available.</strong> Faster service when you call.
      </div>
    </div>

    <div class="cta-stack">
      <button class="btn btn-primary" onclick="bookNow()" id="book-btn">
        Book My ${formatCurrency(discount)} Off · HVAC
      </button>
      <a class="btn btn-secondary" href="tel:${LEX_PHONE_TEL}">
        📞 Call ${LEX_PHONE}
      </a>
    </div>
  </div>

  <!-- REVIEWS -->
  <div class="card">
    <div class="section-title">What people say about LEX</div>
    <div class="section-sub">Real reviews from real DFW homeowners.</div>

    <div class="reviews-stack">
      <div class="review">
        <div class="review-stars">★★★★★</div>
        <div class="review-text">"Mike showed up within 2 hours of my call. AC was back running before dinner. Couldn't ask for better service."</div>
        <div class="review-attr">
          <div class="review-avatar">KB</div>
          <div>
            <div class="review-name">Karen B.</div>
            <div class="review-meta">Frisco · Verified</div>
          </div>
          <div class="google-mark">Google</div>
        </div>
      </div>

      <div class="review">
        <div class="review-stars">★★★★★</div>
        <div class="review-text">"Replaced my hot water heater same day. Clean install, fair price, no upsell pressure. We've used them 3 times now."</div>
        <div class="review-attr">
          <div class="review-avatar">DL</div>
          <div>
            <div class="review-name">David L.</div>
            <div class="review-meta">Plano · Verified</div>
          </div>
          <div class="google-mark">Google</div>
        </div>
      </div>

      <div class="review">
        <div class="review-stars">★★★★★</div>
        <div class="review-text">"Called for a panel upgrade. Tech walked through every option, gave me a written quote, did the work the next day. Pros."</div>
        <div class="review-attr">
          <div class="review-avatar">MT</div>
          <div>
            <div class="review-name">Maria T.</div>
            <div class="review-meta">Carrollton · Verified</div>
          </div>
          <div class="google-mark">Google</div>
        </div>
      </div>
    </div>
  </div>

  <!-- WHY LEX -->
  <div class="card">
    <div class="section-title">Why people pick LEX</div>
    <div class="section-sub">Four reasons your friend sent you here.</div>

    <div class="why-grid">
      <div class="why-item">
        <div class="why-icon">⏱</div>
        <div class="why-title">Same-day service</div>
        <div class="why-text">Most calls before noon get a tech the same day.</div>
      </div>
      <div class="why-item">
        <div class="why-icon">💵</div>
        <div class="why-title">Upfront pricing</div>
        <div class="why-text">Written quotes before any work. No surprise bills.</div>
      </div>
      <div class="why-item">
        <div class="why-icon">🛡</div>
        <div class="why-title">Background-checked</div>
        <div class="why-text">Every tech is licensed, insured, and vetted.</div>
      </div>
      <div class="why-item">
        <div class="why-icon">🤝</div>
        <div class="why-title">100% satisfaction</div>
        <div class="why-text">Not happy? We make it right or you don't pay.</div>
      </div>
    </div>
  </div>

  <!-- FINE PRINT -->
  <div class="fine-print">
    <div class="fine-print-title">How the ${formatCurrency(discount)} off works</div>
    <ul>
      <li>Applied automatically when you book through this link</li>
      <li>Valid on first qualifying service of ${formatCurrency(minJob)} or more</li>
      <li>One discount per household</li>
      <li>Cannot combine with other offers</li>
      <li>No expiration · use it whenever you need us</li>
    </ul>
  </div>

  <p class="footer-block">
    <strong style="color:var(--navy);">LEX Air Conditioning, Heating, Plumbing &amp; Electrical</strong><br>
    Family-owned · Serving DFW since 2004<br>
    <a href="tel:${LEX_PHONE_TEL}">${LEX_PHONE}</a> · <a href="https://lexairconditioning.com">lexairconditioning.com</a><br>
    <span class="footer-license">TACLA38788C · TECL23192 · M18088</span>
  </p>
</div>

<!-- Sticky bottom CTA -->
<div class="sticky-cta">
  <button class="btn btn-primary" onclick="bookNow()">
    Book My ${formatCurrency(discount)} Off
  </button>
  <a class="btn btn-secondary" href="tel:${LEX_PHONE_TEL}">
    📞 Call
  </a>
</div>

<div class="toast" id="toast">Opening scheduler…</div>

<!-- LEX scheduler widget -->
<script>
window.LEXSchedulerConfig = {
  apiEndpoint: '${BOOKING_API}',
  autoButton: false,
  referralSlug: '${escapeJs(slug)}',
  referralCode: '${escapeJs(code)}'
};
</script>
<script src="${SCHEDULER_JS}"></script>

<script>
const SERVICE_LABELS = { hvac: 'HVAC', plumbing: 'Plumbing', electrical: 'Electrical' };
const DISCOUNT_LABEL = ${JSON.stringify(formatCurrency(discount))};
const REFERRAL_CODE  = '${escapeJs(code)}';
const REFERRAL_SLUG  = '${escapeJs(slug)}';

let currentService = 'hvac';

function selectService(svc) {
  currentService = svc;
  document.querySelectorAll('.service-card').forEach(function(c) {
    c.classList.toggle('active', c.dataset.service === svc);
  });
  document.getElementById('book-btn').textContent = 'Book My ' + DISCOUNT_LABEL + ' Off · ' + SERVICE_LABELS[svc];
  if (window.LEXSchedulerConfig) window.LEXSchedulerConfig.service = svc;
}

function bookNow() {
  if (window.LEXSchedulerConfig) window.LEXSchedulerConfig.service = currentService;
  showToast('Opening ' + SERVICE_LABELS[currentService] + ' scheduler…');
  if (window.LEXScheduler && typeof window.LEXScheduler.open === 'function') {
    window.LEXScheduler.open();
    return;
  }
  if (window.LEXScheduler && typeof window.LEXScheduler.toggle === 'function') {
    window.LEXScheduler.toggle();
    return;
  }
  // Fallback: send the visitor to /book where the widget auto-opens
  window.location.href = '/book?r=' + encodeURIComponent(REFERRAL_CODE || REFERRAL_SLUG);
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 1800);
}

// Track the click so the admin dashboard sees a "pending" referral
(function trackClick() {
  const slug = REFERRAL_SLUG || REFERRAL_CODE;
  if (!slug) return;
  fetch('/api/referral/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  }).catch(function() {});
})();

// Initialise active service label
selectService('hvac');
</script>
</body>
</html>`;
}

// ── Render: invalid / missing code fallback ──────────────────

function renderInvalidPage({ rawInput, settings }) {
  const safe = escapeHtml(String(rawInput || '').slice(0, 30));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#1d3a6e" />
<title>Referral link not recognized — LEX Air</title>
<style>
body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
       background:#f1f5f9; min-height:100vh; margin:0;
       display:flex; align-items:center; justify-content:center; padding:24px; }
.card { background:#fff; max-width:420px; width:100%;
        padding:36px 28px; border-radius:16px;
        border:1px solid #e2e8f0; text-align:center; }
h1 { font-size:22px; color:#1d3a6e; margin-bottom:10px; font-weight:800; }
p  { font-size:14px; color:#64748b; line-height:1.55; margin-bottom:20px; }
a.btn { display:inline-block; padding:14px 24px;
        background:#e85c24; color:#fff; text-decoration:none;
        border-radius:12px; font-weight:700; font-size:15px;
        box-shadow:0 4px 14px rgba(232,92,36,0.35); }
a.alt { display:block; margin-top:14px; font-size:13px; color:#1d3a6e; text-decoration:none; font-weight:600; }
</style>
</head>
<body>
<div class="card">
  <h1>That referral link doesn't look right</h1>
  <p>${safe ? `We couldn't match the code <strong>${safe}</strong> to a LEX customer. ` : 'No referral code was found in this link. '}
     You can still call us — just mention you were referred and we'll sort it out.</p>
  <a class="btn" href="tel:${LEX_PHONE_TEL}">📞 Call ${LEX_PHONE}</a>
  <a class="alt" href="https://lexairconditioning.com">Visit lexairconditioning.com →</a>
</div>
</body>
</html>`;
}

// ── Styles ────────────────────────────────────────────────────

const PAGE_STYLES = `
:root {
  --navy: #1d3a6e;
  --navy-dark: #142a52;
  --navy-deep: #0a1936;
  --orange: #e85c24;
  --orange-dark: #c94e1e;
  --gold: #C8A851;
  --gold-soft: #f5ecd3;
  --gold-deep: #a08530;
  --green: #10b981;
  --green-bg: #ecfdf5;
  --slate-50: #f8fafc;
  --slate-100: #f1f5f9;
  --slate-200: #e2e8f0;
  --slate-300: #cbd5e1;
  --slate-500: #64748b;
  --slate-700: #334155;
  --slate-900: #0f172a;
  --shadow-sm: 0 1px 2px rgba(15,23,42,0.04);
  --shadow-md: 0 4px 12px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04);
  --shadow-lg: 0 12px 32px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.04);
  --shadow-xl: 0 24px 48px rgba(15,23,42,0.14), 0 8px 24px rgba(15,23,42,0.06);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background:
    radial-gradient(ellipse 800px 400px at 50% -100px, rgba(29,58,110,0.10), transparent 70%),
    radial-gradient(ellipse 600px 300px at 80% 200px, rgba(200,168,81,0.08), transparent 70%),
    linear-gradient(180deg, #fafbfc 0%, #f1f5f9 100%);
  background-attachment: fixed;
  min-height: 100vh;
  color: var(--slate-900);
  line-height: 1.5;
  padding: 0 16px calc(env(safe-area-inset-bottom, 0px) + 80px);
}
.topbar {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
  padding: 12px 18px;
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 -16px;
  position: sticky; top: 0; z-index: 50;
  box-shadow: var(--shadow-md);
}
.topbar-brand {
  display: flex; align-items: center; gap: 10px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.topbar-brand .logo-mark {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}
.topbar-brand .wordmark {
  color: #fff;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 14px;
  letter-spacing: 0.04em;
}
.topbar-brand .wordmark span { color: var(--gold); }
.topbar a.call-link {
  color: rgba(255,255,255,0.95);
  text-decoration: none;
  font-size: 13px; font-weight: 700;
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: var(--orange);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(232,92,36,0.4);
  font-family: 'Montserrat', sans-serif;
}
.topbar a.call-link:hover { background: var(--orange-dark); }
.wrap { max-width: 480px; margin: 0 auto; padding: 18px 0 32px; }
.referrer-strip {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--slate-200);
  box-shadow: var(--shadow-sm);
  margin-bottom: 14px;
}
.referrer-avatar {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--navy), var(--navy-dark));
  color: var(--gold);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Montserrat', sans-serif;
  font-weight: 800; font-size: 18px;
  flex-shrink: 0;
  border: 2px solid var(--gold);
  box-shadow: 0 4px 12px rgba(29,58,110,0.2);
}
.referrer-text { flex: 1; min-width: 0; }
.referrer-eyebrow {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px; font-weight: 700;
  color: var(--slate-500);
  letter-spacing: 0.1em; text-transform: uppercase;
  margin-bottom: 2px;
}
.referrer-name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 16px;
  color: var(--slate-900); line-height: 1.2;
}
.referrer-name span { color: var(--slate-500); font-weight: 500; font-size: 14px; }
.voucher {
  position: relative;
  background:
    radial-gradient(circle at 0% 0%, rgba(200,168,81,0.25), transparent 60%),
    radial-gradient(circle at 100% 100%, rgba(232,92,36,0.15), transparent 60%),
    linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
  color: #fff;
  border-radius: 18px;
  padding: 28px 24px 24px;
  margin-bottom: 14px;
  overflow: hidden;
  border: 1px solid var(--gold-deep);
  box-shadow: var(--shadow-lg);
}
.voucher::before {
  content: ''; position: absolute;
  top: -60px; right: -60px;
  width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(200,168,81,0.25), transparent 70%);
  border-radius: 50%; pointer-events: none;
}
.voucher-eyebrow {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px; font-weight: 700;
  color: var(--gold);
  letter-spacing: 0.14em; text-transform: uppercase;
  text-align: center; margin-bottom: 8px;
  position: relative;
}
.voucher-eyebrow::before, .voucher-eyebrow::after {
  content: ''; display: inline-block;
  width: 24px; height: 1px;
  background: var(--gold);
  vertical-align: middle; margin: 0 8px;
  opacity: 0.5;
}
.voucher-amount {
  font-family: 'Montserrat', sans-serif;
  font-weight: 900; font-size: 88px;
  line-height: 1;
  color: var(--gold);
  text-align: center;
  letter-spacing: -0.04em;
  text-shadow: 0 4px 20px rgba(200,168,81,0.3);
  position: relative; margin-bottom: 4px;
}
.voucher-amount sup {
  font-size: 32px;
  vertical-align: top;
  margin-top: 14px;
  display: inline-block;
  margin-right: 2px;
  text-shadow: none;
}
.voucher-label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 14px;
  text-align: center;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.9);
  position: relative; margin-bottom: 16px;
}
.voucher-tag {
  text-align: center; font-size: 13px;
  color: rgba(255,255,255,0.75);
  margin-bottom: 18px; position: relative;
}
.voucher-meta {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(200,168,81,0.25);
  border-radius: 10px;
  padding: 10px 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; position: relative;
}
.voucher-meta-label { color: rgba(200,168,81,0.85); font-weight: 700; letter-spacing: 0.08em; }
.voucher-meta-value { color: #fff; font-weight: 700; letter-spacing: 0.08em; }
.trust-bar {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
  background: #fff;
  border-radius: 14px;
  padding: 16px 8px;
  margin-bottom: 14px;
  border: 1px solid var(--slate-200);
  box-shadow: var(--shadow-sm);
}
.trust-cell { text-align: center; padding: 0 8px; position: relative; }
.trust-cell + .trust-cell::before {
  content: ''; position: absolute; left: 0; top: 20%; bottom: 20%;
  width: 1px; background: var(--slate-200);
}
.trust-stars { color: var(--gold); font-size: 14px; letter-spacing: 1px; margin-bottom: 4px; line-height: 1; }
.trust-value { font-family:'Montserrat',sans-serif; font-weight: 800; font-size: 16px; color: var(--navy); line-height: 1; }
.trust-label { font-size: 10px; color: var(--slate-500); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-top: 4px; }
.card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--slate-200);
  margin-bottom: 14px;
  box-shadow: var(--shadow-sm);
  padding: 22px 20px;
}
.section-title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 17px;
  color: var(--navy); margin-bottom: 4px; letter-spacing: -0.01em;
}
.section-sub { font-size: 13px; color: var(--slate-500); margin-bottom: 16px; }
.service-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px; margin-bottom: 14px;
}
.service-card {
  position: relative;
  background: #fff;
  border: 2px solid var(--slate-200);
  border-radius: 14px;
  padding: 16px 8px 14px;
  text-align: center;
  cursor: pointer; transition: all 0.15s;
  font-family: inherit;
}
.service-card:hover {
  border-color: var(--navy);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.service-card.active {
  border-color: var(--orange);
  background: linear-gradient(180deg, #fff 0%, #fff7f3 100%);
  box-shadow: 0 0 0 3px rgba(232,92,36,0.15);
}
.service-card.active::after {
  content: '✓';
  position: absolute;
  top: 6px; right: 8px;
  width: 18px; height: 18px;
  background: var(--orange); color: #fff;
  font-size: 11px; font-weight: 700;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Montserrat', sans-serif;
}
.service-icon { font-size: 28px; line-height: 1; margin-bottom: 8px; display: block; }
.service-name { font-family:'Montserrat',sans-serif; font-weight: 700; font-size: 13px; color: var(--slate-900); line-height: 1.2; }
.service-tag { font-size: 10px; color: var(--slate-500); margin-top: 2px; font-weight: 500; }
.availability {
  display: flex; align-items: center; gap: 10px;
  background: var(--green-bg);
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
  font-size: 13px; color: #065f46;
}
.avail-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(16,185,129,0.25);
  animation: pulse 2s infinite;
  flex-shrink: 0;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(16,185,129,0.25); }
  50%      { box-shadow: 0 0 0 6px rgba(16,185,129,0.10); }
}
.avail-text strong { color: #064e3b; font-weight: 700; }
.cta-stack { display: flex; flex-direction: column; gap: 10px; }
.btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%;
  padding: 18px 20px;
  border-radius: 14px;
  font-size: 17px; font-weight: 700;
  text-decoration: none; cursor: pointer; border: none;
  font-family: 'Montserrat', sans-serif;
  transition: transform 0.05s ease, box-shadow 0.15s ease;
  letter-spacing: -0.01em;
  text-align: center;
}
.btn:active { transform: scale(0.985); }
.btn-primary {
  background: linear-gradient(180deg, var(--orange) 0%, var(--orange-dark) 100%);
  color: #fff !important;
  box-shadow: 0 6px 20px rgba(232,92,36,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
}
.btn-primary:hover { box-shadow: 0 8px 28px rgba(232,92,36,0.5), inset 0 1px 0 rgba(255,255,255,0.2); }
.btn-secondary {
  background: #fff;
  color: var(--navy) !important;
  border: 2px solid var(--navy);
}
.btn-secondary:hover { background: #f0f7ff; }
.reviews-stack { display: flex; flex-direction: column; gap: 12px; }
.review {
  background: var(--slate-50);
  border: 1px solid var(--slate-200);
  border-radius: 12px;
  padding: 16px;
  position: relative;
}
.review-stars { color: var(--gold); font-size: 14px; letter-spacing: 2px; margin-bottom: 8px; }
.review-text { font-size: 14px; color: var(--slate-700); line-height: 1.5; margin-bottom: 10px; }
.review-attr { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.review-avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--navy); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 11px;
  flex-shrink: 0;
}
.review-name { font-weight: 700; color: var(--slate-900); }
.review-meta { color: var(--slate-500); }
.google-mark {
  margin-left: auto;
  font-size: 10px; color: var(--slate-500);
  text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
}
.google-mark::before {
  content: 'G'; display: inline-block;
  width: 14px; height: 14px;
  background: linear-gradient(135deg, #4285F4 0%, #EA4335 50%, #FBBC04 100%);
  border-radius: 50%;
  color: #fff;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 9px;
  text-align: center; line-height: 14px;
  margin-right: 4px; vertical-align: middle;
}
.why-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.why-item {
  padding: 14px 12px;
  background: var(--slate-50);
  border-radius: 12px;
  border: 1px solid var(--slate-100);
}
.why-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--navy), var(--navy-dark));
  color: var(--gold);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; margin-bottom: 8px;
}
.why-title { font-family:'Montserrat',sans-serif; font-weight: 700; font-size: 13px; color: var(--slate-900); margin-bottom: 2px; line-height: 1.25; }
.why-text { font-size: 12px; color: var(--slate-500); line-height: 1.4; }
.fine-print {
  background: var(--slate-50);
  border: 1px solid var(--slate-200);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.fine-print-title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 12px;
  color: var(--slate-700);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.fine-print ul { list-style: none; font-size: 12px; color: var(--slate-500); line-height: 1.6; }
.fine-print li { padding-left: 14px; position: relative; }
.fine-print li::before { content: '·'; position: absolute; left: 4px; color: var(--gold); font-weight: 900; }
.footer-block {
  text-align: center;
  padding: 18px 0 8px;
  font-size: 12px; color: var(--slate-500);
  line-height: 1.6;
}
.footer-block a { color: var(--navy); text-decoration: none; font-weight: 600; }
.footer-license {
  display: inline-block;
  margin-top: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--slate-500);
  letter-spacing: 0.04em;
}
.sticky-cta {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--slate-200);
  padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px);
  box-shadow: 0 -4px 16px rgba(15,23,42,0.06);
  z-index: 40;
  display: flex; gap: 8px;
  max-width: 480px;
  margin: 0 auto;
}
.sticky-cta .btn { padding: 14px 16px; font-size: 15px; border-radius: 12px; }
.sticky-cta .btn-primary { flex: 2; }
.sticky-cta .btn-secondary { flex: 1; padding: 14px 12px; }
.toast {
  position: fixed; left: 50%; bottom: 100px;
  transform: translateX(-50%) translateY(20px);
  background: var(--navy-deep); color: #fff;
  padding: 12px 20px; border-radius: 12px;
  font-size: 14px; font-weight: 600;
  font-family: 'Montserrat', sans-serif;
  box-shadow: var(--shadow-xl);
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
  z-index: 1000;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
@media (max-width: 380px) {
  .voucher-amount { font-size: 72px; }
  .voucher-amount sup { font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .avail-dot { animation: none; }
  * { transition: none !important; }
}
`;

module.exports = router;
