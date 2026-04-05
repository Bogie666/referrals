/**
 * GET /book
 * ─────────────────────────────────────────────────────────────
 * Serves a full-page booking experience that embeds the
 * LEX scheduler widget. Reads the ?r= referral slug from the
 * URL and passes it into the widget config so it's captured
 * on booking submission.
 *
 * Used when a friend clicks a referral link and hits Book Online:
 *   lexperks.com/referral?r=sarah-m-4f2a
 *              ↓ clicks Book Online
 *   lexperks.com/book?r=sarah-m-4f2a
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();

const SCHEDULER_URL = process.env.SCHEDULER_URL || 'https://scheduler-mu-three.vercel.app';
const BOOKING_API   = process.env.SCHEDULER_BOOKING_API || `${SCHEDULER_URL}/api/lex-booking`;

router.get('/', (req, res) => {
  // Referral slug from URL — e.g. ?r=sarah-m-4f2a
  const slug         = req.query.r || '';
  const referralCode = req.query.code || ''; // also support ?code=SARAH-1917

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Book a Service — LEX Air Conditioning</title>
  <meta name="description" content="Schedule HVAC, plumbing, or electrical service with LEX Air Conditioning in DFW." />
  <link rel="icon" href="https://www.lexairconditioning.com/wp-content/uploads/2024/11/lex-air-web-transparent_badge-color.png" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f1f5f9;
      min-height: 100vh;
    }

    /* ── Top bar ── */
    .top-bar {
      background: #1d3a6e;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .top-bar img {
      height: 40px;
      width: auto;
    }
    .top-bar a {
      color: rgba(255,255,255,0.85);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
    }
    .top-bar a:hover { color: #fff; }

    /* ── Referral banner (shown when code is present) ── */
    .referral-banner {
      background: #d1fae5;
      border-bottom: 1px solid #86efac;
      padding: 12px 24px;
      text-align: center;
      font-size: 14px;
      color: #065f46;
      font-weight: 500;
    }
    .referral-banner strong { font-weight: 700; }

    /* ── Main content ── */
    .main {
      max-width: 680px;
      margin: 0 auto;
      padding: 32px 16px 60px;
    }

    .page-title {
      text-align: center;
      margin-bottom: 28px;
    }
    .page-title h1 {
      font-size: 26px;
      font-weight: 700;
      color: #1d3a6e;
      margin-bottom: 6px;
    }
    .page-title p {
      font-size: 15px;
      color: #64748b;
    }

    /* ── Widget container ── */
    #lex-scheduler-container {
      background: #fff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }

    /* ── Footer ── */
    .page-footer {
      text-align: center;
      padding: 24px 0 0;
      font-size: 13px;
      color: #94a3b8;
    }
    .page-footer a { color: #1d3a6e; text-decoration: none; }
    .page-footer a:hover { text-decoration: underline; }

  </style>
</head>
<body>

  <!-- Top bar -->
  <div class="top-bar">
    <a href="https://lexairconditioning.com">
      <img src="https://www.lexairconditioning.com/wp-content/uploads/2024/11/lex-air-web-transparent_badge-color.png"
           alt="LEX Air Conditioning" />
    </a>
    <a href="tel:9724661917">📞 (972) 466-1917</a>
  </div>

  <!-- Referral banner -->
  ${slug || referralCode ? `
  <div class="referral-banner">
    🎁 <strong>Referral applied!</strong> Your friend's discount will be reflected on your service.
  </div>
  ` : ''}

  <!-- Main -->
  <div class="main">
    <div class="page-title">
      <h1>Schedule Your Service</h1>
      <p>HVAC · Plumbing · Electrical · Serving DFW since 2004</p>
    </div>

    <div class="page-footer">
      <p>
        Need immediate help? Call <a href="tel:9724661917">(972) 466-1917</a>
        &nbsp;·&nbsp;
        <a href="https://lexperks.com">Back to LEX Perks</a>
      </p>
    </div>
  </div>

  <script>
    window.LEXSchedulerConfig = {
      apiEndpoint: '${BOOKING_API}',
      autoButton:  false,
      ${slug ? `referralSlug: '${slug}',` : ''}
      ${referralCode ? `referralCode: '${referralCode.toUpperCase()}',` : ''}
    };

    window.addEventListener('load', function() {
      setTimeout(function() {
        if (window.LEXScheduler && window.LEXScheduler.open) {
          LEXScheduler.open();
        }
      }, 300);
    });
  </script>
  <link rel="stylesheet" href="` + SCHEDULER_URL + `/lex-scheduler.css" />
  <script src="` + SCHEDULER_URL + `/lex-scheduler.iife.js"></script>

</body>
</html>`);
});

module.exports = router;
