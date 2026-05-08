/**
 * GET /share/:code
 * ─────────────────────────────────────────────────────────────
 * Single-tap share page that the Day 8 Chiirp SMS deeplinks to.
 *
 * Goal: customer arrives, sees one big "Text a friend" button (and
 * an Email fallback + Copy fallback for desktop), taps once, the
 * native composer opens with the message pre-filled. Zero copy/paste.
 *
 * Server-rendered HTML, no client framework, mobile-first.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const supabase = require('../db');
const { normalizeCode } = require('../utils/slugs');

const REFERRAL_BASE_URL = process.env.REFERRAL_BASE_URL || 'https://lexperks.com/referral';
const LEX_PHONE = '(972) 466-1917';
const LEX_LOGO  = 'https://www.lexairconditioning.com/wp-content/uploads/2024/11/lex-air-web-transparent_badge-color.png';

async function loadDiscount() {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'new_customer_discount')
    .single();
  const n = parseFloat(data?.value);
  return Number.isFinite(n) ? n : 50;
}

function buildSmsBody({ firstName, code, link, discount }) {
  return `Hey! I use LEX Air for HVAC, plumbing & electrical in DFW — really good. ` +
         `Use my code ${code} to save $${discount} on your first service: ${link}`;
}

function buildEmailSubject({ firstName }) {
  return `${firstName} thinks you'd like LEX Air Conditioning`;
}

function buildEmailBody({ firstName, code, link, discount }) {
  return `Hey,

I've been using LEX Air Conditioning for HVAC, plumbing, and electrical in DFW and they're excellent.

Use my referral link to save $${discount} on your first service:
${link}

Or just give them my referral code: ${code}

LEX has been around since 2004 with thousands of 5-star reviews. Highly recommend.

— ${firstName}`;
}

router.get('/:code', async (req, res) => {
  const rawCode = req.params.code || '';
  const code = normalizeCode(rawCode);

  // ── Look up the customer ──────────────────────────────────
  let customer = null;
  if (code) {
    const { data } = await supabase
      .from('customers')
      .select('id, name, referral_code, referral_link')
      .eq('referral_code', code)
      .single();
    customer = data;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!customer) {
    return res.status(404).send(renderNotFound(rawCode));
  }

  const firstName = (customer.name || '').split(' ')[0] || 'there';
  const link      = customer.referral_link || `${REFERRAL_BASE_URL}?r=${customer.referral_code}`;
  const discount  = await loadDiscount();

  const smsBody      = buildSmsBody({ firstName, code: customer.referral_code, link, discount });
  const emailSubject = buildEmailSubject({ firstName });
  const emailBody    = buildEmailBody({ firstName, code: customer.referral_code, link, discount });

  res.send(renderSharePage({
    firstName,
    code: customer.referral_code,
    link,
    discount,
    smsBody,
    emailSubject,
    emailBody,
  }));
});

function renderSharePage({ firstName, code, link, discount, smsBody, emailSubject, emailBody }) {
  // sms: link — query-string body works on iOS 12+ and modern Android.
  // mailto: similarly.
  const smsHref   = 'sms:?&body=' + encodeURIComponent(smsBody);
  const emailHref = 'mailto:?subject=' + encodeURIComponent(emailSubject) +
                    '&body=' + encodeURIComponent(emailBody);

  // Pre-format strings for inline JS use (they're inside a single-quoted
  // template — escape single quotes and backslashes).
  const jsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const linkJs = jsEscape(link);
  const codeJs = jsEscape(code);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>Share Your LEX Referral</title>
  <link rel="icon" href="${LEX_LOGO}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f1f5f9;
      min-height: 100vh;
      color: #0f172a;
      padding: 0 16px env(safe-area-inset-bottom, 16px);
    }
    .topbar {
      background: #1d3a6e;
      padding: 14px 24px;
      display: flex; align-items: center; justify-content: space-between;
      margin: 0 -16px 16px;
    }
    .topbar img { height: 36px; width: auto; }
    .topbar a { color: rgba(255,255,255,0.85); text-decoration: none; font-size: 14px; font-weight: 500; }
    .wrap { max-width: 480px; margin: 0 auto; padding: 8px 0 32px; }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 28px 22px;
      margin-bottom: 14px;
      border: 1px solid #e2e8f0;
    }
    .hello {
      font-size: 22px; font-weight: 700; color: #1d3a6e;
      text-align: center; margin-bottom: 6px;
    }
    .sub {
      font-size: 14px; color: #64748b;
      text-align: center; margin-bottom: 22px; line-height: 1.5;
    }
    .code-box {
      background: #f0f7ff;
      border: 1.5px solid #bfdbfe;
      border-radius: 12px;
      padding: 18px 16px;
      text-align: center;
      margin-bottom: 24px;
    }
    .code-label {
      font-size: 11px; font-weight: 700; color: #64748b;
      letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px;
    }
    .code-value {
      font-size: 30px; font-weight: 800; color: #1d3a6e;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      letter-spacing: 0.12em;
    }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    .btn {
      display: flex; align-items: center; justify-content: center;
      width: 100%;
      padding: 16px 18px;
      border-radius: 12px;
      font-size: 16px; font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: none;
      font-family: inherit;
      transition: transform 0.05s ease, opacity 0.15s ease;
    }
    .btn:active { transform: scale(0.98); }
    .btn-primary {
      background: #e85c24; color: #fff !important;
    }
    .btn-primary:hover { opacity: 0.92; }
    .btn-secondary {
      background: #fff; color: #1d3a6e !important;
      border: 1.5px solid #1d3a6e;
    }
    .btn-secondary:hover { background: #f0f7ff; }
    .btn .icon { margin-right: 10px; font-size: 18px; line-height: 1; }
    .copy-row {
      display: flex; gap: 8px; margin-top: 16px;
    }
    .copy-input {
      flex: 1; min-width: 0;
      padding: 11px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 10px 0 0 10px;
      font-size: 13px;
      background: #f8fafc;
      color: #475569;
      outline: none;
      font-family: ui-monospace, Menlo, Consolas, monospace;
    }
    .copy-btn {
      padding: 11px 18px;
      background: #1d3a6e; color: #fff;
      border: none; border-radius: 0 10px 10px 0;
      font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
      font-family: inherit;
    }
    .preview {
      background: #f8fafc;
      border-radius: 10px;
      padding: 14px 16px;
      margin-top: 8px;
      font-size: 13px; color: #475569;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .preview-label {
      font-size: 11px; font-weight: 700; color: #94a3b8;
      letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;
    }
    .footer {
      text-align: center; font-size: 12px; color: #94a3b8;
      padding: 16px 0;
    }
    .footer a { color: #1d3a6e; text-decoration: none; }
    .toast {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
      background: #1d3a6e; color: #fff;
      padding: 12px 18px; border-radius: 10px;
      font-size: 14px; font-weight: 500;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="topbar">
    <a href="https://lexairconditioning.com" aria-label="LEX Air Conditioning">
      <img src="${LEX_LOGO}" alt="LEX Air Conditioning" />
    </a>
    <a href="tel:9724661917">📞 ${LEX_PHONE}</a>
  </div>

  <div class="wrap">
    <div class="card">
      <div class="hello">Hey ${firstName}, share your perks!</div>
      <p class="sub">
        Friends save <strong>$${discount}</strong> on their first LEX service. You earn
        cash back on every qualified job. Pick one and we'll fill in the message for you.
      </p>

      <div class="code-box">
        <div class="code-label">Your Referral Code</div>
        <div class="code-value">${code}</div>
      </div>

      <div class="actions">
        <a class="btn btn-primary" href="${smsHref}">
          <span class="icon">💬</span> Text a friend
        </a>
        <a class="btn btn-secondary" href="${emailHref}">
          <span class="icon">✉️</span> Send by email
        </a>
      </div>

      <div class="copy-row">
        <input type="text" class="copy-input" id="lex-link" value="${link}" readonly />
        <button class="copy-btn" type="button" onclick="copyLink()">Copy link</button>
      </div>
    </div>

    <div class="card">
      <div class="preview-label">Preview — what your friend sees</div>
      <div class="preview" id="sms-preview">${escapeHtml(smsBody)}</div>
    </div>

    <p class="footer">
      Questions? Call <a href="tel:9724661917">${LEX_PHONE}</a> · LEX Air Conditioning, serving DFW since 2004
    </p>
  </div>

  <div class="toast" id="toast">Copied!</div>

  <script>
    function copyLink() {
      var input = document.getElementById('lex-link');
      var text  = input.value;
      var done = function() { showToast('Link copied'); };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallbackCopy);
      } else {
        fallbackCopy();
      }

      function fallbackCopy() {
        input.removeAttribute('readonly');
        input.select();
        input.setSelectionRange(0, 9999);
        try { document.execCommand('copy'); done(); } catch (e) {}
        input.setAttribute('readonly', 'readonly');
        input.blur();
      }
    }

    function showToast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(function() { t.classList.remove('show'); }, 1600);
    }

    // Long-press the code box to copy the code itself (touch convenience)
    (function() {
      var box = document.querySelector('.code-value');
      if (!box) return;
      box.addEventListener('click', function() {
        var code = '${codeJs}';
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(code).then(function() { showToast('Code copied: ' + code); });
        }
      });
      box.style.cursor = 'pointer';
      box.title = 'Tap to copy code';
    })();
  </script>
</body>
</html>`;
}

function renderNotFound(rawCode) {
  const safe = escapeHtml(String(rawCode || '').slice(0, 20));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>Code not recognized — LEX Air</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f1f5f9; min-height: 100vh; margin: 0;
           display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; max-width: 420px; width: 100%;
            padding: 32px 24px; border-radius: 16px;
            border: 1px solid #e2e8f0; text-align: center; }
    h1 { font-size: 20px; color: #1d3a6e; margin-bottom: 10px; }
    p  { font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 18px; }
    a.btn { display: inline-block; padding: 12px 22px;
            background: #1d3a6e; color: #fff; text-decoration: none;
            border-radius: 10px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>That code isn't recognized</h1>
    <p>We couldn't find a referral code matching <strong>${safe || '—'}</strong>.
       Double-check the link from your text, or call us and we'll get you sorted.</p>
    <a class="btn" href="tel:9724661917">📞 Call ${LEX_PHONE}</a>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;
