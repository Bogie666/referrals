<?php
/**
 * Plugin Name: LEX Perks Referral
 * Description: Referral landing page and customer portal for LEX Air Conditioning.
 *              Two shortcodes in one plugin:
 *                [lex_referral]        — friend-facing landing page (use on /referral page)
 *                [lex_referral_portal] — customer portal to view stats & share link (use on /my-referrals page)
 * Version: 2.0.0
 * Author: LEX Air Conditioning
 *
 * ──────────────────────────────────────────────────────────────
 * INSTALLATION:
 * 1. Upload this file to /wp-content/plugins/lex-perks/lex-perks.php
 * 2. Activate in WordPress → Plugins
 * 3. Create two WordPress pages:
 *      Page 1 — Title: "Referral"    | Slug: referral    | Content: [lex_referral]
 *      Page 2 — Title: "My Referrals"| Slug: my-referrals| Content: [lex_referral_portal]
 * 4. Update LEX_API_URL below to your Vercel app URL
 * ──────────────────────────────────────────────────────────────
 */

if (!defined('ABSPATH')) exit;

// ── Config ────────────────────────────────────────────────────
// Your Vercel referral app URL — no trailing slash
define('LEX_API_URL',    'https://referrals-kappa.vercel.app');

// Your referral domain
define('LEX_PERKS_URL',  'https://lexperks.com');

// Default payout structure — overridden by API response when available.
// (Edit live values in the admin dashboard at /admin/settings; these are
// just fallbacks for when the API is unreachable.)
define('LEX_PAYOUT_PCT', 5);
define('LEX_PAYOUT_CAP', 250);
define('LEX_DISCOUNT',   50);
define('LEX_MIN_JOB',    150);

// ── Register both shortcodes ──────────────────────────────────
add_shortcode('lex_referral',        'lex_referral_shortcode');
add_shortcode('lex_referral_portal', 'lex_referral_portal_shortcode');


