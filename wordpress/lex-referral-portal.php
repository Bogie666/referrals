<?php
/**
 * Plugin Name: LEX Referral Portal
 * Description: Customer-facing referral portal widget for LEX Air Conditioning.
 *              Customers enter their phone number, get texted a magic link,
 *              and can view their referral stats and share their link.
 * Version: 1.0.0
 * Author: LEX Air Conditioning
 *
 * ──────────────────────────────────────────────────────────────
 * INSTALLATION:
 * 1. Upload this file to /wp-content/plugins/lex-referral-portal/lex-referral-portal.php
 * 2. Activate in WordPress → Plugins
 * 3. Add shortcode [lex_referral_portal] to any WordPress page
 * 4. Update LEX_PORTAL_API_URL below to your Railway app URL
 * ──────────────────────────────────────────────────────────────
 */

define('LEX_PORTAL_API_URL', 'https://lex-referral-app.up.railway.app');

if (!defined('ABSPATH')) exit;

add_shortcode('lex_referral_portal', 'lex_referral_portal_shortcode');

function lex_referral_portal_shortcode() {
    ob_start();
    ?>
    <div id="lex-portal-root">

      <!-- ── Screen 1: Phone lookup ── -->
      <div id="lex-portal-lookup" class="lex-portal-screen active">
        <div class="lex-portal-card">
          <div class="lex-portal-icon">❄️</div>
          <h2>Check Your Referral Status</h2>
          <p class="lex-portal-sub">Enter the phone number on your LEX account to view your referral link and rewards.</p>

          <div class="lex-portal-field">
            <label for="lex-portal-phone">Your Phone Number</label>
            <input type="tel" id="lex-portal-phone"
                   placeholder="(972) 555-0100"
                   maxlength="14"
                   autocomplete="tel" />
            <div id="lex-portal-phone-error" class="lex-portal-error" style="display:none;"></div>
          </div>

          <button class="lex-portal-btn-primary" id="lex-portal-lookup-btn" onclick="lexPortalLookup()">
            Find My Account
          </button>

          <p class="lex-portal-fine">
            Not a LEX customer yet?
            <a href="tel:9724661917">(972) 466-1917</a> — we'd love to help!
          </p>
        </div>
      </div>

      <!-- ── Screen 2: Loading ── -->
      <div id="lex-portal-loading" class="lex-portal-screen">
        <div class="lex-portal-card" style="text-align:center; padding: 60px 24px;">
          <div class="lex-portal-spinner"></div>
          <p style="margin-top:20px; color:var(--muted);">Looking up your account...</p>
        </div>
      </div>

      <!-- ── Screen 3: Not found ── -->
      <div id="lex-portal-notfound" class="lex-portal-screen">
        <div class="lex-portal-card" style="text-align:center;">
          <div class="lex-portal-icon">🔍</div>
          <h2>Account Not Found</h2>
          <p class="lex-portal-sub">
            We couldn't find an account with that number. Make sure you're using
            the number on file with LEX, or give us a call and we'll look it up.
          </p>
          <a href="tel:9724661917" class="lex-portal-btn-primary">
            Call (972) 466-1917
          </a>
          <button class="lex-portal-btn-secondary" onclick="lexPortalReset()" style="margin-top:12px;">
            Try a Different Number
          </button>
        </div>
      </div>

      <!-- ── Screen 4: No referral link yet ── -->
      <div id="lex-portal-nolink" class="lex-portal-screen">
        <div class="lex-portal-card" style="text-align:center;">
          <div class="lex-portal-icon">⏳</div>
          <h2 id="lex-nolink-title">Almost Ready!</h2>
          <p class="lex-portal-sub" id="lex-nolink-message">
            Your referral link is generated automatically after your first completed service.
            If you've had a recent service, it may take up to 24 hours to appear.
          </p>
          <p class="lex-portal-sub" style="margin-top:12px;">
            Questions? Call us at <a href="tel:9724661917">(972) 466-1917</a>.
          </p>
          <button class="lex-portal-btn-secondary" onclick="lexPortalReset()" style="margin-top:20px;">
            ← Back
          </button>
        </div>
      </div>

      <!-- ── Screen 5: The actual portal ── -->
      <div id="lex-portal-main" class="lex-portal-screen">

        <!-- Header -->
        <div class="lex-portal-card lex-portal-header-card">
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
            <div class="lex-portal-avatar" id="lex-portal-avatar"></div>
            <div>
              <h2 id="lex-portal-name" style="margin:0; font-size:20px;"></h2>
              <p style="margin:2px 0 0; color:var(--muted); font-size:13px;">LEX Referral Member</p>
            </div>
          </div>

          <!-- Stats row -->
          <div class="lex-portal-stats-row">
            <div class="lex-portal-stat">
              <div class="lex-portal-stat-value" id="lex-portal-total-referrals">0</div>
              <div class="lex-portal-stat-label">Referrals</div>
            </div>
            <div class="lex-portal-stat-divider"></div>
            <div class="lex-portal-stat">
              <div class="lex-portal-stat-value green" id="lex-portal-total-rewards">$0</div>
              <div class="lex-portal-stat-label">Rewards Earned</div>
            </div>
            <div class="lex-portal-stat-divider"></div>
            <div class="lex-portal-stat">
              <div class="lex-portal-stat-value orange" id="lex-portal-pending-count">0</div>
              <div class="lex-portal-stat-label">In Progress</div>
            </div>
          </div>
        </div>

        <!-- Share your link -->
        <div class="lex-portal-card">
          <h3 class="lex-portal-section-title">Your Referral Link</h3>
          <p style="font-size:14px; color:var(--muted); margin-bottom:16px;">
            Share this link with friends and family. When they complete their first service,
            you get a <strong id="lex-reward-amount-display">$75</strong> gift card and they save
            <strong id="lex-discount-amount-display">$50</strong>.
          </p>

          <!-- Link copy row -->
          <div class="lex-portal-link-row">
            <input type="text" id="lex-portal-link-input" readonly />
            <button onclick="lexPortalCopyLink()" id="lex-copy-btn">Copy</button>
          </div>

          <!-- Share buttons -->
          <div class="lex-portal-share-buttons">
            <a id="lex-portal-sms-btn" href="#" class="lex-portal-share-btn lex-share-sms">
              💬 Text a Friend
            </a>
            <a id="lex-portal-email-btn" href="#" class="lex-portal-share-btn lex-share-email">
              ✉️ Send Email
            </a>
            <button onclick="lexPortalNativeShare()" id="lex-portal-native-share"
                    class="lex-portal-share-btn lex-share-more" style="display:none;">
              ↑ More Options
            </button>
          </div>
        </div>

        <!-- How it works -->
        <div class="lex-portal-card">
          <h3 class="lex-portal-section-title">How It Works</h3>
          <div class="lex-portal-steps">
            <div class="lex-portal-step">
              <div class="lex-portal-step-num">1</div>
              <div>
                <strong>Share your link</strong>
                <p>Send your personal link to anyone who needs AC, heating, plumbing, or electrical work.</p>
              </div>
            </div>
            <div class="lex-portal-step">
              <div class="lex-portal-step-num">2</div>
              <div>
                <strong>They book & complete service</strong>
                <p>Your friend schedules with LEX and their first service is completed (minimum $150).</p>
              </div>
            </div>
            <div class="lex-portal-step">
              <div class="lex-portal-step-num">3</div>
              <div>
                <strong>You both get rewarded</strong>
                <p>You automatically receive a <span id="lex-step-reward">$75</span> gift card by email.
                   They save <span id="lex-step-discount">$50</span> on their service.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Referral history -->
        <div class="lex-portal-card" id="lex-portal-history-card">
          <h3 class="lex-portal-section-title">Your Referrals</h3>
          <div id="lex-portal-referral-list"></div>
        </div>

        <!-- Footer -->
        <div style="text-align:center; padding: 8px 0 24px;">
          <button class="lex-portal-btn-link" onclick="lexPortalReset()">
            Sign out
          </button>
        </div>

      </div>
      <!-- /lex-portal-main -->

    </div>
    <!-- /lex-portal-root -->

    <style>
      :root {
        --navy:   #1d3a6e;
        --orange: #e85c24;
        --green:  #10b981;
        --muted:  #64748b;
        --border: #e2e8f0;
        --bg:     #f1f5f9;
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
        border: 1px solid var(--border);
      }

      .lex-portal-icon {
        font-size: 40px;
        text-align: center;
        margin-bottom: 12px;
      }

      .lex-portal-card h2 {
        font-size: 22px;
        font-weight: 700;
        color: var(--navy);
        text-align: center;
        margin: 0 0 10px;
      }

      .lex-portal-sub {
        text-align: center;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
        margin: 0 0 24px;
      }

      /* ── Field ── */
      .lex-portal-field { margin-bottom: 20px; }
      .lex-portal-field label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 6px;
      }
      .lex-portal-field input {
        width: 100%;
        padding: 13px 16px;
        border: 1.5px solid var(--border);
        border-radius: 10px;
        font-size: 16px;
        outline: none;
        transition: border 0.2s;
        box-sizing: border-box;
      }
      .lex-portal-field input:focus {
        border-color: var(--navy);
        box-shadow: 0 0 0 3px rgba(29,58,110,0.08);
      }
      .lex-portal-error {
        font-size: 13px;
        color: #dc2626;
        margin-top: 6px;
      }

      /* ── Buttons ── */
      .lex-portal-btn-primary {
        display: block;
        width: 100%;
        padding: 14px;
        background: var(--navy);
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        text-decoration: none;
        transition: background 0.2s;
        box-sizing: border-box;
      }
      .lex-portal-btn-primary:hover { background: #162d57; color: #fff; }
      .lex-portal-btn-primary.loading { opacity: 0.7; pointer-events: none; }

      .lex-portal-btn-secondary {
        display: block;
        width: 100%;
        padding: 12px;
        background: transparent;
        color: var(--navy);
        border: 1.5px solid var(--navy);
        border-radius: 10px;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        box-sizing: border-box;
        transition: background 0.2s;
      }
      .lex-portal-btn-secondary:hover { background: #f0f7ff; }

      .lex-portal-btn-link {
        background: none;
        border: none;
        color: var(--muted);
        font-size: 13px;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
      }

      /* ── Avatar ── */
      .lex-portal-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--navy);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        color: #fff;
        font-weight: 700;
        flex-shrink: 0;
      }

      /* ── Stats row ── */
      .lex-portal-stats-row {
        display: flex;
        align-items: center;
        background: var(--bg);
        border-radius: 12px;
        padding: 16px;
        gap: 0;
      }
      .lex-portal-stat {
        flex: 1;
        text-align: center;
      }
      .lex-portal-stat-value {
        font-size: 26px;
        font-weight: 700;
        color: var(--navy);
        line-height: 1;
      }
      .lex-portal-stat-value.green { color: var(--green); }
      .lex-portal-stat-value.orange { color: var(--orange); }
      .lex-portal-stat-label {
        font-size: 12px;
        color: var(--muted);
        margin-top: 4px;
      }
      .lex-portal-stat-divider {
        width: 1px;
        height: 36px;
        background: var(--border);
      }

      /* ── Link copy ── */
      .lex-portal-link-row {
        display: flex;
        margin-bottom: 16px;
      }
      .lex-portal-link-row input {
        flex: 1;
        padding: 11px 14px;
        border: 1.5px solid var(--border);
        border-right: none;
        border-radius: 10px 0 0 10px;
        font-size: 13px;
        background: #f8fafc;
        outline: none;
        color: var(--muted);
      }
      .lex-portal-link-row button {
        padding: 11px 20px;
        background: var(--navy);
        color: #fff;
        border: none;
        border-radius: 0 10px 10px 0;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.2s;
      }
      .lex-portal-link-row button:hover { background: #162d57; }

      /* ── Share buttons ── */
      .lex-portal-share-buttons {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .lex-portal-share-btn {
        flex: 1;
        min-width: 130px;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        text-align: center;
        text-decoration: none;
        cursor: pointer;
        border: 1.5px solid var(--border);
        background: #fff;
        color: var(--navy) !important;
        transition: background 0.15s;
        box-sizing: border-box;
      }
      .lex-portal-share-btn:hover { background: #f0f7ff; }
      .lex-share-sms { background: #f0fdf4; border-color: #86efac; color: #166534 !important; }
      .lex-share-sms:hover { background: #dcfce7; }

      /* ── Section titles ── */
      .lex-portal-section-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--navy);
        margin: 0 0 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }

      /* ── How it works steps ── */
      .lex-portal-steps { display: flex; flex-direction: column; gap: 16px; }
      .lex-portal-step {
        display: flex;
        align-items: flex-start;
        gap: 14px;
      }
      .lex-portal-step-num {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--navy);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .lex-portal-step strong { display: block; font-size: 14px; margin-bottom: 3px; }
      .lex-portal-step p { font-size: 13px; color: var(--muted); margin: 0; line-height: 1.4; }

      /* ── Referral list ── */
      .lex-portal-referral-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid var(--border);
        gap: 12px;
      }
      .lex-portal-referral-item:last-child { border-bottom: none; padding-bottom: 0; }
      .lex-portal-ref-name { font-size: 14px; font-weight: 500; }
      .lex-portal-ref-date { font-size: 12px; color: var(--muted); margin-top: 2px; }
      .lex-portal-ref-badge {
        font-size: 12px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 20px;
        white-space: nowrap;
      }
      .badge-rewarded  { background: #d1fae5; color: #065f46; }
      .badge-booked    { background: #dbeafe; color: #1e40af; }
      .badge-pending   { background: #fef3c7; color: #92400e; }
      .badge-completed { background: #ede9fe; color: #5b21b6; }
      .badge-rejected  { background: #fee2e2; color: #991b1b; }

      /* ── Spinner ── */
      .lex-portal-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--border);
        border-top-color: var(--navy);
        border-radius: 50%;
        animation: lex-spin 0.7s linear infinite;
        margin: 0 auto;
      }
      @keyframes lex-spin { to { transform: rotate(360deg); } }

      /* ── Fine print ── */
      .lex-portal-fine {
        font-size: 12px;
        color: var(--muted);
        text-align: center;
        margin-top: 16px;
      }
      .lex-portal-fine a { color: var(--navy); }

      /* ── Header card adjustments ── */
      .lex-portal-header-card h2 { text-align: left; }
      .lex-portal-header-card .lex-portal-sub { text-align: left; }

      @media (max-width: 400px) {
        .lex-portal-card { padding: 20px 16px; }
        .lex-portal-share-buttons { flex-direction: column; }
        .lex-portal-share-btn { min-width: 0; }
      }
    </style>

    <script>
    (function() {
      const API = '<?php echo LEX_PORTAL_API_URL; ?>';
      let currentData = null;

      // ── Screen management ──
      function showScreen(id) {
        document.querySelectorAll('.lex-portal-screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        window.scrollTo({ top: document.getElementById('lex-portal-root').offsetTop - 20, behavior: 'smooth' });
      }

      // ── Phone number formatting ──
      const phoneInput = document.getElementById('lex-portal-phone');
      if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
          let val = e.target.value.replace(/\D/g, '').slice(0, 10);
          if (val.length >= 7) {
            val = '(' + val.slice(0,3) + ') ' + val.slice(3,6) + '-' + val.slice(6);
          } else if (val.length >= 4) {
            val = '(' + val.slice(0,3) + ') ' + val.slice(3);
          }
          e.target.value = val;
        });

        phoneInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') lexPortalLookup();
        });
      }

      // ── Lookup ──
      window.lexPortalLookup = async function() {
        const raw = (phoneInput?.value || '').replace(/\D/g, '');
        const errorEl = document.getElementById('lex-portal-phone-error');

        if (raw.length < 10) {
          errorEl.textContent = 'Please enter a valid 10-digit phone number.';
          errorEl.style.display = 'block';
          phoneInput.focus();
          return;
        }
        errorEl.style.display = 'none';

        const btn = document.getElementById('lex-portal-lookup-btn');
        btn.classList.add('loading');
        btn.textContent = 'Looking up...';
        showScreen('lex-portal-loading');

        try {
          const res = await fetch(API + '/api/portal/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: raw }),
          });

          const data = await res.json();

          // ── Not a LEX customer ──
          if (res.status === 404) {
            showScreen('lex-portal-notfound');
            return;
          }

          // ── Service unavailable (ST unreachable) ──
          if (res.status === 503) {
            document.getElementById('lex-portal-notfound').querySelector('h2').textContent = 'Unable to Verify Account';
            document.getElementById('lex-portal-notfound').querySelector('.lex-portal-sub').textContent =
              data.message || 'We\'re having trouble verifying your account right now. Please call us at (972) 466-1917.';
            showScreen('lex-portal-notfound');
            return;
          }

          // ── Found but no completed jobs yet ──
          if (!data.hasReferralLink) {
            const titleEl   = document.getElementById('lex-nolink-title');
            const messageEl = document.getElementById('lex-nolink-message');
            if (data.noJobsYet) {
              if (titleEl) titleEl.textContent = 'You\'re Almost In!';
            }
            if (messageEl && data.message) {
              messageEl.textContent = data.message;
            }
            showScreen('lex-portal-nolink');
            return;
          }

          // ── Has a referral link ──
          currentData = data;
          populatePortal(data);

          // Show a welcome banner for brand new self-signups
          if (data.isNew) {
            showWelcomeBanner(data.name);
          }

          showScreen('lex-portal-main');

        } catch (err) {
          console.error('[Portal] Lookup error:', err);
          showScreen('lex-portal-notfound');
        } finally {
          btn.classList.remove('loading');
          btn.textContent = 'Find My Account';
        }
      };

      function showWelcomeBanner(fullName) {
        const firstName = fullName.split(' ')[0];
        const banner = document.createElement('div');
        banner.style.cssText = `
          background: #d1fae5; border: 1.5px solid #10b981; border-radius: 12px;
          padding: 14px 20px; margin-bottom: 16px;
          display: flex; align-items: center; gap: 12px;
          animation: lex-fadein 0.4s ease;
        `;
        banner.innerHTML = `
          <span style="font-size:24px;">🎉</span>
          <div>
            <strong style="color:#065f46;">Welcome to the LEX Referral Program, ${firstName}!</strong>
            <p style="margin:3px 0 0; font-size:13px; color:#047857;">
              Your referral link is ready. Start sharing and earn a $${currentData?.rewardAmount || 75} gift card for every friend who completes a service!
            </p>
          </div>
        `;
        const mainScreen = document.getElementById('lex-portal-main');
        mainScreen.insertBefore(banner, mainScreen.firstChild);
        setTimeout(() => {
          banner.style.transition = 'opacity 0.5s';
          banner.style.opacity = '0';
          setTimeout(() => banner.remove(), 500);
        }, 6000);
      }

      function populatePortal(data) {
        // Header
        const firstName = data.name.split(' ')[0];
        const initials = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        document.getElementById('lex-portal-name').textContent = data.name;
        document.getElementById('lex-portal-avatar').textContent = initials;

        // Stats
        document.getElementById('lex-portal-total-referrals').textContent = data.totalReferrals;
        document.getElementById('lex-portal-total-rewards').textContent = '$' + (data.totalRewards || 0);
        const pending = (data.referrals || []).filter(r => ['pending','booked','completed'].includes(r.status)).length;
        document.getElementById('lex-portal-pending-count').textContent = pending;

        // Reward amounts
        const reward = data.rewardAmount || 75;
        const discount = data.discountAmount || 50;
        document.getElementById('lex-reward-amount-display').textContent = '$' + reward;
        document.getElementById('lex-discount-amount-display').textContent = '$' + discount;
        document.getElementById('lex-step-reward').textContent = '$' + reward;
        document.getElementById('lex-step-discount').textContent = '$' + discount;

        // Referral link
        const linkInput = document.getElementById('lex-portal-link-input');
        linkInput.value = data.referralLink;

        // SMS share
        const smsMsg = encodeURIComponent(
          `Hey! I use LEX Air Conditioning for all my home services in DFW — AC, heating, plumbing, electrical. ` +
          `Use my link to save $${discount} on your first service: ${data.referralLink}`
        );
        document.getElementById('lex-portal-sms-btn').href = 'sms:?&body=' + smsMsg;

        // Email share
        const emailSubject = encodeURIComponent(`${firstName} thinks you'd love LEX Air Conditioning`);
        const emailBody = encodeURIComponent(
          `Hey,\n\nI've been using LEX Air Conditioning for HVAC, plumbing, and electrical work here in DFW and they're great.\n\n` +
          `Use my referral link to save $${discount} on your first service:\n${data.referralLink}\n\n` +
          `They've been in business since 2004 and have over 2,000 reviews. Highly recommend!\n\n— ${data.name}`
        );
        document.getElementById('lex-portal-email-btn').href =
          `mailto:?subject=${emailSubject}&body=${emailBody}`;

        // Native share (mobile)
        if (navigator.share) {
          document.getElementById('lex-portal-native-share').style.display = 'flex';
        }

        // Referral history
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
          pending:   { label: 'Link Clicked',  cls: 'badge-pending'   },
          booked:    { label: 'Booked',         cls: 'badge-booked'    },
          completed: { label: 'Processing',     cls: 'badge-completed' },
          rewarded:  { label: '✓ Rewarded',     cls: 'badge-rewarded'  },
          rejected:  { label: 'Not Qualified',  cls: 'badge-rejected'  },
        };

        list.innerHTML = referrals.map(r => {
          const s = statusMap[r.status] || { label: r.status, cls: 'badge-pending' };
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

      // ── Copy link ──
      window.lexPortalCopyLink = function() {
        const input = document.getElementById('lex-portal-link-input');
        input.select();
        input.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input.value).catch(() => {
          document.execCommand('copy');
        });
        const btn = document.getElementById('lex-copy-btn');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      };

      // ── Native share ──
      window.lexPortalNativeShare = async function() {
        if (!currentData || !navigator.share) return;
        try {
          await navigator.share({
            title: 'Save on LEX Air Conditioning',
            text: `Use my link to save $${currentData.discountAmount || 50} on your first HVAC, plumbing, or electrical service with LEX Air Conditioning in DFW!`,
            url: currentData.referralLink,
          });
        } catch (err) {
          // User dismissed — do nothing
        }
      };

      // ── Reset / sign out ──
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
