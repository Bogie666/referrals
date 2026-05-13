/**
 * GET /share/:code
 * GET /my-referrals
 * ─────────────────────────────────────────────────────────────
 * Combined customer portal. Two URLs, one experience:
 *
 *   /share/:code        → direct deeplink from the Day-8 Chiirp SMS,
 *                         skips phone lookup, lands on the share UI.
 *   /my-referrals       → cold entry; phone-lookup form; on match the
 *                         JS redirects to /share/:code so URLs are
 *                         shareable.
 *
 * Server-rendered HTML, no client framework. Mobile-first. Fonts +
 * QR lib pulled from CDN (CSP whitelisted in src/index.js).
 *
 * Layout follows /root/.claude/uploads/.../lexperksdemo.html with the
 * hardcoded customer / ticker data swapped for live values.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const supabase = require('../db');
const { normalizeCode } = require('../utils/slugs');
const { recordEvent, extractRequestContext } = require('../services/tracking');

const REFERRAL_BASE_URL = process.env.REFERRAL_BASE_URL || 'https://lexperks.com/referral';
const SHARE_BASE_URL    = (process.env.REFERRAL_BASE_URL ? new URL(process.env.REFERRAL_BASE_URL).origin : 'https://lexperks.com');
const LEX_PHONE         = '(972) 466-1917';
const LEX_MASCOT_URL    = 'https://www.lexairconditioning.com/wp-content/uploads/2026/05/lex_gabe-2.png';

// Hardcoded ticker. Replace with live data once we have enough referrals
// to make a rolling feed meaningful.
const TICKER_ITEMS = [
  { who: 'Sarah from Plano',     amount: '$185' },
  { stat: '14 referrals booked across LEXPerks this month' },
  { who: 'Mike from Frisco',     amount: '$250' },
  { stat: 'Average reward this month: $142' },
  { who: 'Jen from Allen',       amount: '$118' },
  { stat: 'New: refer 3 friends, unlock a free maintenance visit' },
];

// ── Settings + customer data ──────────────────────────────────

async function loadPortalSettings() {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['payout_percentage', 'payout_cap', 'new_customer_discount', 'min_job_value']);
  const map = {};
  (data || []).forEach(row => { map[row.key] = row.value; });
  const num = (v, fallback) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    payoutPercentage: num(map.payout_percentage, 5),
    payoutCap:        num(map.payout_cap, 250),
    discountAmount:   num(map.new_customer_discount, 50),
    minJobValue:      num(map.min_job_value, 350),
  };
}

async function loadCustomerByCode(code) {
  const { data } = await supabase
    .from('customers')
    .select('id, name, phone, email, referral_code, referral_link, total_referrals, total_rewards, created_at')
    .eq('referral_code', code)
    .single();
  return data;
}

async function loadReferrals(customerId, limit = 10) {
  const { data } = await supabase
    .from('referrals')
    .select('id, referred_name, status, reward_amount, updated_at, created_at')
    .eq('referrer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

function computeStats(customer, referrals) {
  const rewardedReferrals = referrals.filter(r => r.status === 'rewarded');
  const pendingReferrals  = referrals.filter(r => r.status === 'completed');
  const inFlightReferrals = referrals.filter(r => ['pending', 'booked'].includes(r.status));

  const earned = parseFloat(customer.total_rewards || 0)
    || rewardedReferrals.reduce((s, r) => s + parseFloat(r.reward_amount || 0), 0);

  const pending = pendingReferrals.reduce((s, r) => s + parseFloat(r.reward_amount || 0), 0);

  const referralsCount = parseInt(customer.total_referrals || 0)
    || rewardedReferrals.length;

  return {
    referralsCount,
    earned,
    pending,
    pendingCount: pendingReferrals.length,
    inFlightCount: inFlightReferrals.length,
  };
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

function escapeJsString(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\//g, '<\\/'); // avoid </script> breaking inline script
}

function formatCurrency(n) {
  const v = parseFloat(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function memberSince(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatFriendName(fullName) {
  if (!fullName) return 'Friend';
  const parts = String(fullName).trim().split(/\s+/);
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() + '.' : '';
  return [first, last].filter(Boolean).join(' ');
}

function avatarColorFor(status) {
  if (status === 'rewarded') return 'green';
  if (status === 'completed') return 'amber';
  if (status === 'pending')   return 'gold';
  return '';
}

function statusLabel(r) {
  if (r.status === 'rewarded')  return `Rewarded · ${formatDate(r.updated_at || r.created_at)}`;
  if (r.status === 'completed') return 'Job complete · payout in flight';
  if (r.status === 'booked')    return 'Booked · waiting on service';
  if (r.status === 'pending')   return 'Link clicked';
  if (r.status === 'rejected')  return 'Did not qualify';
  return r.status;
}

function amountLabel(r) {
  if (r.status === 'rewarded')  return { text: formatCurrency(r.reward_amount), pending: false };
  if (r.status === 'completed') return { text: formatCurrency(r.reward_amount) + ' pending', pending: true };
  return { text: '—', pending: false };
}

// ── Routes ────────────────────────────────────────────────────

router.get('/my-referrals', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const settings = await loadPortalSettings();
  res.send(renderPage({ mode: 'lookup', settings }));
});

router.get('/share/:code', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const rawCode = req.params.code || '';
  const code = normalizeCode(rawCode);

  if (!code) {
    return res.status(404).send(renderNotFound(rawCode));
  }

  const [customer, settings] = await Promise.all([
    loadCustomerByCode(code),
    loadPortalSettings(),
  ]);

  if (!customer) {
    return res.status(404).send(renderNotFound(rawCode));
  }

  const referrals = await loadReferrals(customer.id);
  const stats = computeStats(customer, referrals);

  recordEvent({
    eventType:      'portal_view',
    code:           customer.referral_code,
    referrerId:     customer.id,
    requestContext: extractRequestContext(req),
  }).catch(() => {});

  res.send(renderPage({ mode: 'auth', settings, customer, referrals, stats }));
});

// ── Render: shared chrome wrapper ─────────────────────────────

function renderPage({ mode, settings, customer, referrals, stats }) {
  const tickerHtml = TICKER_ITEMS.concat(TICKER_ITEMS).map(item => {
    if (item.who) {
      return `<div class="ticker-item"><span class="ticker-dot"></span>${escapeHtml(item.who)} just earned <strong>${escapeHtml(item.amount)}</strong></div>`;
    }
    return `<div class="ticker-item"><span class="ticker-dot"></span>${escapeHtml(item.stat)}</div>`;
  }).join('');

  const body = mode === 'auth'
    ? renderAuthBody({ settings, customer, referrals, stats })
    : renderLookupBody({ settings });

  const inlineScript = mode === 'auth'
    ? renderAuthScript({ customer, settings })
    : renderLookupScript();

  const title = mode === 'auth'
    ? `${escapeHtml((customer.name || '').split(' ')[0] || 'Your')}'s LEXPerks`
    : 'LEXPerks — Find My Account';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#1d3a6e" />
<meta name="robots" content="noindex" />
<meta property="og:type" content="website" />
<meta property="og:title" content="LEXPerks — Your Rewards" />
<meta property="og:description" content="Send your LEX referral to a friend in one tap." />
<meta name="twitter:card" content="summary" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=Open+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet" />
${mode === 'auth' ? '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>' : ''}
<style>${PAGE_STYLES}</style>
</head>
<body>

<div class="topbar">
  <a class="topbar-brand" href="https://www.lexairconditioning.com" aria-label="LEX Air Conditioning home">
    <img class="logo-mark" src="${LEX_MASCOT_URL}" alt="LEX" />
    <div class="wordmark">LEX<span>PERKS</span></div>
  </a>
  <a href="tel:9724661917" class="call-link">📞 ${LEX_PHONE}</a>
</div>

<div class="ticker-bar">
  <div class="ticker-track">${tickerHtml}</div>
</div>

${body}

<div class="toast" id="toast">
  <span class="check">✓</span>
  <span id="toast-msg">Copied!</span>
</div>

<script>${inlineScript}</script>
</body>
</html>`;
}

// ── Render: authenticated body ────────────────────────────────

function renderAuthBody({ settings, customer, referrals, stats }) {
  const firstName  = (customer.name || 'Friend').split(' ')[0];
  const code       = customer.referral_code;
  const link       = customer.referral_link || `${REFERRAL_BASE_URL}?r=${code}`;
  const since      = memberSince(customer.created_at);

  const rewardCap   = settings.payoutCap;
  const rewardPct   = settings.payoutPercentage;
  const discount    = settings.discountAmount;
  const minJob      = settings.minJobValue;

  const pendingHtml = stats.pending > 0
    ? `<div class="pending-callout">
         <div class="pending-callout-icon">$</div>
         <div>You have <strong>${formatCurrency(stats.pending)} in flight</strong>${stats.pendingCount > 0 ? ` — ${stats.pendingCount} ${stats.pendingCount === 1 ? "friend's job is" : "friends' jobs are"} in progress` : ''}</div>
       </div>`
    : '';

  const historyHtml = referrals.length === 0
    ? `<div style="text-align:center; padding:18px 8px 4px; color:var(--slate-500); font-size:14px;">
         No referrals yet — <strong style="color:var(--navy);">be the first to share your link.</strong>
       </div>`
    : referrals.map(r => {
        const amount = amountLabel(r);
        const initial = (r.referred_name || 'F').trim().charAt(0).toUpperCase();
        return `
          <div class="history-item">
            <div class="history-avatar ${avatarColorFor(r.status)}">${escapeHtml(initial)}</div>
            <div class="history-meta">
              <div class="history-name">${escapeHtml(formatFriendName(r.referred_name))}</div>
              <div class="history-status">${escapeHtml(statusLabel(r))}</div>
            </div>
            <div class="history-amount${amount.pending ? ' pending' : ''}">${escapeHtml(amount.text)}</div>
          </div>
        `;
      }).join('');

  return `
<div class="wrap">

  <!-- HERO -->
  <div class="card hero-card card-pad-lg">
    <div class="hero-greeting">Welcome back</div>
    <div class="hero-name">Hey ${escapeHtml(firstName)} 👋</div>
    ${since ? `<div class="hero-tagline">You're a LEXPerks member since ${escapeHtml(since)}</div>` : ''}

    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-value">${stats.referralsCount}</div>
        <div class="hero-stat-label">Referrals</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-value gold">${formatCurrency(stats.earned)}</div>
        <div class="hero-stat-label">Earned</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-value amber">${formatCurrency(stats.pending)}</div>
        <div class="hero-stat-label">Pending</div>
      </div>
    </div>

    ${pendingHtml}
  </div>

  <!-- REWARD HEADLINE -->
  <div class="card reward-headline card-pad-lg">
    <div class="reward-amount"><sup>up to</sup>${formatCurrency(rewardCap)}<sub>per referral</sub></div>
    <div class="reward-label">In gift cards</div>
    <div class="reward-sublabel">${rewardPct}% of your friend's service total · No cap on how many friends you refer</div>
  </div>

  <!-- SHARE -->
  <div class="card card-pad">
    <div class="section-title">Share your link</div>
    <div class="section-sub">Pick a vibe and we'll write the message for you.</div>

    <div class="style-chips">
      <button class="chip active" data-style="casual" onclick="setStyle('casual')">Casual</button>
      <button class="chip" data-style="urgent" onclick="setStyle('urgent')">Their AC is dying</button>
      <button class="chip" data-style="newhome" onclick="setStyle('newhome')">Just bought a house</button>
      <button class="chip" data-style="pro" onclick="setStyle('pro')">Professional</button>
    </div>

    <div class="preview" id="preview-text"></div>

    <div class="actions">
      <a class="btn btn-primary" href="#" id="share-sms" onclick="beaconShare('sms')">💬 Text a friend</a>
      <a class="btn btn-secondary" href="#" id="share-email" onclick="beaconShare('email')">✉️ Send by email</a>
      <button class="btn btn-tertiary" onclick="nativeShare()">🔗 Share via apps</button>
    </div>

    <div class="code-box" onclick="copyCode(); beaconShare('copy_code');" style="margin-top:18px; margin-bottom:0;">
      <div class="code-label">Your code · tap to copy</div>
      <div class="code-value">${escapeHtml(code)}</div>
      <div class="code-hint">Or have friends mention this code when they call</div>
    </div>

    <div class="copy-row">
      <input type="text" class="copy-input" id="link-input" value="${escapeHtml(link)}" readonly />
      <button class="copy-btn" onclick="copyLink(); beaconShare('copy');">Copy link</button>
    </div>

    <button class="qr-toggle" onclick="toggleQR()" id="qr-toggle">
      <span>Show QR code (scan in person)</span>
      <span class="arrow">▾</span>
    </button>
    <div class="qr-panel" id="qr-panel">
      <div class="qr-inner">
        <div class="qr-frame"><div id="qr-img"></div></div>
        <div class="qr-caption">
          Show this to anyone who asks about LEX in person.<br>They scan, get the discount, and you get credit.
        </div>
      </div>
    </div>
  </div>

  <!-- TRUST STRIP -->
  <div class="card card-pad">
    <div class="trust-strip">
      <div class="trust-item">
        <div class="trust-value">2,200+</div>
        <div class="trust-label">5-Star Reviews</div>
      </div>
      <div class="trust-item">
        <div class="trust-value">A+</div>
        <div class="trust-label">BBB Rated</div>
      </div>
      <div class="trust-item">
        <div class="trust-value">2004</div>
        <div class="trust-label">Family-Owned Since</div>
      </div>
    </div>
  </div>

  <!-- HISTORY -->
  <div class="card card-pad">
    <div class="section-title">Your referrals</div>
    <div class="section-sub">${stats.referralsCount} ${stats.referralsCount === 1 ? 'friend' : 'friends'}, ${formatCurrency(stats.earned)} earned so far</div>
    ${historyHtml}
  </div>

  <!-- HOW IT WORKS -->
  <div class="card card-pad">
    <div class="section-title">How it works</div>
    <div class="section-sub">Three steps. Fully automatic.</div>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text">
          <strong>Share your link</strong>
          <p>Send via text, email, or scan. Anyone who needs HVAC, plumbing, or electrical in DFW.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text">
          <strong>They book LEX</strong>
          <p>They save ${formatCurrency(discount)} on their first qualifying service (${formatCurrency(minJob)} minimum invoice).</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text">
          <strong>You get paid</strong>
          <p>${rewardPct}% of their invoice (up to ${formatCurrency(rewardCap)}) lands in your inbox as a digital gift card.</p>
        </div>
      </div>
    </div>
  </div>

  <p class="footer-strip">
    Questions? Call <a href="tel:9724661917">${LEX_PHONE}</a><br>
    LEX Air Conditioning · Family-owned, serving DFW since 2004<br>
    <button type="button" onclick="signOut()" style="background:none; border:0; padding:8px 0 0; margin-top:8px; color:var(--slate-500); font-size:11px; font-family:inherit; cursor:pointer; text-decoration:underline;">Sign out / use a different number</button>
  </p>
</div>`;
}

// ── Render: lookup body ───────────────────────────────────────

function renderLookupBody({ settings }) {
  const discount = settings.discountAmount;
  const cap = settings.payoutCap;

  return `
<div class="wrap">
  <div class="card lookup-card">
    <img class="lookup-icon" src="${LEX_MASCOT_URL}" alt="LEX" />
    <div class="lookup-h">Welcome back</div>
    <div class="lookup-sub">Enter the phone number on your LEX account to view your referral code, link, and rewards.</div>

    <input type="tel" class="lookup-input" placeholder="(972) 555-0100" id="lookup-phone" autocomplete="tel" inputmode="tel" />
    <div id="lookup-error" style="font-size:13px; color:#dc2626; min-height:20px; margin-bottom:8px; display:none;"></div>

    <button class="btn btn-primary" id="lookup-btn" onclick="doLookup()">Find my account</button>

    <div style="font-size:12px; color:var(--slate-500); margin-top:18px;">
      Not a LEX customer yet? <a href="tel:9724661917" style="color:var(--navy); font-weight:600;">Give us a call</a>
    </div>
  </div>

  <div class="card card-pad" style="text-align:center;">
    <div style="font-family:'Montserrat', sans-serif; font-weight:700; font-size:14px; color:var(--navy); letter-spacing:0.06em; text-transform:uppercase; margin-bottom:8px;">
      Why LEX customers love it
    </div>
    <p style="font-size:14px; color:var(--slate-700); line-height:1.6; margin:0;">
      Refer a friend, they save <strong>${formatCurrency(discount)}</strong> on their first service.
      You earn <strong>up to ${formatCurrency(cap)}</strong> per referral as a gift card. No limits, no catch.
    </p>
  </div>

  <p class="footer-strip">
    Questions? Call <a href="tel:9724661917">${LEX_PHONE}</a><br>
    LEX Air Conditioning · Family-owned, serving DFW since 2004
  </p>
</div>`;
}

// ── Render: inline scripts ────────────────────────────────────

function renderAuthScript({ customer, settings }) {
  const firstName = (customer.name || 'Friend').split(' ')[0];
  const code      = customer.referral_code;
  const link      = customer.referral_link || `${REFERRAL_BASE_URL}?r=${code}`;
  const discount  = settings.discountAmount;

  return `
const FIRST_NAME = '${escapeJsString(firstName)}';
const CODE       = '${escapeJsString(code)}';
const LINK       = '${escapeJsString(link)}';
// SMS apps (iOS Messages + Google Messages) auto-attach a duplicate
// of any URL ending the body when sent via sms: deeplinks. Stripping
// https:// breaks that auto-detect heuristic — the recipient still
// sees a tappable link (modern messaging apps auto-link bare
// domain.com paths) but the URL only goes through once.
const SHORT_LINK = LINK.replace(/^https?:\\/\\//, '');
const DISCOUNT   = ${discount};

const VARIANTS = {
  casual:  \`Hey, if you ever need HVAC, plumbing, or electrical work in DFW, we use LEX and they're solid. \$\${DISCOUNT} off your first service with my link: \${SHORT_LINK}\`,
  urgent:  \`If your AC is on the fritz, save yourself the headache and call LEX. They came out same-day for us, fixed it cleanly. Use my link for \$\${DISCOUNT} off: \${SHORT_LINK}\`,
  newhome: \`Congrats on the house! When you're lining up service pros, LEX has been our HVAC, plumbing, and electrical for years. \$\${DISCOUNT} off your first call with my link: \${SHORT_LINK}\`,
  pro:     \`Recommending LEX Air Conditioning for any HVAC, plumbing, or electrical needs in DFW. They've been excellent for us. Use my referral link for \$\${DISCOUNT} off your first service: \${SHORT_LINK}\`,
};

const SUBJECTS = {
  casual:  \`\${FIRST_NAME} thinks you'd like LEX\`,
  urgent:  \`Quick fix for your AC — \${FIRST_NAME}'s rec\`,
  newhome: 'Welcome to the neighborhood — service pro rec',
  pro:     \`\${FIRST_NAME} recommends LEX Air Conditioning\`,
};

let currentStyle = 'casual';

function setStyle(style) {
  currentStyle = style;
  document.querySelectorAll('.chip').forEach(function(c) {
    c.classList.toggle('active', c.dataset.style === style);
  });
  const preview = document.getElementById('preview-text');
  preview.style.opacity = '0';
  setTimeout(function() {
    preview.textContent = VARIANTS[style];
    preview.style.opacity = '1';
  }, 120);
  rebuildShareLinks();
}

function rebuildShareLinks() {
  const body = VARIANTS[currentStyle];
  const subj = SUBJECTS[currentStyle];
  document.getElementById('share-sms').href   = 'sms:?body=' + encodeURIComponent(body);
  document.getElementById('share-email').href = 'mailto:?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
}

function copyLink() {
  const inp = document.getElementById('link-input');
  inp.select();
  inp.setSelectionRange(0, 9999);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(inp.value).then(function() { showToast('Link copied'); });
  } else {
    try { document.execCommand('copy'); showToast('Link copied'); } catch (e) {}
  }
  inp.blur();
}

function copyCode() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(CODE).then(function() { showToast('Code copied: ' + CODE); });
  }
}

function nativeShare() {
  const body = VARIANTS[currentStyle];
  beaconShare('native');
  if (navigator.share) {
    navigator.share({ text: body, url: LINK }).catch(function() {});
  } else {
    copyLink();
  }
}

function beaconShare(channel) {
  try {
    fetch('/api/share/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ code: CODE, channel: channel }),
    }).catch(function() {});
  } catch (e) {}
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 1800);
}

function toggleQR() {
  const panel = document.getElementById('qr-panel');
  const toggle = document.getElementById('qr-toggle');
  const opening = !panel.classList.contains('open');
  panel.classList.toggle('open');
  toggle.classList.toggle('open');
  if (panel.classList.contains('open') && !document.getElementById('qr-img').hasChildNodes()) {
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'M');
      qr.addData(LINK);
      qr.make();
      document.getElementById('qr-img').innerHTML = qr.createImgTag(5, 4);
    }
  }
  if (opening) beaconShare('qr');
}

function signOut() {
  try { localStorage.removeItem('lex_customer'); } catch (e) {}
  // ?logout=1 keeps /my-referrals from auto-resuming back into this account
  window.location.href = '/my-referrals?logout=1';
}

// Init: render the casual preview & wire up share links
setStyle('casual');
`;
}

function renderLookupScript() {
  return `
// Auto-redirect to the saved customer's portal, if remembered.
// We only set this key after a successful phone lookup, so it's
// device-confirmed. The ?logout=1 query param skips the redirect
// so the user can re-enter their number after signing out.
(function autoResume() {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('logout') === '1') return;
    var saved = localStorage.getItem('lex_customer');
    if (saved) window.location.replace('/share/' + encodeURIComponent(saved));
  } catch (e) {}
})();

const phoneInput = document.getElementById('lookup-phone');
const errorEl    = document.getElementById('lookup-error');
const btn        = document.getElementById('lookup-btn');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = msg ? 'block' : 'none';
}

phoneInput.addEventListener('input', function() {
  const digits = this.value.replace(/\\D/g, '').slice(0, 10);
  let formatted = digits;
  if (digits.length > 6) formatted = '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
  else if (digits.length > 3) formatted = '(' + digits.slice(0,3) + ') ' + digits.slice(3);
  else if (digits.length > 0) formatted = '(' + digits;
  this.value = formatted;
  showError('');
});

phoneInput.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') doLookup();
});

async function doLookup() {
  const digits = phoneInput.value.replace(/\\D/g, '');
  if (digits.length !== 10) {
    showError('Please enter a 10-digit phone number.');
    phoneInput.focus();
    return;
  }
  showError('');
  btn.disabled = true;
  btn.textContent = 'Looking up...';

  try {
    const res = await fetch('/api/portal/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits }),
    });
    const data = await res.json();

    if (res.status === 404) {
      showError('We couldn\\'t find an account with that number. Make sure you used the number on file with LEX.');
      btn.disabled = false; btn.textContent = 'Find my account';
      return;
    }
    if (res.status === 503) {
      showError(data.message || 'We\\'re having trouble right now. Please call (972) 466-1917.');
      btn.disabled = false; btn.textContent = 'Find my account';
      return;
    }
    if (!data.hasReferralLink) {
      showError(data.message || 'Your referral link will be ready after your first completed service.');
      btn.disabled = false; btn.textContent = 'Find my account';
      return;
    }

    // Success — remember the device-confirmed customer for next time,
    // then redirect to /share/CODE so the URL is bookmarkable.
    try { localStorage.setItem('lex_customer', data.referralCode); } catch (e) {}
    window.location.href = '/share/' + encodeURIComponent(data.referralCode);
  } catch (err) {
    showError('Network error. Please try again.');
    btn.disabled = false; btn.textContent = 'Find my account';
  }
}
`;
}

// ── Not-found ─────────────────────────────────────────────────

function renderNotFound(rawCode) {
  const safe = escapeHtml(String(rawCode || '').slice(0, 20));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#1d3a6e" />
<meta name="robots" content="noindex" />
<title>Code not recognized — LEX Air</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       background:#f1f5f9; min-height:100vh; margin:0;
       display:flex; align-items:center; justify-content:center; padding:24px; }
.card { background:#fff; max-width:420px; width:100%;
        padding:32px 24px; border-radius:16px;
        border:1px solid #e2e8f0; text-align:center; }
h1 { font-size:20px; color:#1d3a6e; margin-bottom:10px; font-weight:800; }
p  { font-size:14px; color:#64748b; line-height:1.5; margin-bottom:18px; }
a.btn { display:inline-block; padding:12px 22px;
        background:#1d3a6e; color:#fff; text-decoration:none;
        border-radius:10px; font-weight:700; font-size:14px; }
.alt { display:block; margin-top:12px; font-size:13px; color:#1d3a6e; text-decoration:none; }
</style>
</head>
<body>
<div class="card">
  <h1>That code isn't recognized</h1>
  <p>We couldn't find a referral code matching <strong>${safe || '—'}</strong>.
     Double-check the link from your text, or look up your account.</p>
  <a class="btn" href="tel:9724661917">📞 Call ${LEX_PHONE}</a>
  <a class="alt" href="/my-referrals?logout=1">Look up by phone instead →</a>
</div>
<script>
// If we're on the not-found page, the saved code is stale — clear it
// so /my-referrals doesn't auto-resume back into this 404.
try { localStorage.removeItem('lex_customer'); } catch (e) {}
</script>
</body>
</html>`;
}

// ── Styles (full) ─────────────────────────────────────────────

const PAGE_STYLES = `
:root {
  --navy: #1d3a6e;
  --navy-dark: #142a52;
  --navy-deep: #0a1936;
  --orange: #e85c24;
  --orange-dark: #c94e1e;
  --gold: #C8A851;
  --gold-soft: #f5ecd3;
  --green: #10b981;
  --green-bg: #ecfdf5;
  --amber: #f59e0b;
  --amber-bg: #fffbeb;
  --slate-50: #f8fafc;
  --slate-100: #f1f5f9;
  --slate-200: #e2e8f0;
  --slate-300: #cbd5e1;
  --slate-500: #64748b;
  --slate-700: #334155;
  --slate-900: #0f172a;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.04);
  --shadow-xl: 0 24px 48px rgba(15, 23, 42, 0.12), 0 8px 24px rgba(15, 23, 42, 0.06);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  background:
    radial-gradient(ellipse 800px 400px at 50% -100px, rgba(29, 58, 110, 0.08), transparent 70%),
    radial-gradient(ellipse 600px 300px at 80% 200px, rgba(200, 168, 81, 0.06), transparent 70%),
    linear-gradient(180deg, #fafbfc 0%, #f1f5f9 100%);
  background-attachment: fixed;
  min-height: 100vh;
  color: var(--slate-900);
  line-height: 1.5;
  padding: 0 16px env(safe-area-inset-bottom, 24px);
}
.topbar {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
  padding: 14px 20px;
  display: flex; align-items: center; justify-content: space-between;
  margin: 0 -16px 0;
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
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.04em;
}
.topbar-brand .wordmark span { color: var(--gold); }
.topbar a.call-link {
  color: rgba(255, 255, 255, 0.92);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  transition: background 0.15s;
}
.topbar a.call-link:hover { background: rgba(255, 255, 255, 0.18); }
.ticker-bar {
  background: linear-gradient(90deg, var(--navy-deep), var(--navy));
  margin: 0 -16px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid rgba(200, 168, 81, 0.2);
}
.ticker-track {
  display: flex; gap: 48px;
  animation: ticker 32s linear infinite;
  padding: 9px 0;
  white-space: nowrap;
  width: max-content;
}
.ticker-item { display: flex; align-items: center; gap: 8px; }
.ticker-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 8px rgba(200, 168, 81, 0.6);
}
.ticker-item strong { color: var(--gold); font-weight: 700; }
@keyframes ticker {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.wrap { max-width: 480px; margin: 0 auto; padding: 18px 0 32px; }
.card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--slate-200);
  margin-bottom: 14px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.card-pad { padding: 22px 20px; }
.card-pad-lg { padding: 28px 22px; }
.hero-card {
  background:
    radial-gradient(circle at 0% 0%, rgba(200, 168, 81, 0.18), transparent 50%),
    radial-gradient(circle at 100% 100%, rgba(232, 92, 36, 0.12), transparent 60%),
    linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
  color: #fff;
  border-color: var(--navy-dark);
  position: relative;
  overflow: hidden;
}
.hero-card::before {
  content: ''; position: absolute;
  top: -40px; right: -40px;
  width: 180px; height: 180px;
  background: radial-gradient(circle, rgba(200, 168, 81, 0.2), transparent 70%);
  border-radius: 50%; pointer-events: none;
}
.hero-greeting {
  font-family: 'Montserrat', sans-serif;
  font-weight: 600; font-size: 13px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--gold); margin-bottom: 8px; position: relative;
}
.hero-name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800; font-size: 28px;
  line-height: 1.15; letter-spacing: -0.02em;
  margin-bottom: 6px; position: relative;
}
.hero-tagline {
  font-size: 14px; color: rgba(255, 255, 255, 0.78);
  margin-bottom: 22px; position: relative;
}
.hero-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px; padding: 16px 0;
  position: relative;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.hero-stat { text-align: center; padding: 0 8px; position: relative; }
.hero-stat + .hero-stat::before {
  content: ''; position: absolute; left: 0; top: 20%; bottom: 20%;
  width: 1px; background: rgba(255, 255, 255, 0.15);
}
.hero-stat-value {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800; font-size: 24px;
  color: #fff; line-height: 1; letter-spacing: -0.02em;
}
.hero-stat-value.gold { color: var(--gold); }
.hero-stat-value.amber { color: #fbbf24; }
.hero-stat-label {
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65); margin-top: 6px;
}
.pending-callout {
  margin-top: 16px; padding: 12px 14px;
  background: rgba(200, 168, 81, 0.15);
  border: 1px solid rgba(200, 168, 81, 0.35);
  border-radius: 10px;
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: rgba(255, 255, 255, 0.92);
  position: relative;
}
.pending-callout-icon {
  width: 28px; height: 28px;
  background: var(--gold); color: var(--navy-deep);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0; font-weight: 800;
}
.pending-callout strong { color: var(--gold); font-weight: 700; }
.reward-headline {
  text-align: center;
  background: linear-gradient(135deg, #fffaf0 0%, var(--gold-soft) 100%);
  border: 1px solid rgba(200, 168, 81, 0.35);
  position: relative; overflow: hidden;
}
.reward-headline::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
}
.reward-amount {
  font-family: 'Montserrat', sans-serif;
  font-weight: 900; font-size: 56px; line-height: 1;
  color: var(--navy); letter-spacing: -0.04em; margin-bottom: 4px;
}
.reward-amount sup {
  font-size: 24px; font-weight: 700;
  vertical-align: top; margin-right: 2px; margin-top: 6px;
  display: inline-block;
}
.reward-amount sub {
  font-size: 18px; font-weight: 700;
  color: var(--slate-500); letter-spacing: 0;
  vertical-align: baseline; margin-left: 2px;
}
.reward-label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 14px;
  color: var(--slate-700);
  text-transform: uppercase; letter-spacing: 0.1em;
}
.reward-sublabel {
  font-size: 12px; color: var(--slate-500); margin-top: 8px;
}
.code-box {
  background: linear-gradient(135deg, var(--slate-50), #f0f7ff);
  border: 1.5px solid #cdd9ee;
  border-radius: 12px; padding: 18px 16px;
  text-align: center; margin-bottom: 18px;
  cursor: pointer; transition: all 0.15s; position: relative;
}
.code-box:hover {
  border-color: var(--navy);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
.code-box:active { transform: translateY(0); }
.code-label {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px; font-weight: 700; color: var(--slate-500);
  letter-spacing: 0.12em; text-transform: uppercase;
  margin-bottom: 8px;
}
.code-value {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 30px; font-weight: 700; color: var(--navy);
  letter-spacing: 0.16em;
}
.code-hint { font-size: 11px; color: var(--slate-500); margin-top: 6px; }
.section-title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 16px;
  color: var(--navy); margin-bottom: 4px; letter-spacing: -0.01em;
}
.section-sub { font-size: 13px; color: var(--slate-500); margin-bottom: 16px; }
.style-chips {
  display: flex; gap: 8px; margin-bottom: 14px;
  overflow-x: auto; padding-bottom: 4px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.style-chips::-webkit-scrollbar { display: none; }
.chip {
  flex-shrink: 0;
  background: #fff;
  border: 1.5px solid var(--slate-200);
  border-radius: 999px; padding: 8px 14px;
  font-size: 13px; font-weight: 600; color: var(--slate-700);
  cursor: pointer; transition: all 0.15s;
  font-family: inherit; scroll-snap-align: start;
  white-space: nowrap;
}
.chip:hover { border-color: var(--navy); color: var(--navy); }
.chip.active { background: var(--navy); border-color: var(--navy); color: #fff; }
.preview {
  background: #f8fafc;
  border-radius: 12px; padding: 16px;
  font-size: 13.5px; color: var(--slate-700);
  line-height: 1.55;
  border: 1px dashed var(--slate-200);
  margin-bottom: 16px; transition: opacity 0.2s;
}
.actions { display: flex; flex-direction: column; gap: 10px; }
.btn {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; width: 100%;
  padding: 16px 20px; border-radius: 12px;
  font-size: 16px; font-weight: 700;
  text-decoration: none; cursor: pointer; border: none;
  font-family: 'Montserrat', sans-serif;
  transition: transform 0.05s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  letter-spacing: -0.01em;
}
.btn:active { transform: scale(0.985); }
.btn-primary {
  background: linear-gradient(180deg, var(--orange) 0%, var(--orange-dark) 100%);
  color: #fff !important;
  box-shadow: 0 4px 14px rgba(232, 92, 36, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.btn-primary:hover { box-shadow: 0 6px 20px rgba(232, 92, 36, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2); }
.btn-secondary {
  background: #fff; color: var(--navy) !important;
  border: 1.5px solid var(--navy);
}
.btn-secondary:hover { background: #f0f7ff; }
.btn-tertiary {
  background: var(--slate-50); color: var(--navy) !important;
  border: 1px solid var(--slate-200);
  font-size: 14px; padding: 13px 18px;
}
.copy-row { display: flex; gap: 0; margin-top: 12px; }
.copy-input {
  flex: 1; min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--slate-200); border-right: none;
  border-radius: 10px 0 0 10px;
  font-size: 12.5px; background: var(--slate-50); color: var(--slate-500);
  outline: none; font-family: 'JetBrains Mono', monospace;
  overflow: hidden; text-overflow: ellipsis;
}
.copy-btn {
  padding: 12px 18px;
  background: var(--navy); color: #fff;
  border: none; border-radius: 0 10px 10px 0;
  font-size: 13px; font-weight: 700; cursor: pointer;
  white-space: nowrap;
  font-family: 'Montserrat', sans-serif;
  transition: background 0.15s;
}
.copy-btn:hover { background: var(--navy-dark); }
.qr-toggle {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 14px 16px;
  background: var(--slate-50);
  border: 1px solid var(--slate-200);
  border-radius: 12px;
  cursor: pointer; margin-top: 12px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600; color: var(--navy); font-size: 14px;
  transition: all 0.15s;
}
.qr-toggle:hover { background: #f0f7ff; border-color: #cdd9ee; }
.qr-toggle .arrow { transition: transform 0.2s; }
.qr-toggle.open .arrow { transform: rotate(180deg); }
.qr-panel {
  max-height: 0; overflow: hidden;
  transition: max-height 0.3s ease;
}
.qr-panel.open { max-height: 400px; }
.qr-inner { text-align: center; padding: 18px 16px 4px; }
.qr-frame {
  display: inline-block; background: #fff;
  padding: 14px; border-radius: 14px;
  border: 1px solid var(--slate-200);
  box-shadow: var(--shadow-md);
}
.qr-frame img { display: block; width: 168px; height: 168px; }
.qr-caption { font-size: 12px; color: var(--slate-500); margin-top: 12px; line-height: 1.5; }
.history-item {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--slate-100);
}
.history-item:last-child { border-bottom: none; padding-bottom: 4px; }
.history-item:first-child { padding-top: 4px; }
.history-avatar {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 14px;
  color: #fff; flex-shrink: 0;
  background: var(--navy);
}
.history-avatar.green { background: var(--green); }
.history-avatar.amber { background: var(--amber); }
.history-avatar.gold  { background: var(--gold); color: var(--navy-deep); }
.history-meta { flex: 1; min-width: 0; }
.history-name { font-size: 14px; font-weight: 600; color: var(--slate-900); }
.history-status { font-size: 12px; color: var(--slate-500); margin-top: 2px; }
.history-amount {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700; font-size: 15px;
  color: var(--green); text-align: right; flex-shrink: 0;
}
.history-amount.pending { color: var(--amber); }
.trust-strip {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 10px; padding: 4px 0 0;
}
.trust-item {
  text-align: center; padding: 8px 4px;
  border-right: 1px solid var(--slate-100);
}
.trust-item:last-child { border-right: none; }
.trust-value {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800; font-size: 18px;
  color: var(--navy); line-height: 1;
}
.trust-label {
  font-size: 10px; color: var(--slate-500);
  text-transform: uppercase; letter-spacing: 0.06em;
  font-weight: 600; margin-top: 4px;
}
.steps { display: flex; flex-direction: column; gap: 14px; }
.step { display: flex; gap: 14px; align-items: flex-start; }
.step-num {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--navy); color: #fff;
  font-family: 'Montserrat', sans-serif;
  font-size: 13px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.step-text strong {
  display: block;
  font-family: 'Montserrat', sans-serif;
  font-size: 14px; color: var(--slate-900); margin-bottom: 2px;
}
.step-text p { font-size: 13px; color: var(--slate-500); line-height: 1.5; }
.footer-strip {
  text-align: center; font-size: 12px; color: var(--slate-500);
  padding: 24px 0 8px; line-height: 1.6;
}
.footer-strip a { color: var(--navy); text-decoration: none; font-weight: 600; }
.toast {
  position: fixed; left: 50%; bottom: 28px;
  transform: translateX(-50%) translateY(20px);
  background: var(--navy-deep); color: #fff;
  padding: 12px 20px; border-radius: 12px;
  font-size: 14px; font-weight: 600;
  font-family: 'Montserrat', sans-serif;
  box-shadow: var(--shadow-xl);
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
  display: flex; align-items: center; gap: 8px;
  z-index: 1000;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.toast .check {
  width: 18px; height: 18px;
  background: var(--green); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #fff;
}
.lookup-card { text-align: center; padding: 36px 24px 30px; }
.lookup-icon {
  width: 96px; height: 96px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--navy), var(--navy-dark));
  object-fit: cover;
  display: block;
  box-shadow: var(--shadow-lg);
}
.lookup-h {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800; font-size: 22px;
  color: var(--navy); margin-bottom: 8px; letter-spacing: -0.01em;
}
.lookup-sub {
  font-size: 14px; color: var(--slate-500);
  margin-bottom: 22px; line-height: 1.5;
}
.lookup-input {
  width: 100%; padding: 14px 16px;
  border: 1.5px solid var(--slate-200);
  border-radius: 12px;
  font-size: 16px; outline: none;
  font-family: inherit;
  text-align: center;
  letter-spacing: 0.02em;
  transition: border-color 0.15s;
  margin-bottom: 12px;
}
.lookup-input:focus { border-color: var(--navy); }
@media (max-width: 380px) {
  .reward-amount { font-size: 48px; }
  .hero-stat-value { font-size: 20px; }
  .hero-name { font-size: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track { animation: none; }
  * { transition: none !important; }
}
`;

module.exports = router;