// ════════════════════════════════════════════════════════════════
// SHORTCODE 1: [lex_referral]
// Friend-facing landing page. Shown when someone clicks a
// referral link. Reads ?r=slug from the URL.
// ════════════════════════════════════════════════════════════════
function lex_referral_shortcode() {
    ob_start();
    ?>
    <div id="lex-referral-widget">

      <!-- Loading -->
      <div id="lex-ref-loading" style="text-align:center;padding:40px;">
        <p style="color:#64748b;">Loading your referral info...</p>
      </div>

      <!-- Invalid / no slug -->
      <div id="lex-ref-invalid" style="display:none; text-align:center; padding:40px;">
        <div style="font-size:40px; margin-bottom:16px;">🔍</div>
        <h2 style="color:#1d3a6e;">Referral Link Not Found</h2>
        <p style="color:#64748b; margin-bottom:24px;">
          This link may be invalid or expired.
          Give us a call and we'll get you set up!
        </p>
        <a href="tel:9724661917" style="
          display:inline-block; background:#e85c24; color:#fff;
          padding:14px 32px; border-radius:10px; text-decoration:none;
          font-size:16px; font-weight:600;
        ">Call (972) 466-1917</a>
      </div>

      <!-- Main referral card -->
      <div id="lex-ref-card" style="display:none;">

        <div class="lex-ref-header">
          <h1 id="lex-ref-headline">Welcome to LEX</h1>
          <p id="lex-ref-subline"></p>
        </div>

        <div class="lex-ref-rewards lex-ref-rewards-single">
          <div class="lex-ref-reward-box">
            <div class="lex-ref-reward-amount" id="lex-discount-amount">$<?php echo LEX_DISCOUNT; ?></div>
            <div class="lex-ref-reward-label">OFF your first service</div>
          </div>
        </div>

        <p style="text-align:center; font-size:15px; color:#64748b; margin:0 0 28px;">
          Schedule your first HVAC, plumbing, or electrical service to claim your discount.
        </p>

        <div style="text-align:center; margin-bottom:16px;">
          <button onclick="if(typeof LEXScheduler!=='undefined'){LEXScheduler.open();}else{window.location.href='tel:9724661917';}" class="lex-ref-btn-primary">
            📅 Book Online
          </button>
        </div>
        <div style="text-align:center; margin-bottom:24px;">
          <a href="tel:9724661917" class="lex-ref-btn-secondary">
            📞 Or Call: (972) 466-1917
          </a>
        </div>



        <p style="text-align:center; font-size:12px; color:#94a3b8; margin-top:28px; line-height:1.5;">
          Discount applied to your first qualifying service over $350.
          One discount per household. LEX Air Conditioning — Serving DFW since 2004.
        </p>

      </div><!-- /lex-ref-card -->

    </div><!-- /lex-referral-widget -->

    <style>
      #lex-referral-widget {
        max-width: 600px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .lex-ref-header {
        text-align: center;
        padding: 32px 16px 24px;
      }
      .lex-ref-header h1 {
        font-size: 26px;
        color: #1d3a6e;
        margin: 0 0 8px;
        line-height: 1.2;
      }
      .lex-ref-header p {
        font-size: 16px;
        color: #64748b;
        margin: 0;
      }
      .lex-ref-rewards {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background: #f0f7ff;
        border-radius: 14px;
        padding: 28px 24px;
        margin: 0 0 24px;
      }
      .lex-ref-rewards-single { padding: 36px 24px; }
      .lex-ref-rewards-single .lex-ref-reward-amount { font-size: 64px; }
      .lex-ref-rewards-single .lex-ref-reward-label  { font-size: 15px; }
      .lex-ref-reward-box { text-align: center; flex: 1; }
      .lex-ref-reward-amount {
        font-size: 48px;
        font-weight: 700;
        color: #1d3a6e;
        line-height: 1;
      }
      .lex-ref-reward-label { font-size: 13px; color: #64748b; margin-top: 6px; }
      .lex-ref-btn-primary {
        display: inline-block;
        background: #e85c24;
        color: #fff !important;
        padding: 16px 36px;
        border-radius: 10px;
        text-decoration: none !important;
        font-size: 17px;
        font-weight: 600;
        transition: background 0.2s;
      }
      .lex-ref-btn-primary:hover { background: #c94e1e; }
      .lex-ref-btn-secondary {
        display: inline-block;
        color: #1d3a6e !important;
        border: 2px solid #1d3a6e;
        padding: 11px 24px;
        border-radius: 8px;
        text-decoration: none !important;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
      }
      .lex-ref-btn-secondary:hover { background: #f0f7ff; }
      .lex-ref-link-row { display: flex; }
      .lex-ref-link-row input {
        flex: 1;
        padding: 12px 14px;
        border: 1.5px solid #e2e8f0;
        border-right: none;
        border-radius: 8px 0 0 8px;
        font-size: 13px;
        background: #f8fafc;
        color: #64748b;
        outline: none;
      }
      .lex-ref-link-row button {
        padding: 12px 20px;
        background: #1d3a6e;
        color: #fff;
        border: none;
        border-radius: 0 8px 8px 0;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        transition: background 0.2s;
      }
      .lex-ref-link-row button:hover { background: #162d57; }
      @media (max-width: 480px) {
        .lex-ref-rewards { flex-direction: column; gap: 12px; }
        .lex-ref-reward-amount { font-size: 40px; }
        .lex-ref-rewards-single .lex-ref-reward-amount { font-size: 56px; }
      }
    </style>

    <script>
    (function() {
      const params   = new URLSearchParams(window.location.search);
      const slug     = params.get('r');
      const API      = '<?php echo LEX_API_URL; ?>';
      const DISCOUNT = <?php echo LEX_DISCOUNT; ?>;

      // Track the click
      if (slug) {
        fetch(API + '/api/referral/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        }).catch(() => {});
      }

      function buildSubline(discount) {
        return 'Enjoy $' + discount + ' off your first service with us, whether it\'s HVAC, plumbing, or electrical. ' +
               'Over 2,200 five-star reviews, serving DFW since 2004.';
      }

      async function init() {
        // No slug — show generic page
        if (!slug) {
          document.getElementById('lex-ref-loading').style.display = 'none';
          document.getElementById('lex-ref-headline').textContent  = 'Welcome to LEX';
          document.getElementById('lex-ref-subline').textContent   = buildSubline(DISCOUNT);
          document.getElementById('lex-ref-card').style.display    = 'block';
          return;
        }

        try {
          const res = await fetch(API + '/api/referral/' + encodeURIComponent(slug));
          const data = await res.json();

          if (!res.ok || data.error) throw new Error(data.error || 'not found');

          const firstName = data.referrerFirstName || data.name || 'A friend';
          const discount  = data.discount != null ? data.discount : DISCOUNT;

          document.getElementById('lex-ref-headline').textContent   = firstName + ' thought you\'d like LEX';
          document.getElementById('lex-ref-subline').textContent    = buildSubline(discount);
          document.getElementById('lex-discount-amount').textContent = '$' + discount;

          // Share tools removed — link exists for reference only
          const link = data.referralLink || data.referral_link || '';

          document.getElementById('lex-ref-loading').style.display = 'none';
          document.getElementById('lex-ref-card').style.display    = 'block';

        } catch (e) {
          console.error('[LEX Referral] Error:', e.message);
          document.getElementById('lex-ref-loading').style.display  = 'none';
          document.getElementById('lex-ref-invalid').style.display  = 'block';
        }
      }

      init();
    })();

    function lexCopyLink() {
      const input = document.getElementById('lex-ref-link-input');
      input.select();
      input.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(input.value).catch(() => document.execCommand('copy'));
      const btn = document.getElementById('lex-copy-btn');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    }
    </script>
    <?php
    return ob_get_clean();
}


// ════════════════════════════════════════════════════════════════
// SHORTCODE 2: [lex_referral_portal]
// Customer-facing portal. Customers enter their phone number
// to look up their referral link, stats, and history.
// ════════════════════════════════════════════════════════════════
function lex_referral_portal_shortcode() {
    ob_start();
    ?>
    <div id="lex-portal-root">

      <!-- Screen 1: Phone lookup -->
      <div id="lex-portal-lookup" class="lex-portal-screen active">
        <div class="lex-portal-card">
          <div class="lex-portal-icon">❄️</div>
          <h2>Check Your Referral Status</h2>
          <p class="lex-portal-sub">Enter the phone number on your LEX account to view your referral link and rewards.</p>
          <div class="lex-portal-field">
            <label for="lex-portal-phone">Your Phone Number</label>
            <input type="tel" id="lex-portal-phone" placeholder="(972) 555-0100" maxlength="14" autocomplete="tel" />
            <div id="lex-portal-phone-error" class="lex-portal-error" style="display:none;"></div>
          </div>
          <button class="lex-portal-btn-primary" id="lex-portal-lookup-btn" onclick="lexPortalLookup()">
            Find My Account
          </button>
          <p class="lex-portal-fine">
            Not a LEX customer yet? <a href="tel:9724661917">(972) 466-1917</a> — we'd love to help!
          </p>
        </div>
      </div>

      <!-- Screen 2: Loading -->
      <div id="lex-portal-loading" class="lex-portal-screen">
        <div class="lex-portal-card" style="text-align:center; padding:60px 24px;">
          <div class="lex-portal-spinner"></div>
          <p style="margin-top:20px; color:var(--lp-muted);">Looking up your account...</p>
        </div>
      </div>

      <!-- Screen 3: Not found -->
      <div id="lex-portal-notfound" class="lex-portal-screen">
        <div class="lex-portal-card" style="text-align:center;">
          <div class="lex-portal-icon">🔍</div>
          <h2 id="lex-notfound-title">Account Not Found</h2>
          <p class="lex-portal-sub" id="lex-notfound-message">
            We couldn't find an account with that number. Make sure you're using
            the number on file with LEX, or give us a call.
          </p>
          <a href="tel:9724661917" class="lex-portal-btn-primary">Call (972) 466-1917</a>
          <button class="lex-portal-btn-secondary" onclick="lexPortalReset()" style="margin-top:12px;">
            Try a Different Number
          </button>
        </div>
      </div>

      <!-- Screen 4: No link yet -->
      <div id="lex-portal-nolink" class="lex-portal-screen">
        <div class="lex-portal-card" style="text-align:center;">
          <div class="lex-portal-icon">⏳</div>
          <h2 id="lex-nolink-title">Almost Ready!</h2>
          <p class="lex-portal-sub" id="lex-nolink-message">
            Your referral link is generated automatically after your first completed service.
          </p>
          <p class="lex-portal-sub" style="margin-top:12px;">
            Questions? Call <a href="tel:9724661917">(972) 466-1917</a>.
          </p>
          <button class="lex-portal-btn-secondary" onclick="lexPortalReset()" style="margin-top:20px;">← Back</button>
        </div>
      </div>

      <!-- Screen 5: Portal -->
      <div id="lex-portal-main" class="lex-portal-screen">

        <!-- Header / stats -->
        <div class="lex-portal-card lex-portal-header-card">
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
            <div class="lex-portal-avatar" id="lex-portal-avatar"></div>
            <div>
              <h2 id="lex-portal-name" style="margin:0; font-size:20px;"></h2>
              <p style="margin:2px 0 0; color:var(--lp-muted); font-size:13px;">LEX Perks Member</p>
            </div>
          </div>
          <div class="lex-portal-stats-row">
            <div class="lex-portal-stat">
              <div class="lex-portal-stat-value" id="lex-portal-total-referrals">0</div>
              <div class="lex-portal-stat-label">Referrals</div>
            </div>
            <div class="lex-portal-stat-divider"></div>
            <div class="lex-portal-stat">
              <div class="lex-portal-stat-value" style="color:var(--lp-green);" id="lex-portal-total-rewards">$0</div>
              <div class="lex-portal-stat-label">Rewards Earned</div>
            </div>
            <div class="lex-portal-stat-divider"></div>
            <div class="lex-portal-stat">
              <div class="lex-portal-stat-value" style="color:var(--lp-orange);" id="lex-portal-pending-count">0</div>
              <div class="lex-portal-stat-label">In Progress</div>
            </div>
          </div>
        </div>

        <!-- Referral link -->
        <div class="lex-portal-card">
          <h3 class="lex-portal-section-title">Your Referral Link</h3>
          <p style="font-size:14px; color:var(--lp-muted); margin-bottom:16px;">
            Know someone who needs HVAC, plumbing, or electrical help? Share your code.
            They'll save <strong id="lex-discount-amount-display">$<?php echo LEX_DISCOUNT; ?></strong> on their first service,
            and you'll earn <strong id="lex-reward-amount-display"><?php echo LEX_PAYOUT_PCT; ?>%</strong>
            of what they spend back (up to $<span id="lex-reward-cap-display"><?php echo LEX_PAYOUT_CAP; ?></span>).
          </p>

          <!-- Your short code -->
          <div id="lex-portal-code-row" style="display:none; margin-bottom:16px;">
            <div style="font-size:12px; font-weight:600; color:var(--lp-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">Your Referral Code</div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div id="lex-portal-code-display" style="
                font-size:22px; font-weight:700; font-family:monospace;
                color:var(--lp-navy); letter-spacing:0.08em;
                background:#f0f7ff; padding:10px 18px; border-radius:8px; border:1.5px solid #bfdbfe;
              "></div>
              <button onclick="lexPortalCopyCode()" id="lex-copy-code-btn" style="
                padding:10px 16px; background:var(--lp-navy); color:#fff;
                border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;
              ">Copy Code</button>
            </div>
            <p style="font-size:12px; color:var(--lp-muted); margin:6px 0 0;">
              Give this code to friends who call us directly.
            </p>
          </div>

          <div class="lex-portal-link-row">
            <input type="text" id="lex-portal-link-input" readonly />
            <button onclick="lexPortalCopyLink()" id="lex-copy-btn">Copy Link</button>
          </div>

          <div class="lex-portal-share-buttons">
            <a id="lex-portal-sms-btn" href="#" class="lex-portal-share-btn lex-share-sms">💬 Text a Friend</a>
            <a id="lex-portal-email-btn" href="#" class="lex-portal-share-btn lex-share-email">✉️ Send Email</a>
            <button onclick="lexPortalNativeShare()" id="lex-portal-native-share"
                    class="lex-portal-share-btn lex-share-more" style="display:none;">↑ More</button>
          </div>
        </div>

        <!-- How it works -->
        <div class="lex-portal-card">
          <h3 class="lex-portal-section-title">How It Works</h3>
          <div class="lex-portal-steps">
            <div class="lex-portal-step">
              <div class="lex-portal-step-num">1</div>
              <div>
                <strong>Share your link or code</strong>
                <p>Send your link or give your code to anyone needing HVAC, plumbing, or electrical work in DFW.</p>
              </div>
            </div>
            <div class="lex-portal-step">
              <div class="lex-portal-step-num">2</div>
              <div>
                <strong>They book & complete service</strong>
                <p>Your friend uses LEX and completes their first qualifying service (minimum $<span id="lex-step-min"><?php echo LEX_MIN_JOB; ?></span> job).</p>
              </div>
            </div>
            <div class="lex-portal-step">
              <div class="lex-portal-step-num">3</div>
              <div>
                <strong>You both get rewarded</strong>
                <p>You earn <span id="lex-step-reward"><?php echo LEX_PAYOUT_PCT; ?>%</span>
                   of their invoice back as a gift card (up to $<span id="lex-step-cap"><?php echo LEX_PAYOUT_CAP; ?></span>).
                   Your friend saves <span id="lex-step-discount">$<?php echo LEX_DISCOUNT; ?></span> on their service.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Referral history -->
        <div class="lex-portal-card" id="lex-portal-history-card">
          <h3 class="lex-portal-section-title">Your Referrals</h3>
          <div id="lex-portal-referral-list"></div>
        </div>

        <div style="text-align:center; padding:8px 0 24px;">
          <button class="lex-portal-btn-link" onclick="lexPortalReset()">Sign out</button>
        </div>

      </div><!-- /lex-portal-main -->

    </div><!-- /lex-portal-root -->

    <style>
      :root {
        --lp-navy:   #1d3a6e;
        --lp-orange: #e85c24;
        --lp-green:  #10b981;
        --lp-muted:  #64748b;
        --lp-border: #e2e8f0;
        --lp-bg:     #f1f5f9;
      }
      #lex-portal-root {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        max-width: 560px;
        margin: 0 auto;
        padding: 0 4px;
      }
      .lex-portal-screen { display: none; }
      .lex-portal-screen.active { display: block; }
      .lex-portal-card {
        background: #fff;
        border-radius: 16px;
        padding: 28px 24px;
        margin-bottom: 16px;
        border: 1px solid var(--lp-border);
      }
      .lex-portal-card h2 {
        font-size: 22px; font-weight: 700; color: var(--lp-navy);
        text-align: center; margin: 0 0 10px;
      }
      .lex-portal-icon { font-size: 40px; text-align: center; margin-bottom: 12px; }
      .lex-portal-sub  { text-align: center; color: var(--lp-muted); font-size: 14px; line-height: 1.5; margin: 0 0 24px; }
      .lex-portal-field { margin-bottom: 20px; }
      .lex-portal-field label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
      .lex-portal-field input {
        width: 100%; padding: 13px 16px; border: 1.5px solid var(--lp-border);
        border-radius: 10px; font-size: 16px; outline: none; box-sizing: border-box; transition: border 0.2s;
      }
      .lex-portal-field input:focus { border-color: var(--lp-navy); }
      .lex-portal-error { font-size: 13px; color: #dc2626; margin-top: 6px; }
      .lex-portal-btn-primary {
        display: block; width: 100%; padding: 14px; background: var(--lp-navy); color: #fff;
        border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer;
        text-align: center; text-decoration: none; box-sizing: border-box; transition: background 0.2s;
      }
      .lex-portal-btn-primary:hover { background: #162d57; color: #fff !important; }
      .lex-portal-btn-secondary {
        display: block; width: 100%; padding: 12px; background: transparent; color: var(--lp-navy);
        border: 1.5px solid var(--lp-navy); border-radius: 10px; font-size: 15px; font-weight: 500;
        cursor: pointer; box-sizing: border-box; transition: background 0.2s;
      }
      .lex-portal-btn-secondary:hover { background: #f0f7ff; }
      .lex-portal-btn-link {
        background: none; border: none; color: var(--lp-muted); font-size: 13px;
        cursor: pointer; text-decoration: underline; padding: 0;
      }
      .lex-portal-fine { font-size: 12px; color: var(--lp-muted); text-align: center; margin-top: 16px; }
      .lex-portal-fine a { color: var(--lp-navy); }
      .lex-portal-avatar {
        width: 48px; height: 48px; border-radius: 50%; background: var(--lp-navy);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; color: #fff; font-weight: 700; flex-shrink: 0;
      }
      .lex-portal-stats-row {
        display: flex; align-items: center; background: var(--lp-bg);
        border-radius: 12px; padding: 16px; gap: 0;
      }
      .lex-portal-stat { flex: 1; text-align: center; }
      .lex-portal-stat-value { font-size: 26px; font-weight: 700; color: var(--lp-navy); line-height: 1; }
      .lex-portal-stat-label { font-size: 12px; color: var(--lp-muted); margin-top: 4px; }
      .lex-portal-stat-divider { width: 1px; height: 36px; background: var(--lp-border); }
      .lex-portal-link-row { display: flex; margin-bottom: 16px; }
      .lex-portal-link-row input {
        flex: 1; padding: 11px 14px; border: 1.5px solid var(--lp-border); border-right: none;
        border-radius: 10px 0 0 10px; font-size: 13px; background: #f8fafc; outline: none; color: var(--lp-muted);
      }
      .lex-portal-link-row button {
        padding: 11px 20px; background: var(--lp-navy); color: #fff; border: none;
        border-radius: 0 10px 10px 0; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
      }
      .lex-portal-share-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
      .lex-portal-share-btn {
        flex: 1; min-width: 120px; padding: 10px 12px; border-radius: 8px;
        font-size: 13px; font-weight: 500; text-align: center; text-decoration: none !important;
        cursor: pointer; border: 1.5px solid var(--lp-border); background: #fff;
        color: var(--lp-navy) !important; box-sizing: border-box; transition: background 0.15s;
      }
      .lex-portal-share-btn:hover { background: #f0f7ff; }
      .lex-share-sms { background: #f0fdf4 !important; border-color: #86efac !important; color: #166534 !important; }
      .lex-portal-section-title {
        font-size: 15px; font-weight: 700; color: var(--lp-navy);
        margin: 0 0 16px; padding-bottom: 12px; border-bottom: 1px solid var(--lp-border);
      }
      .lex-portal-steps { display: flex; flex-direction: column; gap: 16px; }
      .lex-portal-step { display: flex; gap: 14px; align-items: flex-start; }
      .lex-portal-step-num {
        width: 28px; height: 28px; border-radius: 50%; background: var(--lp-navy);
        color: #fff; font-size: 13px; font-weight: 700; display: flex;
        align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
      }
      .lex-portal-step strong { display: block; font-size: 14px; margin-bottom: 3px; }
      .lex-portal-step p { font-size: 13px; color: var(--lp-muted); margin: 0; line-height: 1.4; }
      .lex-portal-referral-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 0; border-bottom: 1px solid var(--lp-border); gap: 12px;
      }
      .lex-portal-referral-item:last-child { border-bottom: none; padding-bottom: 0; }
      .lex-portal-ref-name  { font-size: 14px; font-weight: 500; }
      .lex-portal-ref-date  { font-size: 12px; color: var(--lp-muted); margin-top: 2px; }
      .lex-portal-ref-badge {
        font-size: 12px; font-weight: 600; padding: 3px 10px;
        border-radius: 20px; white-space: nowrap;
      }
      .badge-rewarded  { background: #d1fae5; color: #065f46; }
      .badge-booked    { background: #dbeafe; color: #1e40af; }
      .badge-pending   { background: #fef3c7; color: #92400e; }
      .badge-completed { background: #ede9fe; color: #5b21b6; }
      .badge-rejected  { background: #fee2e2; color: #991b1b; }
      .lex-portal-spinner {
        width: 40px; height: 40px; border: 3px solid var(--lp-border);
        border-top-color: var(--lp-navy); border-radius: 50%;
        animation: lp-spin 0.7s linear infinite; margin: 0 auto;
      }
      @keyframes lp-spin { to { transform: rotate(360deg); } }
      .lex-portal-header-card h2 { text-align: left; }
      @media (max-width: 400px) {
        .lex-portal-card { padding: 20px 16px; }
        .lex-portal-share-buttons { flex-direction: column; }
      }
    </style>

    <script>
    (function() {
      const API        = '<?php echo LEX_API_URL; ?>';
      const PAYOUT_PCT = <?php echo LEX_PAYOUT_PCT; ?>;
      const PAYOUT_CAP = <?php echo LEX_PAYOUT_CAP; ?>;
      const MIN_JOB    = <?php echo LEX_MIN_JOB; ?>;
      const DISCOUNT   = <?php echo LEX_DISCOUNT; ?>;
      let currentData = null;

      // ── Screen management ──
      function showScreen(id) {
        document.querySelectorAll('.lex-portal-screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        const root = document.getElementById('lex-portal-root');
        if (root) window.scrollTo({ top: root.offsetTop - 20, behavior: 'smooth' });
      }

      // ── Phone formatting ──
      const phoneInput = document.getElementById('lex-portal-phone');
      if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
          let val = e.target.value.replace(/\D/g, '').slice(0, 10);
          if (val.length >= 7)      val = '(' + val.slice(0,3) + ') ' + val.slice(3,6) + '-' + val.slice(6);
          else if (val.length >= 4) val = '(' + val.slice(0,3) + ') ' + val.slice(3);
          e.target.value = val;
        });
        phoneInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') lexPortalLookup();
        });
      }

      // ── Lookup ──
      window.lexPortalLookup = async function() {
        const raw      = (phoneInput?.value || '').replace(/\D/g, '');
        const errorEl  = document.getElementById('lex-portal-phone-error');

        if (raw.length < 10) {
          errorEl.textContent  = 'Please enter a valid 10-digit phone number.';
          errorEl.style.display = 'block';
          phoneInput.focus();
          return;
        }
        errorEl.style.display = 'none';

        const btn = document.getElementById('lex-portal-lookup-btn');
        btn.disabled    = true;
        btn.textContent = 'Looking up...';
        showScreen('lex-portal-loading');

        try {
          const res  = await fetch(API + '/api/portal/lookup', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phone: raw }),
          });
          const data = await res.json();

          if (res.status === 404) {
            showScreen('lex-portal-notfound');
            return;
          }

          if (res.status === 503) {
            document.getElementById('lex-notfound-title').textContent   = 'Unable to Verify Account';
            document.getElementById('lex-notfound-message').textContent =
              data.message || 'We\'re having trouble right now. Please call (972) 466-1917.';
            showScreen('lex-portal-notfound');
            return;
          }

          if (!data.hasReferralLink) {
            if (data.noJobsYet) {
              document.getElementById('lex-nolink-title').textContent = 'You\'re Almost In!';
            }
            if (data.message) {
              document.getElementById('lex-nolink-message').textContent = data.message;
            }
            showScreen('lex-portal-nolink');
            return;
          }

          currentData = data;
          populatePortal(data);
          if (data.isNew) showWelcomeBanner(data.name);
          showScreen('lex-portal-main');

        } catch (err) {
          showScreen('lex-portal-notfound');
        } finally {
          btn.disabled    = false;
          btn.textContent = 'Find My Account';
        }
      };

      function showWelcomeBanner(fullName) {
        const firstName = fullName.split(' ')[0];
        const banner    = document.createElement('div');
        const pct       = currentData?.payoutPercentage != null ? currentData.payoutPercentage : PAYOUT_PCT;
        const cap       = currentData?.payoutCap        != null ? currentData.payoutCap        : PAYOUT_CAP;
        banner.style.cssText = `
          background:#d1fae5; border:1.5px solid #10b981; border-radius:12px;
          padding:14px 20px; margin-bottom:16px; display:flex; align-items:center; gap:12px;
        `;
        banner.innerHTML = `
          <span style="font-size:24px;">🎉</span>
          <div>
            <strong style="color:#065f46;">Welcome to LEX Perks, ${firstName}!</strong>
            <p style="margin:3px 0 0; font-size:13px; color:#047857;">
              Your referral link is ready — earn ${pct}% of every qualified referral's invoice (up to $${cap}).
            </p>
          </div>
        `;
        const main = document.getElementById('lex-portal-main');
        main.insertBefore(banner, main.firstChild);
        setTimeout(() => {
          banner.style.transition = 'opacity 0.5s';
          banner.style.opacity    = '0';
          setTimeout(() => banner.remove(), 500);
        }, 6000);
      }

      function populatePortal(data) {
        const initials = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        document.getElementById('lex-portal-name').textContent   = data.name;
        document.getElementById('lex-portal-avatar').textContent = initials;

        document.getElementById('lex-portal-total-referrals').textContent = data.totalReferrals || 0;
        document.getElementById('lex-portal-total-rewards').textContent   = '$' + (data.totalRewards || 0);

        const pending = (data.referrals || []).filter(r => ['pending','booked','completed'].includes(r.status)).length;
        document.getElementById('lex-portal-pending-count').textContent = pending;

        const pct      = data.payoutPercentage != null ? data.payoutPercentage : PAYOUT_PCT;
        const cap      = data.payoutCap        != null ? data.payoutCap        : PAYOUT_CAP;
        const minJob   = data.minJobValue      != null ? data.minJobValue      : MIN_JOB;
        const discount = data.discountAmount   != null ? data.discountAmount   : DISCOUNT;
        document.getElementById('lex-reward-amount-display').textContent  = pct + '%';
        document.getElementById('lex-reward-cap-display').textContent     = cap;
        document.getElementById('lex-discount-amount-display').textContent = '$' + discount;
        document.getElementById('lex-step-reward').textContent            = pct + '%';
        document.getElementById('lex-step-cap').textContent               = cap;
        document.getElementById('lex-step-min').textContent               = minJob;
        document.getElementById('lex-step-discount').textContent          = '$' + discount;

        // Referral link
        document.getElementById('lex-portal-link-input').value = data.referralLink;

        // Short code — show if available
        if (data.referralCode) {
          document.getElementById('lex-portal-code-display').textContent = data.referralCode;
          document.getElementById('lex-portal-code-row').style.display   = 'block';
        }

        // SMS share
        const smsMsg = encodeURIComponent(
          `Hey! I use LEX Air Conditioning for HVAC, plumbing & electrical in DFW — highly recommend. ` +
          `Use my link to save $${discount} on your first service: ${data.referralLink} (or give them my code: ${data.referralCode || ''})`
        );
        document.getElementById('lex-portal-sms-btn').href = 'sms:?&body=' + smsMsg;

        // Email share
        const firstName    = data.name.split(' ')[0];
        const emailSubject = encodeURIComponent(`${firstName} thinks you'd love LEX Air Conditioning`);
        const emailBody    = encodeURIComponent(
          `Hey,\n\nI've been using LEX Air Conditioning for HVAC, plumbing, and electrical work in DFW and they're great.\n\n` +
          `Use my referral link to save $${discount} on your first service:\n${data.referralLink}\n\n` +
          `${data.referralCode ? `Or just give them my referral code: ${data.referralCode}\n\n` : ''}` +
          `LEX has been in business since 2004 and has over 2,000 reviews. Highly recommend!\n\n— ${data.name}`
        );
        document.getElementById('lex-portal-email-btn').href = `mailto:?subject=${emailSubject}&body=${emailBody}`;

        if (navigator.share) {
          document.getElementById('lex-portal-native-share').style.display = 'flex';
        }

        renderReferralHistory(data.referrals || []);
      }

      function renderReferralHistory(referrals) {
        const list = document.getElementById('lex-portal-referral-list');
        const card = document.getElementById('lex-portal-history-card');

        if (!referrals.length) {
          card.style.display = 'none';
          return;
        }

        const statusMap = {
          pending:   { label: 'Link Clicked', cls: 'badge-pending'   },
          booked:    { label: 'Booked',        cls: 'badge-booked'    },
          completed: { label: 'Processing',    cls: 'badge-completed' },
          rewarded:  { label: '✓ Rewarded',    cls: 'badge-rewarded'  },
          rejected:  { label: 'Not Qualified', cls: 'badge-rejected'  },
        };

        list.innerHTML = referrals.map(r => {
          const s    = statusMap[r.status] || { label: r.status, cls: 'badge-pending' };
          const date = r.created_at
            ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';
          const name = r.referred_name || 'Referral Pending';
          return `
            <div class="lex-portal-referral-item">
              <div>
                <div class="lex-portal-ref-name">${name}</div>
                ${date ? `<div class="lex-portal-ref-date">${date}</div>` : ''}
              </div>
              <span class="lex-portal-ref-badge ${s.cls}">${s.label}</span>
            </div>
          `;
        }).join('');
      }

      window.lexPortalCopyLink = function() {
        const input = document.getElementById('lex-portal-link-input');
        input.select(); input.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input.value).catch(() => document.execCommand('copy'));
        const btn = document.getElementById('lex-copy-btn');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
      };

      window.lexPortalCopyCode = function() {
        const code = document.getElementById('lex-portal-code-display').textContent;
        navigator.clipboard.writeText(code).catch(() => {});
        const btn = document.getElementById('lex-copy-code-btn');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
      };

      window.lexPortalNativeShare = async function() {
        if (!currentData || !navigator.share) return;
        try {
          await navigator.share({
            title: 'Save on LEX Air Conditioning',
            text:  `Use my referral link to save $${currentData.discountAmount || DISCOUNT} on your first LEX service in DFW!`,
            url:   currentData.referralLink,
          });
        } catch (err) {}
      };

      window.lexPortalReset = function() {
        currentData = null;
        if (phoneInput) phoneInput.value = '';
        const errorEl = document.getElementById('lex-portal-phone-error');
        if (errorEl) errorEl.style.display = 'none';
        showScreen('lex-portal-lookup');
      };

    })();
    </script>
    <?php
    return ob_get_clean();
}
