<?php
/**
 * Plugin Name: LEX Referral App
 * Description: Displays the referral landing page and share widget for LEX Air Conditioning.
 * Version: 1.0.0
 * Author: LEX Air Conditioning
 *
 * ──────────────────────────────────────────────────────
 * INSTALLATION:
 * 1. Upload this file to /wp-content/plugins/lex-referral/lex-referral.php
 * 2. Activate the plugin in WordPress → Plugins
 * 3. Create a WordPress page (e.g. "Referral"), set the slug to "referral"
 * 4. Add the shortcode [lex_referral] to that page's content
 * 5. Set LEX_REFERRAL_API_URL below to your Railway app URL
 * ──────────────────────────────────────────────────────
 */

// Your Railway.app backend URL — update after deploying
define('LEX_REFERRAL_API_URL', 'https://lex-referral-app.up.railway.app');

if (!defined('ABSPATH')) exit;

// ── Register shortcode ──────────────────────────────────
add_shortcode('lex_referral', 'lex_referral_shortcode');

function lex_referral_shortcode() {
    ob_start();
    ?>
    <div id="lex-referral-widget">

      <!-- Loading state -->
      <div id="lex-ref-loading" style="text-align:center;padding:40px;">
        <p>Loading your referral info...</p>
      </div>

      <!-- Invalid / no slug state -->
      <div id="lex-ref-invalid" style="display:none; text-align:center; padding:40px;">
        <h2>Referral Link Not Found</h2>
        <p>This referral link may have expired or is invalid. 
           Contact us at <a href="tel:9724661917">(972) 466-1917</a> and we'll get you set up!</p>
      </div>

      <!-- Main referral card (shown when slug is valid) -->
      <div id="lex-ref-card" style="display:none;">

        <div class="lex-ref-header">
          <img src="<?php echo get_template_directory_uri(); ?>/images/logo.png"
               alt="LEX Air Conditioning" style="max-width:180px; margin-bottom:16px;" />
          <h1 id="lex-ref-headline">Your friend wants to save you money!</h1>
          <p id="lex-ref-subline" style="font-size:18px; color:#555;"></p>
        </div>

        <div class="lex-ref-rewards">
          <div class="lex-ref-reward-box">
            <div class="lex-ref-reward-amount" id="lex-discount-amount">$50</div>
            <div class="lex-ref-reward-label">OFF your first service</div>
          </div>
          <div class="lex-ref-divider">+</div>
          <div class="lex-ref-reward-box lex-ref-secondary">
            <div class="lex-ref-reward-amount" id="lex-reward-amount">$75</div>
            <div class="lex-ref-reward-label">Gift card for <span id="lex-referrer-name"></span></div>
          </div>
        </div>

        <p style="text-align:center; font-size:15px; color:#666; margin: 0 0 24px;">
          Schedule your first AC, heating, plumbing, or electrical service to unlock both rewards.
        </p>

        <!-- Primary CTA -->
        <div style="text-align:center; margin-bottom:20px;">
          <a href="tel:9724661917" class="lex-ref-btn-primary">
            📞 Call to Book: (972) 466-1917
          </a>
        </div>

        <!-- Share section (shown to the referrer themselves) -->
        <div id="lex-ref-share" style="border-top:1px solid #e5e5e5; padding-top:24px; margin-top:8px;">
          <h3 style="text-align:center; margin-bottom:16px;">Share Your Link</h3>
          <div class="lex-ref-link-row">
            <input type="text" id="lex-ref-link-input" readonly style="
              flex:1; padding:12px; border:1px solid #ddd; border-radius:8px 0 0 8px;
              font-size:14px; background:#f9f9f9;
            " />
            <button onclick="lexCopyLink()" style="
              padding:12px 20px; background:#1d3a6e; color:#fff;
              border:none; border-radius:0 8px 8px 0; cursor:pointer; font-size:14px;
            " id="lex-copy-btn">Copy</button>
          </div>

          <!-- Share via text pre-pop -->
          <div style="text-align:center; margin-top:16px;">
            <a id="lex-sms-share" href="#" class="lex-ref-btn-secondary">
              💬 Share via Text Message
            </a>
          </div>
        </div>

        <p style="text-align:center; font-size:12px; color:#999; margin-top:24px;">
          Reward paid after friend's first completed service (minimum $150 job). 
          One reward per household. LEX Air Conditioning — Serving DFW since 2004.
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
        padding: 32px 24px 24px;
      }
      .lex-ref-header h1 {
        font-size: 26px;
        color: #1d3a6e;
        margin: 0 0 8px;
      }
      .lex-ref-rewards {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background: #f0f7ff;
        border-radius: 12px;
        padding: 28px 24px;
        margin: 0 0 24px;
      }
      .lex-ref-reward-box {
        text-align: center;
        flex: 1;
      }
      .lex-ref-reward-amount {
        font-size: 48px;
        font-weight: 700;
        color: #1d3a6e;
        line-height: 1;
      }
      .lex-ref-secondary .lex-ref-reward-amount {
        color: #2a8e4e;
      }
      .lex-ref-reward-label {
        font-size: 14px;
        color: #555;
        margin-top: 6px;
      }
      .lex-ref-divider {
        font-size: 28px;
        color: #bbb;
        font-weight: 300;
      }
      .lex-ref-btn-primary {
        display: inline-block;
        background: #e85c24;
        color: #fff !important;
        padding: 16px 36px;
        border-radius: 10px;
        text-decoration: none;
        font-size: 18px;
        font-weight: 600;
        transition: background 0.2s;
      }
      .lex-ref-btn-primary:hover { background: #c94e1e; }
      .lex-ref-btn-secondary {
        display: inline-block;
        background: #fff;
        color: #1d3a6e !important;
        border: 2px solid #1d3a6e;
        padding: 12px 28px;
        border-radius: 8px;
        text-decoration: none;
        font-size: 15px;
        font-weight: 500;
      }
      .lex-ref-btn-secondary:hover { background: #f0f7ff; }
      .lex-ref-link-row {
        display: flex;
        gap: 0;
      }
      @media (max-width: 480px) {
        .lex-ref-rewards { flex-direction: column; gap: 8px; }
        .lex-ref-reward-amount { font-size: 38px; }
        .lex-ref-divider { display: none; }
      }
    </style>

    <script>
    (function() {
      // Read the referral slug from the URL: ?r=sarah-m-4f2a
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('r');
      const apiBase = '<?php echo LEX_REFERRAL_API_URL; ?>';

      // Track the referral click
      if (slug) {
        fetch(apiBase + '/api/referral/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        }).catch(() => {});
      }

      // Fetch referral data and render the card
      async function init() {
        if (!slug) {
          // No slug = someone visiting the page directly, show generic CTA
          document.getElementById('lex-ref-loading').style.display = 'none';
          document.getElementById('lex-ref-headline').textContent = 'Refer a Friend, Earn $75!';
          document.getElementById('lex-ref-subline').textContent =
            'Share LEX with someone who needs AC, heating, plumbing, or electrical service.';
          document.getElementById('lex-ref-card').style.display = 'block';
          document.getElementById('lex-ref-share').style.display = 'none';
          return;
        }

        try {
          const res = await fetch(apiBase + '/api/referral/' + slug);
          if (!res.ok) throw new Error('Not found');
          const data = await res.json();

          // Populate the card
          document.getElementById('lex-ref-headline').textContent =
            data.referrerFirstName + ' wants to save you money on HVAC, plumbing & electrical!';
          document.getElementById('lex-ref-subline').textContent =
            'Get $' + data.discount + ' off your first service when you book through their link.';
          document.getElementById('lex-referrer-name').textContent = data.referrerFirstName;
          document.getElementById('lex-discount-amount').textContent = '$' + data.discount;
          document.getElementById('lex-reward-amount').textContent = '$' + data.reward;

          // Share link
          const linkInput = document.getElementById('lex-ref-link-input');
          linkInput.value = data.referralLink;

          // SMS pre-pop
          const smsMsg = encodeURIComponent(
            'Hey! I use LEX Air Conditioning for all my home services in DFW and love them. ' +
            'Use my link to get $' + data.discount + ' off your first service: ' + data.referralLink
          );
          document.getElementById('lex-sms-share').href = 'sms:?&body=' + smsMsg;

          // Show the card
          document.getElementById('lex-ref-loading').style.display = 'none';
          document.getElementById('lex-ref-card').style.display = 'block';

        } catch (e) {
          document.getElementById('lex-ref-loading').style.display = 'none';
          document.getElementById('lex-ref-invalid').style.display = 'block';
        }
      }

      init();
    })();

    function lexCopyLink() {
      const input = document.getElementById('lex-ref-link-input');
      input.select();
      input.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(input.value).catch(() => {
        document.execCommand('copy');
      });
      const btn = document.getElementById('lex-copy-btn');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    }
    </script>
    <?php
    return ob_get_clean();
}
