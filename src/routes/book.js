const express = require('express');
const router  = express.Router();

const SCHEDULER_CSS = 'https://scheduler-mu-three.vercel.app/lex-scheduler.css';
const SCHEDULER_JS  = 'https://scheduler-mu-three.vercel.app/lex-scheduler.iife.js';
const BOOKING_API   = 'https://scheduler-mu-three.vercel.app/api/lex-booking';

router.get('/', (req, res) => {
  const slug         = req.query.r     ? String(req.query.r).trim()                  : '';
  const referralCode = req.query.code  ? String(req.query.code).trim().toUpperCase() : '';
  const showBanner   = slug || referralCode;

  const banner = showBanner
    ? '<div class="referral-banner">&#127873; <strong>Referral applied!</strong> Your discount will be reflected on your service.</div>'
    : '';

  const html = '<!DOCTYPE html>\n'
    + '<html lang="en">\n'
    + '<head>\n'
    + '  <meta charset="UTF-8" />\n'
    + '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
    + '  <title>Book a Service — LEX Air Conditioning</title>\n'
    + '  <link rel="icon" href="https://www.lexairconditioning.com/wp-content/uploads/2024/11/lex-air-web-transparent_badge-color.png" />\n'
    + '  <link rel="stylesheet" href="' + SCHEDULER_CSS + '" />\n'
    + '  <style>\n'
    + '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n'
    + '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f1f5f9; min-height: 100vh; }\n'
    + '    .top-bar { background: #1d3a6e; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }\n'
    + '    .top-bar img { height: 40px; width: auto; }\n'
    + '    .top-bar a { color: rgba(255,255,255,0.85); text-decoration: none; font-size: 14px; font-weight: 500; }\n'
    + '    .referral-banner { background: #d1fae5; border-bottom: 1px solid #86efac; padding: 12px 24px; text-align: center; font-size: 14px; color: #065f46; font-weight: 500; }\n'
    + '    .page-footer { text-align: center; padding: 32px 16px; font-size: 13px; color: #94a3b8; }\n'
    + '    .page-footer a { color: #1d3a6e; text-decoration: none; }\n'
    + '  </style>\n'
    + '</head>\n'
    + '<body>\n'
    + '  <div class="top-bar">\n'
    + '    <a href="https://lexairconditioning.com">\n'
    + '      <img src="https://www.lexairconditioning.com/wp-content/uploads/2024/11/lex-air-web-transparent_badge-color.png" alt="LEX Air Conditioning" />\n'
    + '    </a>\n'
    + '    <a href="tel:9724661917">&#128222; (972) 466-1917</a>\n'
    + '  </div>\n'
    + '  ' + banner + '\n'
    + '  <div class="page-footer">\n'
    + '    <p>Need immediate help? Call <a href="tel:9724661917">(972) 466-1917</a> &nbsp;&middot;&nbsp; <a href="https://lexperks.com">Back to LEX Perks</a></p>\n'
    + '  </div>\n'
    + '  <script>\n'
    + '    window.LEXSchedulerConfig = {\n'
    + '      apiEndpoint: "https://scheduler-mu-three.vercel.app/api/lex-booking",\n'
    + '      autoButton: true,\n'
    + '      buttonText: "Book Now",\n'
    + '      position: "bottom-right",\n'
    + '      referralSlug: "' + slug + '",\n'
    + '      referralCode: "' + referralCode + '"\n'
    + '    };\n'
    + '\n'
    + '    window.addEventListener("load", function() {\n'
    + '      setTimeout(function() {\n'
    + '        var btn = document.querySelector(".lex-book-trigger");\n'
    + '        if (btn) { btn.click(); return; }\n'
    + '        if (window.LEXScheduler) {\n'
    + '          if (window.LEXScheduler.open) window.LEXScheduler.open();\n'
    + '          else if (window.LEXScheduler.toggle) window.LEXScheduler.toggle();\n'
    + '        }\n'
    + '      }, 800);\n'
    + '    });\n'
    + '  </script>\n'
    + '  <script src="' + SCHEDULER_JS + '"></script>\n'
    + '</body>\n'
    + '</html>';

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;
