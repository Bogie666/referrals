/**
 * Renders the full admin dashboard HTML.
 * Pure server-rendered HTML — no React or build step needed.
 * Charts are rendered with Chart.js via CDN.
 */

function statusBadge(status) {
  const map = {
    pending:   { color: '#f59e0b', bg: '#fef3c7', label: 'Pending' },
    booked:    { color: '#3b82f6', bg: '#dbeafe', label: 'Booked' },
    completed: { color: '#8b5cf6', bg: '#ede9fe', label: 'Completed' },
    rewarded:  { color: '#10b981', bg: '#d1fae5', label: 'Rewarded' },
    rejected:  { color: '#ef4444', bg: '#fee2e2', label: 'Rejected' },
  };
  const s = map[status] || { color: '#6b7280', bg: '#f3f4f6', label: status };
  return `<span style="
    display:inline-block; padding:3px 10px; border-radius:20px;
    font-size:12px; font-weight:600; color:${s.color}; background:${s.bg};
  ">${s.label}</span>`;
}

function formatCurrency(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPhone(raw) {
  if (!raw) return '—';
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Chicago',
  });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/Chicago',
  });
}

function formatRelative(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function renderStatusStrip(systemStatus) {
  if (!systemStatus) return '';
  const { poller, chiirp, tracking } = systemStatus;

  const pollerDetail = poller.lastPolledAt
    ? `${formatRelative(poller.lastPolledAt)} · ${poller.jobsLast24h} job${poller.jobsLast24h === 1 ? '' : 's'}/24h`
    : 'no runs recorded';

  const chiirpDetail = chiirp.lastSendAt
    ? (chiirp.status === 'red'
        ? `last send failed · ${formatRelative(chiirp.lastSendAt)}`
        : `last send ${formatRelative(chiirp.lastSendAt)}`)
    : 'no recent sends';

  const trackingDetail = tracking
    ? `${tracking.total24h} event${tracking.total24h === 1 ? '' : 's'}/24h`
    : 'no events';

  const funnelRow = (label, key) => `
    <div class="status-panel__row">
      <span>${label}</span>
      <span class="status-panel__msg"></span>
      <span style="font-weight:600;">${tracking?.counts?.[key] ?? 0}</span>
    </div>
  `;

  const chiirpRows = (chiirp.recent || []).length
    ? chiirp.recent.map(r => `
        <div class="status-panel__row ${r.status === 'failed' ? 'status-panel__row--failed' : ''}">
          <span style="font-weight:600;">${r.phone || '—'}</span>
          <span class="status-panel__msg">${r.message ? r.message.replace(/</g, '&lt;') : ''}</span>
          <span style="color:var(--muted); font-size:12px;">${formatRelative(r.sentAt)}</span>
          <span style="font-weight:600; color:${r.status === 'failed' ? '#ef4444' : 'var(--green)'};">${r.status}</span>
        </div>
      `).join('')
    : '<div class="status-panel__empty">No webhook activity yet.</div>';

  return `
    <div class="status-strip">
      <button type="button" class="status-pill" onclick="toggleStatusPanel('poller-panel')">
        <span class="status-pill__dot status-pill__dot--${poller.status}"></span>
        <span class="status-pill__label">Poller</span>
        <span class="status-pill__detail">${pollerDetail}</span>
      </button>
      <button type="button" class="status-pill" onclick="toggleStatusPanel('chiirp-panel')">
        <span class="status-pill__dot status-pill__dot--${chiirp.status}"></span>
        <span class="status-pill__label">Chiirp</span>
        <span class="status-pill__detail">${chiirpDetail}</span>
      </button>
      <button type="button" class="status-pill" onclick="toggleStatusPanel('tracking-panel')">
        <span class="status-pill__dot status-pill__dot--${tracking?.status || 'unknown'}"></span>
        <span class="status-pill__label">Tracking</span>
        <span class="status-pill__detail">${trackingDetail}</span>
      </button>
    </div>
    <div class="status-panel" id="poller-panel">
      <h4>Poller</h4>
      <div class="status-panel__row">
        <span>Last run</span>
        <span class="status-panel__msg">${poller.lastPolledAt ? formatDateTime(poller.lastPolledAt) : 'never'}</span>
        <span style="color:var(--muted); font-size:12px;">${poller.minutesSincePoll !== null ? poller.minutesSincePoll + ' min ago' : '—'}</span>
      </div>
      <div class="status-panel__row">
        <span>Jobs processed (24h)</span>
        <span class="status-panel__msg"></span>
        <span style="font-weight:600;">${poller.jobsLast24h}</span>
      </div>
      <div class="status-panel__row">
        <span>Cron schedule</span>
        <span class="status-panel__msg">Vercel cron, hourly at :00 UTC</span>
        <span></span>
      </div>
    </div>
    <div class="status-panel" id="chiirp-panel">
      <h4>Chiirp — last 10 webhook sends</h4>
      ${chiirpRows}
    </div>
    <div class="status-panel" id="tracking-panel">
      <h4>Tracking — events in the last 24h</h4>
      ${funnelRow('Portal views (referrer)', 'portal_view')}
      ${funnelRow('Share clicks (referrer)', 'share')}
      ${funnelRow('Link clicks (friend)', 'link_click')}
      ${funnelRow('Scheduler opened', 'scheduler_opened')}
      ${funnelRow('Slot selected', 'slot_selected')}
      ${funnelRow('Customer info submitted', 'customer_info_submitted')}
      ${funnelRow('Booking confirmed', 'booking_confirmed')}
    </div>
  `;
}

function renderLogin(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LEX Referral — Admin Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; min-height: 100vh; display: flex;
           align-items: center; justify-content: center; }
    .card { background: #fff; border-radius: 16px; padding: 48px 40px;
            width: 100%; max-width: 400px; box-shadow: 0 25px 50px rgba(0,0,0,0.4); }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo h1 { font-size: 22px; color: #1d3a6e; font-weight: 700; }
    .logo p { font-size: 13px; color: #64748b; margin-top: 4px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    input[type=email], input[type=password] {
      width: 100%; padding: 12px 16px; border: 1px solid #d1d5db;
      border-radius: 8px; font-size: 15px; outline: none; transition: border 0.2s;
      margin-bottom: 16px;
    }
    input:focus { border-color: #1d3a6e; box-shadow: 0 0 0 3px rgba(29,58,110,0.1); }
    button {
      width: 100%; padding: 13px; background: #1d3a6e; color: #fff;
      border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
      cursor: pointer; margin-top: 8px; transition: background 0.2s;
    }
    button:hover { background: #162d57; }
    .error { background: #fee2e2; color: #dc2626; padding: 12px; border-radius: 8px;
             font-size: 13px; margin-bottom: 20px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <img src="https://www.lexairconditioning.com/wp-content/uploads/2024/11/lex-air-web-transparent_badge-color.png" alt="LEX Air" style="width:80px; height:auto; margin-bottom:12px;" />
      <h1>LEX Referral Admin</h1>
      <p>Sign in to access the referral dashboard</p>
    </div>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/admin/login">
      <label for="email">Email</label>
      <input type="email" name="email" id="email" placeholder="you@lexair.com" autofocus required />
      <label for="password">Password</label>
      <input type="password" name="password" id="password" placeholder="Enter password" required />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

function renderDashboard({ stats, referrals, topReferrers, allCustomers, customersTotalCount, recentActivity, timeline, monthlyTrend, settings, adminUsers, currentUser, systemStatus, activeTab = 'overview' }) {
  const canWrite = currentUser?.role !== 'viewer';
  const navItems = [
    { id: 'overview',   label: 'Overview',       href: '/admin' },
    { id: 'referrals',  label: 'Referrals',      href: '/admin/referrals' },
    { id: 'customers',  label: 'Customers',      href: '/admin/referrers' },
    { id: 'activity',   label: 'Activity',       href: '/admin/activity' },
    { id: 'settings',   label: 'Settings',       href: '/admin/settings' },
  ];

  const trendLabels = JSON.stringify(monthlyTrend.map(m => m.label));
  const trendCreated = JSON.stringify(monthlyTrend.map(m => m.created));
  const trendRewarded = JSON.stringify(monthlyTrend.map(m => m.rewarded));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LEX Referral Dashboard</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:   #1d3a6e;
      --orange: #e85c24;
      --green:  #10b981;
      --bg:        #f1f5f9;
      --card:      #ffffff;
      --text:      #0f172a;
      --muted:     #64748b;
      --border:    #e2e8f0;
      --row-hover: #f8fafc;
      --code-bg:   #f1f5f9;
      --input-bg:  #ffffff;
      --shadow:    0 1px 3px rgba(15, 23, 42, 0.06);
      --link-accent: #3b82f6;
      --sidebar-w: 220px;
    }

    [data-theme="dark"] {
      --bg:        #0b1220;
      --card:      #111a2e;
      --text:      #e2e8f0;
      --muted:     #94a3b8;
      --border:    #1f2c44;
      --row-hover: #18243d;
      --code-bg:   #18243d;
      --input-bg:  #0e1729;
      --shadow:    0 1px 3px rgba(0, 0, 0, 0.5);
      --link-accent: #60a5fa;
    }
    [data-theme="dark"] body { color-scheme: dark; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
    }

    /* -- Sidebar -- */
    .sidebar {
      width: var(--sidebar-w);
      background: var(--navy);
      min-height: 100vh;
      position: fixed;
      top: 0; left: 0;
      display: flex;
      flex-direction: column;
      z-index: 100;
    }
    .sidebar-brand {
      padding: 28px 20px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .sidebar-brand h1 {
      font-size: 17px;
      font-weight: 700;
      color: #fff;
      line-height: 1.2;
    }
    .sidebar-brand p {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      margin-top: 3px;
    }
    .sidebar-user {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex; flex-direction: column; gap: 4px;
    }
    .sidebar-user__name {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
      line-height: 1.2;
    }
    .sidebar-user__role {
      align-self: flex-start;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.75);
    }
    .sidebar-user__role--super_admin { background: rgba(139,92,246,0.25); color: #c4b5fd; }
    .sidebar-user__role--admin       { background: rgba(59,130,246,0.25); color: #93c5fd; }
    .sidebar-user__role--viewer      { background: rgba(148,163,184,0.20); color: #cbd5e1; }
    .sidebar-nav {
      padding: 16px 12px;
      flex: 1;
    }
    .sidebar-nav a {
      display: block;
      padding: 10px 12px;
      border-radius: 8px;
      color: rgba(255,255,255,0.65);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 2px;
      transition: all 0.15s;
    }
    .sidebar-nav a:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .sidebar-nav a.active { background: rgba(255,255,255,0.15); color: #fff; }
    .sidebar-footer {
      padding: 16px 12px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .sidebar-theme-toggle {
      width: 100%;
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 12px;
      margin-bottom: 6px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: transparent;
      color: rgba(255,255,255,0.75);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s;
    }
    .sidebar-theme-toggle:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .sidebar-theme-toggle__label { letter-spacing: 0.02em; }
    .sidebar-theme-toggle__value {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
      background: rgba(255,255,255,0.1);
      padding: 2px 8px;
      border-radius: 999px;
    }
    .sidebar-footer a {
      display: block;
      padding: 9px 12px;
      border-radius: 8px;
      color: rgba(255,255,255,0.5);
      text-decoration: none;
      font-size: 13px;
      transition: all 0.15s;
    }
    .sidebar-footer a:hover { background: rgba(255,255,255,0.08); color: #fff; }

    /* -- Main content -- */
    .main {
      margin-left: var(--sidebar-w);
      flex: 1;
      padding: 32px;
      max-width: calc(100% - var(--sidebar-w));
    }
    .page-header {
      margin-bottom: 28px;
    }
    .page-header h2 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
    }
    .page-header p {
      font-size: 14px;
      color: var(--muted);
      margin-top: 4px;
    }

    /* -- Stat cards -- */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: var(--card);
      border-radius: 12px;
      padding: 20px 22px;
      border: 1px solid var(--border);
    }
    .stat-card .stat-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .stat-card .stat-value {
      font-size: 30px;
      font-weight: 700;
      color: var(--text);
      line-height: 1;
    }
    .stat-card .stat-sub {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }
    .stat-card.green .stat-value { color: var(--green); }
    .stat-card.orange .stat-value { color: var(--orange); }
    .stat-card.navy .stat-value { color: var(--navy); }

    /* -- System status strip -- */
    .status-strip {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 13px;
      color: var(--text);
      cursor: pointer;
      transition: background 0.15s;
    }
    .status-pill:hover { background: var(--row-hover); }
    .status-pill__dot {
      width: 9px; height: 9px; border-radius: 50%;
      background: #94a3b8;
      box-shadow: 0 0 0 3px rgba(148,163,184,0.18);
    }
    .status-pill__dot--green  { background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.18); }
    .status-pill__dot--yellow { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.20); }
    .status-pill__dot--red    { background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.20); }
    .status-pill__label { font-weight: 600; }
    .status-pill__detail { color: var(--muted); font-size: 12px; }

    .status-panel {
      display: none;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .status-panel.open { display: block; }
    .status-panel h4 { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: var(--text); }
    .status-panel__row {
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }
    .status-panel__row:last-child { border-bottom: none; }
    .status-panel__row--failed { color: #ef4444; }
    .status-panel__row .status-panel__msg {
      flex: 1; color: var(--muted); font-size: 12px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .status-panel__empty { color: var(--muted); padding: 8px 0; }

    /* -- Pipeline bar -- */
    .pipeline-card {
      background: var(--card);
      border-radius: 12px;
      padding: 24px;
      border: 1px solid var(--border);
      margin-bottom: 28px;
    }
    .pipeline-card h3 { font-size: 15px; font-weight: 600; margin-bottom: 20px; }
    .pipeline-stages {
      display: flex;
      gap: 0;
      border-radius: 8px;
      overflow: hidden;
      height: 44px;
    }
    .pipeline-stage {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      gap: 6px;
      transition: flex 0.5s ease;
      min-width: 0;
      overflow: hidden;
    }
    .pipeline-stage.pending   { background: #f59e0b; }
    .pipeline-stage.booked    { background: #3b82f6; }
    .pipeline-stage.completed { background: #8b5cf6; }
    .pipeline-stage.rewarded  { background: #10b981; }
    .pipeline-stage.rejected  { background: #ef4444; }
    .pipeline-labels {
      display: flex;
      gap: 16px;
      margin-top: 14px;
      flex-wrap: wrap;
    }
    .pipeline-legend {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
    }
    .pipeline-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    /* -- Two column layout -- */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

    /* -- Card -- */
    .card {
      background: var(--card);
      border-radius: 12px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .card-header {
      padding: 18px 22px 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-header h3 { font-size: 15px; font-weight: 600; }
    .card-header a  { font-size: 13px; color: var(--navy); text-decoration: none; }
    .card-header a:hover { text-decoration: underline; }
    .card-body { padding: 0; }

    /* -- Table -- */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    thead th {
      padding: 10px 16px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
      background: var(--row-hover);
    }
    tbody tr { border-bottom: 1px solid var(--border); }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--row-hover); }
    tbody td {
      padding: 12px 16px;
      vertical-align: middle;
    }
    .td-name { font-weight: 500; color: var(--text); }
    .td-sub  { font-size: 12px; color: var(--muted); margin-top: 2px; }

    /* -- Activity feed -- */
    .activity-list { padding: 0 4px; }
    .activity-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 13px 18px;
      border-bottom: 1px solid var(--border);
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-dot {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .activity-dot.rewarded  { background: #d1fae5; }
    .activity-dot.booked    { background: #dbeafe; }
    .activity-dot.pending   { background: #fef3c7; }
    .activity-dot.completed { background: #ede9fe; }
    .activity-dot.rejected  { background: #fee2e2; }
    .activity-dot.click     { background: #dbeafe; color: #2563eb; }
    .activity-dot.portal    { background: #e2e8f0; color: #475569; }
    .activity-dot.share     { background: #fef3c7; color: #b45309; }
    .activity-dot.funnel    { background: #ede9fe; color: #7c3aed; }
    .activity-dot.anonymous { background: #f1f5f9; color: #94a3b8; }
    .activity-item[data-category="anonymous"] .activity-text p { color: var(--muted); font-style: italic; }
    .activity-text { flex: 1; }
    .activity-text p { font-size: 13px; color: var(--text); line-height: 1.4; }
    .activity-text span { font-size: 12px; color: var(--muted); margin-top: 2px; display: block; }
    .activity-meta { font-size: 11px; color: var(--muted); margin-left: 6px; }

    /* -- Activity feed filtering -- */
    [data-activity-filter="referral"]  .activity-item:not([data-category="referral"])  { display: none; }
    [data-activity-filter="click"]     .activity-item:not([data-category="click"])     { display: none; }
    [data-activity-filter="portal"]    .activity-item:not([data-category="portal"])    { display: none; }
    [data-activity-filter="share"]     .activity-item:not([data-category="share"])     { display: none; }
    [data-activity-filter="funnel"]    .activity-item:not([data-category="funnel"])    { display: none; }
    [data-activity-filter="anonymous"] .activity-item:not([data-category="anonymous"]) { display: none; }

    /* -- Chart container -- */
    .chart-wrap {
      padding: 20px;
      height: 240px;
      position: relative;
    }

    /* -- Filter bar -- */
    .filter-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 7px 16px;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      color: var(--muted);
      text-decoration: none;
      transition: all 0.15s;
    }
    .filter-btn:hover, .filter-btn.active {
      background: var(--navy);
      color: #fff;
      border-color: var(--navy);
    }

    .funnel-mode-btn {
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
    }
    .funnel-mode-btn:hover { background: var(--row-hover); color: var(--text); }
    .funnel-mode-btn.active { background: var(--navy); color: #fff; border-color: var(--navy); }

    /* -- Empty state -- */
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--muted);
    }
    .empty-state p { font-size: 14px; margin-top: 8px; }

    /* -- Scrollable table wrapper -- */
    .table-wrap { overflow-x: auto; }

    /* -- Modal overlay -- */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.active { display: flex; }
    .modal-box {
      background: var(--card);
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 460px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.25);
      color: var(--text);
    }
    .modal-box h3 { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
    .modal-box label { display: block; font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
    .modal-box select, .modal-box input, .modal-box textarea {
      width: 100%; padding: 10px 14px; border: 1px solid var(--border);
      border-radius: 8px; font-size: 14px; margin-bottom: 16px; outline: none;
      font-family: inherit;
      background: var(--input-bg);
      color: var(--text);
    }
    .modal-box select:focus, .modal-box input:focus, .modal-box textarea:focus {
      border-color: var(--navy); box-shadow: 0 0 0 3px rgba(29,58,110,0.1);
    }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
    .btn-primary {
      padding: 10px 20px; background: var(--green); color: #fff;
      border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary {
      padding: 10px 20px; background: transparent; color: var(--muted);
      border: 1px solid var(--border); border-radius: 8px; font-size: 14px;
      cursor: pointer;
    }

    /* -- Settings forms -- */
    .settings-card {
      background: var(--card);
      border-radius: 12px;
      border: 1px solid var(--border);
      padding: 24px;
      margin-bottom: 20px;
    }
    .settings-card h3 {
      font-size: 16px; font-weight: 700; margin-bottom: 16px;
      padding-bottom: 12px; border-bottom: 1px solid var(--border);
    }
    .form-row { display: flex; gap: 16px; margin-bottom: 16px; align-items: flex-end; }
    .form-row .form-group { flex: 1; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .form-group input, .form-group select {
      width: 100%; padding: 10px 14px; border: 1px solid var(--border);
      border-radius: 8px; font-size: 14px; outline: none;
      background: var(--input-bg);
      color: var(--text);
    }
    .form-group input:focus, .form-group select:focus {
      border-color: var(--navy); box-shadow: 0 0 0 3px rgba(29,58,110,0.1);
    }
    .btn-save {
      padding: 10px 24px; background: var(--navy); color: #fff;
      border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
      cursor: pointer;
    }
    .btn-save:hover { background: #162d57; }
    .btn-danger {
      padding: 6px 12px; background: transparent; color: #ef4444;
      border: 1px solid #ef4444; border-radius: 6px; font-size: 12px;
      cursor: pointer;
    }
    .btn-sm {
      padding: 6px 14px; font-size: 12px; border-radius: 6px;
      border: none; cursor: pointer; font-weight: 600;
    }

    /* -- Hamburger menu button (mobile) -- */
    .hamburger {
      display: none;
      position: fixed;
      top: 14px;
      left: 14px;
      z-index: 200;
      background: var(--navy);
      border: none;
      border-radius: 8px;
      padding: 10px;
      cursor: pointer;
      color: #fff;
      width: 42px;
      height: 42px;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .hamburger svg { display: block; }
    .hamburger:hover { background: #162d57; }

    /* -- Sidebar overlay backdrop (mobile) -- */
    .sidebar-backdrop {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 99;
    }
    .sidebar-backdrop.active { display: block; }

    /* -- Mobile responsive -- */
    @media (max-width: 768px) {
      .hamburger { display: flex; }

      .sidebar {
        transform: translateX(-100%);
        transition: transform 0.3s ease;
      }
      .sidebar.open { transform: translateX(0); }

      .main {
        margin-left: 0;
        max-width: 100%;
        padding: 72px 16px 24px;
      }

      .page-header h2 { font-size: 20px; }

      .stats-grid {
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
      }
      .stat-card { padding: 16px; }
      .stat-card .stat-value { font-size: 24px; }

      .pipeline-card { padding: 16px; }
      .pipeline-stages { height: 36px; }
      .pipeline-labels { gap: 10px; }

      .two-col { grid-template-columns: 1fr; }

      .chart-wrap { height: 200px; padding: 14px; }

      .filter-bar { gap: 6px; }
      .filter-btn { padding: 6px 12px; font-size: 12px; }

      thead th { padding: 8px 10px; font-size: 10px; }
      tbody td { padding: 10px; font-size: 12px; }

      .form-row { flex-direction: column; gap: 0; }
      .settings-card { padding: 16px; }

      .modal-box { margin: 16px; padding: 24px; }

      .card-header { padding: 14px 16px 10px; }
      .card-header h3 { font-size: 14px; }

      .activity-item { padding: 10px 14px; }
    }
  </style>
  <script>
    // Apply persisted theme before paint to avoid a flash
    (function() {
      try {
        var t = localStorage.getItem('lex_admin_theme');
        if (t === 'dark') document.documentElement.dataset.theme = 'dark';
      } catch (e) {}
    })();
  </script>
</head>
<body>

<!-- -- Hamburger button (mobile) -- -->
<button class="hamburger" id="hamburger-btn" aria-label="Toggle menu" onclick="toggleSidebar()">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
</button>
<div class="sidebar-backdrop" id="sidebar-backdrop" onclick="closeSidebar()"></div>

<!-- -- Sidebar -- -->
<aside class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <h1>LEX Referral</h1>
    <p>Admin Dashboard</p>
    ${currentUser ? `
      <div class="sidebar-user">
        <span class="sidebar-user__name">${currentUser.name}</span>
        <span class="sidebar-user__role sidebar-user__role--${currentUser.role}">${currentUser.role === 'super_admin' ? 'Super Admin' : currentUser.role === 'admin' ? 'Admin' : 'Viewer'}</span>
      </div>
    ` : ''}
  </div>
  <nav class="sidebar-nav">
    ${navItems.map(n => `
      <a href="${n.href}" class="${n.id === activeTab ? 'active' : ''}">${n.label}</a>
    `).join('')}
  </nav>
  <div class="sidebar-footer">
    <button class="sidebar-theme-toggle" type="button" onclick="toggleTheme()">
      <span class="sidebar-theme-toggle__label">Theme</span>
      <span class="sidebar-theme-toggle__value" id="theme-toggle-value">Light</span>
    </button>
    <a href="/admin/logout">Sign Out</a>
  </div>
</aside>

<!-- -- Main -- -->
<main class="main">

  ${renderStatusStrip(systemStatus)}

  ${activeTab === 'overview' ? renderOverview({ stats, referrals, topReferrers, recentActivity, timeline, systemStatus, trendLabels, trendCreated, trendRewarded }) : ''}
  ${activeTab === 'referrals' ? renderReferralsTab(referrals, canWrite) : ''}
  ${activeTab === 'customers' ? renderReferrersTab(topReferrers, allCustomers || [], canWrite, customersTotalCount || 0) : ''}
  ${activeTab === 'activity'  ? renderActivityTab(timeline || []) : ''}
  ${activeTab === 'settings'  ? renderSettingsTab(settings || {}, adminUsers || []) : ''}

</main>

<!-- Payout Modal -->
<div class="modal-overlay" id="payout-modal">
  <div class="modal-box">
    <h3>Record Payout</h3>
    <p style="font-size:13px; color:var(--muted); margin-bottom:20px;" id="payout-modal-info"></p>
    <input type="hidden" id="payout-referral-id" />
    <label>Payment Method</label>
    <select id="payout-method">
      <option value="physical_card">Physical Gift Card (mailed)</option>
      <option value="virtual_card">Virtual Gift Card (emailed)</option>
    </select>
    <label>Amount ($)</label>
    <input type="number" id="payout-amount" step="0.01" min="1" />
    <label>Reference Note (optional)</label>
    <textarea id="payout-note" rows="2" placeholder="e.g. Visa card #1234, sent 3/31"></textarea>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closePayoutModal()">Cancel</button>
      <button class="btn-primary" id="payout-submit-btn" onclick="submitPayout()">Record Payout</button>
    </div>
  </div>
</div>

<script>
// -- Theme-aware chart defaults --
const __isDark = document.documentElement.dataset.theme === 'dark';
const __chartGridColor = __isDark ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9';
if (window.Chart) {
  Chart.defaults.color = __isDark ? '#cbd5e1' : '#475569';
  Chart.defaults.borderColor = __chartGridColor;
}

// -- Trend chart (overview only) --
const trendCtx = document.getElementById('trendChart');
if (trendCtx) {
  new Chart(trendCtx, {
    type: 'bar',
    data: {
      labels: ${trendLabels},
      datasets: [
        {
          label: 'Referrals Created',
          data: ${trendCreated},
          backgroundColor: 'rgba(29, 58, 110, 0.15)',
          borderColor: 'rgba(29, 58, 110, 0.8)',
          borderWidth: 2,
          borderRadius: 6,
        },
        {
          label: 'Rewarded',
          data: ${trendRewarded},
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          borderColor: 'rgba(16, 185, 129, 0.8)',
          borderWidth: 2,
          borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 12 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: __chartGridColor } },
        x: { grid: { display: false } }
      }
    }
  });
}

// -- Status donut (overview only) --
const donutCtx = document.getElementById('statusDonut');
if (donutCtx) {
  const counts = ${JSON.stringify(stats.statusCounts)};
  new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: ['Pending', 'Booked', 'Completed', 'Rewarded', 'Rejected'],
      datasets: [{
        data: [counts.pending, counts.booked, counts.completed, counts.rewarded, counts.rejected],
        backgroundColor: ['#f59e0b','#3b82f6','#8b5cf6','#10b981','#ef4444'],
        borderWidth: 0,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12 } }
      }
    }
  });
}

// -- Payout modal --
function openPayoutModal(referralId, referrerName, amount) {
  document.getElementById('payout-referral-id').value = referralId;
  document.getElementById('payout-modal-info').textContent = 'Paying ' + referrerName + ' for this referral';
  document.getElementById('payout-amount').value = amount || 0;
  document.getElementById('payout-modal').classList.add('active');
}

function closePayoutModal() {
  document.getElementById('payout-modal').classList.remove('active');
}

async function submitPayout() {
  const id = document.getElementById('payout-referral-id').value;
  const payment_method = document.getElementById('payout-method').value;
  const amount = document.getElementById('payout-amount').value;
  const reference_note = document.getElementById('payout-note').value;

  const btn = document.getElementById('payout-submit-btn');
  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    const res = await fetch('/admin/api/referral/' + id + '/payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_method, amount, reference_note }),
    });
    const data = await res.json();

    if (data.success) {
      closePayoutModal();
      const row = document.getElementById('row-' + id);
      if (row) {
        const statusCell = row.querySelector('td:nth-child(4)');
        const rewardCell = document.getElementById('reward-cell-' + id);
        const actionCell = row.querySelector('td:last-child');
        const methodLabel = payment_method === 'physical_card' ? 'Physical card' : 'Virtual card';

        statusCell.innerHTML = '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;color:#10b981;background:#d1fae5;">Rewarded</span>';
        rewardCell.innerHTML = '<span style="color:var(--green);font-weight:600;">$' + data.payoutAmount + '</span><div style="font-size:12px;color:var(--muted);margin-top:2px;">' + methodLabel + '</div>';
        actionCell.innerHTML = '';
        row.style.background = '#f0fdf4';
        setTimeout(function() { row.style.background = ''; }, 2000);
      }
      // Remove banner if no more completed referrals
      var remaining = document.querySelectorAll('button[onclick^="openPayoutModal"]').length;
      if (remaining === 0) {
        var banner = document.querySelector('[style*="fffbeb"]');
        if (banner) banner.remove();
      }
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Request failed: ' + err.message);
  } finally {
    btn.textContent = 'Record Payout';
    btn.disabled = false;
  }
}

// -- Funnel mode toggle (Overview "Funnel — last 24h" card) --
function setFunnelMode(mode) {
  document.querySelectorAll('[data-funnel-mode]').forEach(function(el) {
    el.style.display = el.getAttribute('data-funnel-mode') === mode ? '' : 'none';
  });
  document.querySelectorAll('[data-funnel-mode-btn]').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-funnel-mode-btn') === mode);
  });
}

// -- System status panel toggle --
function toggleStatusPanel(id) {
  const target = document.getElementById(id);
  if (!target) return;
  document.querySelectorAll('.status-panel').forEach(function(p) {
    if (p !== target) p.classList.remove('open');
  });
  target.classList.toggle('open');
}

// -- Mobile sidebar toggle --
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('active');
}
document.querySelectorAll('.sidebar-nav a, .sidebar-footer a').forEach(function(link) {
  link.addEventListener('click', closeSidebar);
});

// -- Theme toggle --
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }
  var label = document.getElementById('theme-toggle-value');
  if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
}
function toggleTheme() {
  var current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  var next = current === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('lex_admin_theme', next); } catch (e) {}
  applyTheme(next);
}
applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
</script>
</body>
</html>`;
}

function renderFunnelSnapshot(systemStatus) {
  const t = systemStatus?.tracking || {};
  const referralCounts = t.countsReferral || t.counts || {};
  const allCounts      = t.countsAll      || t.counts || {};
  const rows = [
    { label: 'Portal views',         key: 'portal_view',              dot: 'portal' },
    { label: 'Share clicks',         key: 'share',                    dot: 'share'  },
    { label: 'Link clicks',          key: 'link_click',               dot: 'click'  },
    { label: 'Scheduler opened',     key: 'scheduler_opened',         dot: 'funnel' },
    { label: 'Slot selected',        key: 'slot_selected',            dot: 'funnel' },
    { label: 'Info submitted',       key: 'customer_info_submitted',  dot: 'funnel' },
    { label: 'Booking confirmed',    key: 'booking_confirmed',        dot: 'funnel' },
  ];
  const sum = (c) => rows.reduce((acc, r) => acc + (c[r.key] || 0), 0);
  const totalReferral = sum(referralCounts);
  const totalAll      = sum(allCounts);

  const renderRow = (r, c) => {
    const n = c[r.key] || 0;
    return `
      <div style="display:flex; align-items:center; justify-content:space-between;
                  padding:10px 14px; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="activity-dot ${r.dot}" style="width:10px; height:10px; padding:0; font-size:0;"></span>
          <span style="font-size:13px;">${r.label}</span>
        </div>
        <span style="font-weight:700; font-size:15px; color:${n > 0 ? 'var(--text)' : 'var(--muted)'};">${n}</span>
      </div>
    `;
  };

  return `
    <div class="card">
      <div class="card-header">
        <h3>Funnel — last 24h</h3>
        <div style="display:flex; gap:6px;">
          <button type="button" class="funnel-mode-btn active" data-funnel-mode-btn="referrals"
                  onclick="setFunnelMode('referrals')"
                  title="Events tied to a referral code">Referrals · ${totalReferral}</button>
          <button type="button" class="funnel-mode-btn" data-funnel-mode-btn="all"
                  onclick="setFunnelMode('all')"
                  title="All scheduler / portal activity, including anonymous">All · ${totalAll}</button>
        </div>
      </div>
      <div data-funnel-mode="referrals" style="padding: 6px 4px 14px;">
        ${rows.map(r => renderRow(r, referralCounts)).join('')}
      </div>
      <div data-funnel-mode="all" style="padding: 6px 4px 14px; display:none;">
        ${rows.map(r => renderRow(r, allCounts)).join('')}
      </div>
    </div>
  `;
}

function renderOverview({ stats, referrals, topReferrers, recentActivity, timeline, systemStatus, trendLabels, trendCreated, trendRewarded }) {
  const total = stats.total || 1;
  const stages = [
    { key: 'pending',   count: stats.statusCounts.pending   },
    { key: 'booked',    count: stats.statusCounts.booked    },
    { key: 'completed', count: stats.statusCounts.completed },
    { key: 'rewarded',  count: stats.statusCounts.rewarded  },
    { key: 'rejected',  count: stats.statusCounts.rejected  },
  ];

  return `
    <div class="page-header">
      <h2>Overview</h2>
      <p>All-time referral program performance</p>
    </div>

    ${stats.statusCounts.completed > 0 ? `
    <div style="
      background:#fffbeb; border:1.5px solid #f59e0b; border-radius:12px;
      padding:14px 20px; margin-bottom:24px;
      display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
    ">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">&#127873;</span>
        <span style="font-weight:600;color:#92400e;">
          ${stats.statusCounts.completed} referral${stats.statusCounts.completed > 1 ? 's' : ''} ready to pay out
        </span>
      </div>
      <a href="/admin/referrals?status=completed" style="
        padding:7px 16px; background:#f59e0b; color:#fff;
        border-radius:8px; text-decoration:none; font-size:13px; font-weight:600; white-space:nowrap;
      ">Review now</a>
    </div>
    ` : ''}

    <!-- KPI cards -->
    <div class="stats-grid">
      <div class="stat-card navy">
        <div class="stat-label">Active Referrals</div>
        <div class="stat-value">${stats.activeReferrals}</div>
        <div class="stat-sub">${stats.pendingReferrals} pending link click${stats.pendingReferrals === 1 ? '' : 's'}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Rewards Paid</div>
        <div class="stat-value">${formatCurrency(stats.totalRewardsPaid)}</div>
        <div class="stat-sub">${stats.statusCounts.rewarded} payouts</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Referral Revenue</div>
        <div class="stat-value">${formatCurrency(stats.referralRevenue)}</div>
        <div class="stat-sub">Across ${stats.referralRevenueJobs} referred job${stats.referralRevenueJobs === 1 ? '' : 's'}</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label">Conversion Rate</div>
        <div class="stat-value">${stats.conversionRate}%</div>
        <div class="stat-sub">Referred to Rewarded</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Customers Enrolled</div>
        <div class="stat-value">${stats.totalCustomers.toLocaleString()}</div>
        <div class="stat-sub">Have a referral link</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Texts This Month</div>
        <div class="stat-value">${stats.textsSentMonth}</div>
        <div class="stat-sub">Via Chiirp</div>
      </div>
    </div>

    <!-- Pipeline bar -->
    <div class="pipeline-card">
      <h3>Referral Pipeline</h3>
      <div class="pipeline-stages">
        ${stages.map(s => {
          const flex = s.count > 0 ? Math.max(s.count / total, 0.05) : 0.02;
          return `<div class="pipeline-stage ${s.key}" style="flex:${flex}" title="${s.key}: ${s.count}">
            ${s.count > 0 ? s.count : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="pipeline-labels">
        ${stages.map(s => `
          <div class="pipeline-legend">
            <div class="pipeline-legend-dot" style="background:${
              {pending:'#f59e0b',booked:'#3b82f6',completed:'#8b5cf6',rewarded:'#10b981',rejected:'#ef4444'}[s.key]
            }"></div>
            ${s.key.charAt(0).toUpperCase() + s.key.slice(1)}: <strong>${s.count}</strong>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Charts row -->
    <div class="two-col">
      <div class="card">
        <div class="card-header"><h3>Monthly Trend</h3></div>
        <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Status Breakdown</h3></div>
        <div class="chart-wrap"><canvas id="statusDonut"></canvas></div>
      </div>
    </div>

    <!-- Bottom row: funnel snapshot + live activity -->
    <div class="two-col">

      ${renderFunnelSnapshot(systemStatus, stats)}

      <div class="card">
        <div class="card-header">
          <h3>Live Activity</h3>
          <a href="/admin/activity">View all</a>
        </div>
        <div class="activity-list">
          ${(() => {
            const filtered = (timeline || []).filter(item => !isAnonymousItem(item)).slice(0, 8);
            return filtered.length
              ? filtered.map(renderTimelineItem).join('')
              : '<div class="empty-state"><p>No referral activity yet</p></div>';
          })()}
        </div>
      </div>

    </div>
  `;
}

function renderReferralsTab(referrals, canWrite = true) {
  const statuses = ['all', 'pending', 'booked', 'completed', 'rewarded', 'rejected'];
  const needsReward = referrals.filter(r => r.status === 'completed');

  return `
    <div class="page-header">
      <h2>All Referrals</h2>
      <p>Every referral record in the system</p>
    </div>

    ${needsReward.length > 0 ? `
    <div style="
      background: #fffbeb;
      border: 1.5px solid #f59e0b;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    ">
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:24px;">&#127873;</span>
        <div>
          <div style="font-weight:700; color:#92400e; font-size:15px;">
            ${needsReward.length} referral${needsReward.length > 1 ? 's' : ''} need${needsReward.length === 1 ? 's' : ''} a payout
          </div>
          <div style="font-size:13px; color:#b45309; margin-top:2px;">
            These jobs are complete and qualify — record payout details below.
          </div>
        </div>
      </div>
      <a href="/admin/referrals?status=completed" style="
        padding: 8px 18px;
        background: #f59e0b;
        color: #fff;
        border-radius: 8px;
        text-decoration: none;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
      ">View ${needsReward.length} pending</a>
    </div>
    ` : ''}

    <div class="filter-bar">
      ${statuses.map(s => {
        const count = s === 'completed' && needsReward.length > 0
          ? ` <span style="background:#f59e0b;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px;">${needsReward.length}</span>`
          : '';
        return `
          <a href="/admin/referrals${s !== 'all' ? '?status=' + s : ''}"
             class="filter-btn">${s.charAt(0).toUpperCase() + s.slice(1)}${count}</a>
        `;
      }).join('')}
    </div>

    <div style="margin-bottom: 16px;">
      <input
        type="text"
        id="referral-search"
        placeholder="Search by name, phone, or email\u2026"
        oninput="filterReferralRows()"
        style="
          width: 100%;
          max-width: 400px;
          padding: 10px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        "
        onfocus="this.style.borderColor='#3b82f6'"
        onblur="this.style.borderColor='#e2e8f0'"
      />
    </div>

    <div class="card">
      <div class="card-body table-wrap">
        <table id="referrals-table">
          <thead><tr>
            <th>Referrer</th>
            <th>Referred Person</th>
            <th>Job Value</th>
            <th>Status</th>
            <th>Reward</th>
            <th>Date</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${referrals.map(r => `
              <tr id="row-${r.id}">
                <td>
                  <div class="td-name">${r.referrer?.name || '—'}</div>
                  <div class="td-sub">${r.referrer?.phone || ''}</div>
                  ${r.referrer?.email ? `<div class="td-sub">${r.referrer.email}</div>` : ''}
                </td>
                <td>
                  <div class="td-name">${
                    r.referred_name
                      ? r.referred_name
                      : (r.status === 'pending'
                          ? '(not yet booked)'
                          : '(name pending)')
                  }</div>
                  <div class="td-sub">${r.referred_phone || r.referred_email || ''}</div>
                </td>
                <td>${r.referred_job_value ? formatCurrency(r.referred_job_value) : '—'}</td>
                <td>
                  ${statusBadge(r.status)}
                  ${r.rejection_reason ? `<div class="td-sub" style="color:#ef4444;margin-top:3px;">${r.rejection_reason}</div>` : ''}
                </td>
                <td id="reward-cell-${r.id}">
                  ${r.status === 'rewarded'
                    ? `<span style="color:var(--green);font-weight:600;">${formatCurrency(r.reward_amount)} paid</span>`
                    : r.status === 'completed'
                      ? `<span style="color:var(--muted);">${formatCurrency(r.reward_amount)} pending</span>`
                      : '—'
                  }
                </td>
                <td style="color:var(--muted);white-space:nowrap;">${formatDate(r.created_at)}</td>
                <td style="white-space:nowrap;">
                  ${r.status === 'completed' && canWrite ? `
                    <button
                      onclick="openPayoutModal('${r.id}', '${(r.referrer?.name || '').replace(/'/g, "\\'")}', ${r.reward_amount || 0})"
                      style="
                        padding: 6px 14px;
                        background: var(--green);
                        color: #fff;
                        border: none;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        margin-right: 6px;
                      "
                    >Record Payout</button>
                    <button
                      onclick="markRejected('${r.id}')"
                      style="
                        padding: 6px 10px;
                        background: transparent;
                        color: #ef4444;
                        border: 1px solid #ef4444;
                        border-radius: 6px;
                        font-size: 12px;
                        cursor: pointer;
                      "
                    >Reject</button>
                  ` : (r.status === 'completed' ? '<span style="font-size:12px; color:var(--muted);">Awaiting payout</span>' : '')}
                </td>
              </tr>
            `).join('') || `
              <tr><td colspan="7">
                <div class="empty-state">
                  <p>No referrals found</p>
                </div>
              </td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>

    <script>
    function filterReferralRows() {
      var q = document.getElementById('referral-search').value.toLowerCase();
      var rows = document.getElementById('referrals-table').querySelectorAll('tbody tr');
      rows.forEach(function(row) {
        var text = row.textContent.toLowerCase();
        row.style.display = text.indexOf(q) !== -1 ? '' : 'none';
      });
    }

    async function markRejected(id) {
      const reason = prompt('Reason for rejection (required):');
      if (!reason || !reason.trim()) return;

      const res = await fetch('/admin/api/referral/' + id + '/mark-rejected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();

      if (data.success) {
        const row = document.getElementById('row-' + id);
        const statusCell = row.querySelector('td:nth-child(4)');
        const actionCell = row.querySelector('td:last-child');
        statusCell.innerHTML = '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;color:#ef4444;background:#fee2e2;">Rejected</span><div style="font-size:12px;color:#ef4444;margin-top:3px;">' + reason + '</div>';
        actionCell.innerHTML = '';
        row.style.background = '#fff1f2';
        setTimeout(function() { row.style.background = ''; }, 2000);
      } else {
        alert('Error: ' + (data.error || 'Unknown error'));
      }
    }
    </script>
  `;
}

function renderReferrersTab(topReferrers, allCustomers, canWrite = true, customersTotalCount = 0) {
  const customers = allCustomers || [];
  const totalCount = customersTotalCount || customers.length;
  return `
    <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap;">
      <div>
        <h2>Customers</h2>
        <p>All enrolled customers — search by name, phone, email, or referral code</p>
      </div>
      ${canWrite ? `
        <button type="button" onclick="openEnrollModal()" style="
          padding:10px 18px; background:var(--navy); color:#fff;
          border:none; border-radius:8px; font-size:13px; font-weight:600;
          cursor:pointer; white-space:nowrap; font-family:inherit;
        ">+ Enroll customer</button>
      ` : ''}
    </div>

    ${topReferrers.length > 0 ? `
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header"><h3>Top Referrers</h3></div>
        <div class="card-body table-wrap">
          <table>
            <thead><tr>
              <th>#</th>
              <th>Customer</th>
              <th>Referrals</th>
              <th>Total Earned</th>
              <th>Code</th>
            </tr></thead>
            <tbody>
              ${topReferrers.map((c, i) => `
                <tr>
                  <td style="font-weight:700; color:var(--muted);">${i + 1}</td>
                  <td>
                    <div class="td-name">${c.name}</div>
                    <div class="td-sub">${c.phone || c.email || ''}</div>
                  </td>
                  <td><span style="font-weight:700;font-size:16px;">${c.total_referrals}</span></td>
                  <td style="font-weight:600;color:var(--green);">${formatCurrency(c.total_rewards)}</td>
                  <td>${c.referral_code ? `<code style="font-size:12px;background:var(--code-bg);padding:3px 8px;border-radius:4px;font-weight:600;">${c.referral_code}</code>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <h3>All Customers <span style="color:var(--muted);font-weight:500;font-size:13px;" id="customers-count">(${totalCount.toLocaleString()} total)</span></h3>
        <input
          type="search"
          id="customers-search"
          placeholder="Search all ${totalCount.toLocaleString()} customers by name, phone, email, or code..."
          style="
            padding:8px 14px; border:1px solid var(--border); border-radius:8px;
            font-size:13px; width:280px; max-width:100%;
            background:var(--input-bg); color:var(--text); outline:none;
          "
          oninput="filterCustomers(this.value)"
        />
      </div>
      <div class="card-body table-wrap">
        <table id="customers-table">
          <thead><tr>
            <th>Customer</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Code</th>
            <th>Link</th>
            <th>Referrals</th>
            <th>Earned</th>
            <th>Payouts</th>
            <th>Enrolled</th>
          </tr></thead>
          <tbody id="customers-tbody">
            ${customers.map(c => {
              const haystack = [c.name, c.phone, c.email, c.referral_code, c.st_customer_id]
                .filter(Boolean).join(' ').toLowerCase().replace(/"/g, '&quot;');
              return `
              <tr data-search="${haystack}" id="customer-row-${c.id}">
                <td>
                  <div class="td-name">${c.name}${c.payout_eligible === false ? ` <span style="display:inline-block;margin-left:6px;padding:1px 7px;background:#fee2e2;color:#991b1b;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.04em;">INELIGIBLE</span>` : ''}</div>
                  ${c.st_customer_id ? `<div class="td-sub">ST: ${c.st_customer_id}</div>` : ''}
                </td>
                <td style="white-space:nowrap;">${formatPhone(c.phone)}</td>
                <td>${c.email || '—'}</td>
                <td>
                  ${c.referral_code ? `
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                      <code style="font-size:12px;background:var(--code-bg);padding:3px 8px;border-radius:4px;font-weight:600;">${c.referral_code}</code>
                      <button type="button" onclick="copyToClipboard('${c.referral_code}', this)"
                              style="background:none;border:0;cursor:pointer;font-size:12px;color:var(--muted);"
                              title="Copy code">📋</button>
                    </span>` : '—'}
                </td>
                <td>
                  ${c.referral_link ? `
                    <div style="display:flex;gap:4px;flex-wrap:nowrap;">
                      <button type="button" onclick="copyToClipboard('${c.referral_link.replace(/'/g, "\\'")}', this)"
                              style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;color:var(--text);"
                              title="Copy link">Copy link</button>
                      ${canWrite ? `<button type="button" onclick="resendInvite('${c.id}', this)"
                              style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;color:var(--text);"
                              title="Resend Chiirp invite text + email">📨</button>` : ''}
                    </div>` : '—'}
                </td>
                <td style="text-align:center;">${c.total_referrals || 0}</td>
                <td style="font-weight:600;color:${c.total_rewards > 0 ? 'var(--green)' : 'var(--muted)'};">${formatCurrency(c.total_rewards || 0)}</td>
                <td style="white-space:nowrap;" id="eligibility-cell-${c.id}">
                  ${canWrite
                    ? `<button type="button"
                              onclick="toggleEligibility('${c.id}', ${c.payout_eligible !== false}, this)"
                              style="background:${c.payout_eligible === false ? '#10b981' : 'transparent'};
                                     color:${c.payout_eligible === false ? '#fff' : 'var(--text)'};
                                     border:1px solid ${c.payout_eligible === false ? '#10b981' : 'var(--border)'};
                                     border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; font-weight:600;"
                              title="${c.payout_eligible === false ? 'Re-enable payouts' : 'Mark as not eligible for payouts'}">${c.payout_eligible === false ? 'Make eligible' : 'Eligible'}</button>`
                    : `<span style="color:${c.payout_eligible === false ? '#991b1b' : 'var(--green)'}; font-weight:600;">${c.payout_eligible === false ? 'Ineligible' : 'Eligible'}</span>`}
                </td>
                <td style="color:var(--muted);white-space:nowrap;">${formatDate(c.created_at)}</td>
              </tr>
            `;
            }).join('') || `
              <tr><td colspan="9">
                <div class="empty-state"><p>No customers yet — they'll appear here as soon as the poller enrolls them.</p></div>
              </td></tr>
            `}
          </tbody>
        </table>
        <div id="customers-empty" style="display:none; padding:40px 20px; text-align:center; color:var(--muted);">
          No customers match your search.
        </div>
        <div id="customers-pagination" style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-top:1px solid var(--border); gap:12px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted);">
            <span>Show</span>
            <select id="customers-page-size" onchange="customersChangePageSize(this.value)"
                    style="padding:4px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px; background:var(--input-bg); color:var(--text);">
              <option value="25">25</option>
              <option value="50" selected>50</option>
              <option value="100">100</option>
              <option value="250">250</option>
            </select>
            <span id="customers-page-info">—</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" id="customers-first" onclick="customersGoTo(1)"
                    style="padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:var(--card); color:var(--text); cursor:pointer; font-size:12px;">«</button>
            <button type="button" id="customers-prev" onclick="customersChangePage(-1)"
                    style="padding:6px 12px; border:1px solid var(--border); border-radius:6px; background:var(--card); color:var(--text); cursor:pointer; font-size:13px;">Prev</button>
            <span id="customers-page-of" style="display:inline-flex; align-items:center; padding:0 10px; font-size:13px; color:var(--muted);">Page 1</span>
            <button type="button" id="customers-next" onclick="customersChangePage(1)"
                    style="padding:6px 12px; border:1px solid var(--border); border-radius:6px; background:var(--card); color:var(--text); cursor:pointer; font-size:13px;">Next</button>
            <button type="button" id="customers-last" onclick="customersGoTo(-1)"
                    style="padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:var(--card); color:var(--text); cursor:pointer; font-size:12px;">»</button>
          </div>
        </div>
      </div>
    </div>

    <script>
      var __searchTimer = null;
      var __searchMode = false;
      var __canWrite = ${canWrite};

      function filterCustomers(query) {
        clearTimeout(__searchTimer);
        var q = (query || '').trim();
        if (q.length < 2) {
          if (__searchMode) __restoreDefaultView();
          return;
        }
        document.getElementById('customers-page-info').textContent = 'Searching…';
        __searchTimer = setTimeout(function() { __serverSearch(q); }, 300);
      }

      function __serverSearch(q) {
        fetch('/admin/api/customers/search?q=' + encodeURIComponent(q))
          .then(function(r) { return r.json(); })
          .then(function(results) {
            __searchMode = true;
            var tbody = document.getElementById('customers-tbody');
            var emptyEl = document.getElementById('customers-empty');
            var tableEl = document.getElementById('customers-table');
            var pagerEl = document.getElementById('customers-pagination');

            if (!results.length) {
              tbody.innerHTML = '';
              emptyEl.style.display = 'block';
              tableEl.style.display = 'none';
              pagerEl.style.display = 'none';
            } else {
              tbody.innerHTML = results.map(function(c) {
                return __renderCustomerRow(c);
              }).join('');
              emptyEl.style.display = 'none';
              tableEl.style.display = '';
              pagerEl.style.display = 'none';
            }
            document.getElementById('customers-count').textContent = '(' + results.length + ' results)';
          })
          .catch(function() {
            document.getElementById('customers-page-info').textContent = 'Search failed';
          });
      }

      function __restoreDefaultView() {
        __searchMode = false;
        location.reload();
      }

      function __renderCustomerRow(c) {
        var ineligible = c.payout_eligible === false;
        return '<tr>' +
          '<td><div class="td-name">' + __esc(c.name) +
            (ineligible ? ' <span style="display:inline-block;margin-left:6px;padding:1px 7px;background:#fee2e2;color:#991b1b;border-radius:999px;font-size:10px;font-weight:700;">INELIGIBLE</span>' : '') +
            '</div>' +
            (c.st_customer_id ? '<div class="td-sub">ST: ' + __esc(c.st_customer_id) + '</div>' : '') +
          '</td>' +
          '<td style="white-space:nowrap;">' + __fmtPhone(c.phone) + '</td>' +
          '<td>' + (c.email || '—') + '</td>' +
          '<td>' + (c.referral_code
            ? '<span style="display:inline-flex;align-items:center;gap:6px;">' +
              '<code style="font-size:12px;background:var(--code-bg);padding:3px 8px;border-radius:4px;font-weight:600;">' + c.referral_code + '</code>' +
              '<button type="button" onclick="copyToClipboard(\\'' + c.referral_code + '\\', this)" style="background:none;border:0;cursor:pointer;font-size:12px;color:var(--muted);" title="Copy code">📋</button>' +
              '</span>' : '—') +
          '</td>' +
          '<td>' + (c.referral_link
            ? '<button type="button" onclick="copyToClipboard(\\'' + __esc(c.referral_link).replace(/'/g, "\\\\'") + '\\', this)" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;color:var(--text);">Copy link</button>'
            : '—') +
          '</td>' +
          '<td style="text-align:center;">' + (c.total_referrals || 0) + '</td>' +
          '<td style="font-weight:600;color:' + (c.total_rewards > 0 ? 'var(--green)' : 'var(--muted)') + ';">$' + (parseFloat(c.total_rewards || 0)).toLocaleString() + '</td>' +
          '<td style="white-space:nowrap;">' +
            (__canWrite
              ? '<button type="button" onclick="toggleEligibility(\\'' + c.id + '\\', ' + !ineligible + ', this)" style="background:' + (ineligible ? '#10b981' : 'transparent') + ';color:' + (ineligible ? '#fff' : 'var(--text)') + ';border:1px solid ' + (ineligible ? '#10b981' : 'var(--border)') + ';border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600;">' + (ineligible ? 'Make eligible' : 'Eligible') + '</button>'
              : '<span style="color:' + (ineligible ? '#991b1b' : 'var(--green)') + ';font-weight:600;">' + (ineligible ? 'Ineligible' : 'Eligible') + '</span>') +
          '</td>' +
          '<td style="color:var(--muted);white-space:nowrap;">' + __fmtDate(c.created_at) + '</td>' +
        '</tr>';
      }

      function __esc(s) {
        var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
      }
      function __fmtPhone(raw) {
        if (!raw) return '—';
        var d = String(raw).replace(/\\D/g, '');
        if (d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
        if (d.length === 11 && d[0] === '1') return '(' + d.slice(1,4) + ') ' + d.slice(4,7) + '-' + d.slice(7);
        return raw;
      }
      function __fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
      }
      function copyToClipboard(text, btn) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function() {
            var original = btn.textContent;
            btn.textContent = '✓';
            setTimeout(function() { btn.textContent = original; }, 1200);
          });
        }
      }

      function toggleEligibility(customerId, currentlyEligible, btn) {
        var newEligible = !currentlyEligible;
        var verb = newEligible ? 'allow payouts to' : 'mark as INELIGIBLE for payouts';
        if (!confirm('Are you sure you want to ' + verb + ' this customer?\\n\\nTheir referrals will keep tracking — but ' + (newEligible ? 'completed referred jobs will land in the payout queue.' : 'completed referred jobs will skip the payout queue and be marked rejected.'))) return;
        var original = btn.textContent;
        btn.disabled = true; btn.textContent = '…';
        fetch('/admin/api/customers/' + customerId + '/eligibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eligible: newEligible }),
        })
          .then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
          .then(function(res) {
            if (res.ok && res.body.success) {
              location.reload();
            } else {
              alert('Failed: ' + (res.body.error || 'Unknown error'));
              btn.textContent = original; btn.disabled = false;
            }
          })
          .catch(function(err) {
            alert('Network error: ' + err.message);
            btn.textContent = original; btn.disabled = false;
          });
      }

      function resendInvite(customerId, btn) {
        if (!confirm('Re-send the Chiirp invite text + email for this customer?')) return;
        var original = btn.textContent;
        btn.disabled = true; btn.textContent = '…';
        fetch('/admin/api/customers/' + customerId + '/send-invite', { method: 'POST' })
          .then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
          .then(function(res) {
            if (res.ok && res.body.success) {
              btn.textContent = '✓';
              setTimeout(function() { btn.textContent = original; btn.disabled = false; }, 1500);
            } else {
              alert('Failed: ' + (res.body.error || 'Unknown error'));
              btn.textContent = original; btn.disabled = false;
            }
          })
          .catch(function(err) {
            alert('Network error: ' + err.message);
            btn.textContent = original; btn.disabled = false;
          });
      }

      function openEnrollModal() {
        document.getElementById('enroll-error').style.display = 'none';
        document.getElementById('enroll-name').value = '';
        document.getElementById('enroll-phone').value = '';
        document.getElementById('enroll-email').value = '';
        document.getElementById('enroll-st-id').value = '';
        document.getElementById('enroll-send-invite').checked = true;
        document.getElementById('enroll-modal').classList.add('active');
        setTimeout(function() { document.getElementById('enroll-name').focus(); }, 50);
      }
      function closeEnrollModal() {
        document.getElementById('enroll-modal').classList.remove('active');
      }
      function submitEnroll() {
        var name = document.getElementById('enroll-name').value.trim();
        var phone = document.getElementById('enroll-phone').value.trim();
        var email = document.getElementById('enroll-email').value.trim();
        var stId = document.getElementById('enroll-st-id').value.trim();
        var sendInvite = document.getElementById('enroll-send-invite').checked;
        var errEl = document.getElementById('enroll-error');
        errEl.style.display = 'none';

        if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
        if (phone.replace(/\\D/g, '').length !== 10) { errEl.textContent = 'Phone must be 10 digits.'; errEl.style.display = 'block'; return; }

        var btn = document.getElementById('enroll-submit-btn');
        btn.disabled = true; btn.textContent = 'Enrolling…';

        fetch('/admin/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name, phone: phone, email: email || null,
            st_customer_id: stId || null,
            send_invite: sendInvite,
          }),
        })
          .then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
          .then(function(res) {
            if (res.ok && res.body.success) {
              var c = res.body.customer;
              var notes = [];
              notes.push('Code: ' + c.referral_code);
              if (sendInvite) notes.push(res.body.chiirpResult ? 'Chiirp invite fired ✓' : 'Chiirp invite failed — check logs');
              if (res.body.stWriteResult === true)  notes.push('ST custom field updated ✓');
              if (res.body.stWriteResult === false) notes.push('ST write-back failed — check logs');
              alert(c.name + ' enrolled.\\n\\n' + notes.join('\\n'));
              location.reload();
            } else {
              errEl.textContent = res.body.error || 'Unknown error';
              errEl.style.display = 'block';
              btn.disabled = false; btn.textContent = 'Enroll customer';
            }
          })
          .catch(function(err) {
            errEl.textContent = 'Network error: ' + err.message;
            errEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Enroll customer';
          });
      }
    </script>

    <!-- Enroll customer modal -->
    <div class="modal-overlay" id="enroll-modal">
      <div class="modal-box">
        <h3>Manually enroll a customer</h3>
        <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">
          Generates a referral code and inserts the customer. If you provide a real ServiceTitan customer ID, we'll write the code back to the ST record.
        </p>
        <div id="enroll-error" style="background:#fee2e2; color:#dc2626; padding:10px 12px; border-radius:8px; font-size:13px; margin-bottom:14px; display:none;"></div>

        <label>Name <span style="color:#dc2626;">*</span></label>
        <input id="enroll-name" type="text" placeholder="Sarah Mitchell" autocomplete="off" />

        <label>Phone <span style="color:#dc2626;">*</span></label>
        <input id="enroll-phone" type="tel" placeholder="(972) 555-0100" autocomplete="off" />

        <label>Email</label>
        <input id="enroll-email" type="email" placeholder="sarah@example.com" autocomplete="off" />

        <label>ServiceTitan Customer ID <span style="color:var(--muted); font-weight:400;">(optional)</span></label>
        <input id="enroll-st-id" type="text" placeholder="123456789 — leave blank for manual-only" autocomplete="off" />

        <label style="display:flex; align-items:center; gap:8px; margin-top:14px; cursor:pointer;">
          <input id="enroll-send-invite" type="checkbox" checked style="width:auto; margin:0;" />
          <span style="font-weight:400; color:var(--text); font-size:13px; text-transform:none; letter-spacing:0;">Send Chiirp invite text + email now</span>
        </label>

        <div class="modal-actions" style="margin-top:18px;">
          <button class="btn-secondary" onclick="closeEnrollModal()">Cancel</button>
          <button class="btn-primary" id="enroll-submit-btn" onclick="submitEnroll()">Enroll customer</button>
        </div>
      </div>
    </div>
  `;
}

function isAnonymousItem(item) {
  return item.kind === 'tracking' && !item.referralCode && !item.referrerName;
}

function classifyTimelineItem(item) {
  if (isAnonymousItem(item)) return 'anonymous';
  if (item.kind === 'referral') {
    if (item.subtype === 'pending') return 'click';
    return 'referral';
  }
  if (item.subtype === 'link_click')  return 'click';
  if (item.subtype === 'portal_view') return 'portal';
  if (item.subtype === 'share')       return 'share';
  return 'funnel';
}

function renderTimelineItem(item) {
  const category = classifyTimelineItem(item);
  const who = item.referrerName ? `<strong>${escapeHtmlText(item.referrerName)}</strong>` : '';
  const code = item.referralCode ? ` <code style="background:var(--code-bg); padding:1px 6px; border-radius:4px; font-size:11px;">${escapeHtmlText(item.referralCode)}</code>` : '';

  let line = '';
  let badge = '';

  if (item.kind === 'referral') {
    const s = item.subtype;
    const friend = item.referredName ? escapeHtmlText(item.referredName) : 'New customer';
    if (s === 'rewarded')  line = `${who} earned ${formatCurrency(item.rewardAmount)} for referring <strong>${friend}</strong>`;
    else if (s === 'booked')    line = `<strong>${friend}</strong> booked their first service — referred by ${who}`;
    else if (s === 'completed') line = `<strong>${friend}</strong>'s job completed — referred by ${who}, awaiting payout`;
    else if (s === 'rejected')  line = `Referral rejected — ${who}`;
    else if (s === 'pending')   line = `${who}'s referral link clicked — awaiting booking`;
    else                        line = `${who} — ${s}`;
    badge = statusBadge(s);
  } else if (isAnonymousItem(item)) {
    switch (item.subtype) {
      case 'scheduler_opened':        line = 'Anonymous visitor opened the scheduler';        break;
      case 'slot_selected':           line = 'Anonymous visitor picked a time slot';         break;
      case 'customer_info_submitted': line = 'Anonymous visitor submitted booking info';     break;
      case 'booking_confirmed':       line = 'Anonymous visitor confirmed a booking';        break;
      case 'link_click':              line = 'Anonymous link click';                          break;
      case 'portal_view':             line = 'Anonymous portal view';                         break;
      case 'share':                   line = `Anonymous share via <strong>${escapeHtmlText(item.channel || 'unknown')}</strong>`; break;
      default:                        line = `Anonymous · ${item.subtype}`;
    }
  } else {
    switch (item.subtype) {
      case 'link_click':
        line = `Friend clicked ${who || 'a referral'} link${code}`;
        break;
      case 'portal_view':
        line = `${who || 'A customer'} viewed their portal${code}`;
        break;
      case 'share':
        line = `${who || 'A customer'} shared via <strong>${escapeHtmlText(item.channel || 'unknown')}</strong>${code}`;
        break;
      case 'scheduler_opened':
        line = `Friend opened the scheduler${code}`;
        break;
      case 'slot_selected':
        line = `Friend picked a time slot${code}`;
        break;
      case 'customer_info_submitted':
        line = `Friend submitted booking info${code}`;
        break;
      case 'booking_confirmed':
        line = `Friend confirmed a booking${code}`;
        break;
      default:
        line = `${item.subtype}${code}`;
    }
  }

  return `
    <div class="activity-item" data-category="${category}">
      <div class="activity-dot ${category}">&#8226;</div>
      <div class="activity-text">
        <p>${line}</p>
        <span>${formatDateTime(item.timestamp)}</span>
      </div>
      <div>${badge}</div>
    </div>
  `;
}

function escapeHtmlText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderActivityTab(timeline) {
  const filters = [
    { id: 'all',       label: 'All' },
    { id: 'referral',  label: 'Referrals' },
    { id: 'click',     label: 'Clicks' },
    { id: 'portal',    label: 'Portal views' },
    { id: 'share',     label: 'Shares' },
    { id: 'funnel',    label: 'Scheduler' },
    { id: 'anonymous', label: 'Anonymous' },
  ];

  return `
    <div class="page-header">
      <h2>Activity Feed</h2>
      <p>Unified timeline — referral state transitions, link clicks, portal views, share actions, and scheduler funnel events.</p>
    </div>

    <div class="filter-bar" id="activity-filter-bar">
      ${filters.map((f, i) => `
        <button type="button"
                class="filter-btn ${i === 0 ? 'active' : ''}"
                data-activity-filter-btn="${f.id}"
                onclick="setActivityFilter('${f.id}')">${f.label}</button>
      `).join('')}
    </div>

    <div class="card">
      <div class="activity-list" id="activity-list" data-activity-filter="all">
        ${timeline.length
          ? timeline.map(renderTimelineItem).join('')
          : '<div class="empty-state"><p>No activity yet</p></div>'}
      </div>
    </div>

    <script>
      function setActivityFilter(id) {
        const list = document.getElementById('activity-list');
        if (id === 'all') list.removeAttribute('data-activity-filter');
        else list.setAttribute('data-activity-filter', id);
        document.querySelectorAll('[data-activity-filter-btn]').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-activity-filter-btn') === id);
        });
      }
    </script>
  `;
}

function renderSettingsTab(settings, adminUsers) {
  const pct = settings.payout_percentage || '5';
  const cap = settings.payout_cap || '250';
  return `
    <div class="page-header">
      <h2>Settings</h2>
      <p>Configure referral program parameters</p>
    </div>

    <!-- Payout Rules -->
    <div class="settings-card">
      <h3>Payout Rules</h3>
      <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">
        Referrer earns <strong>${pct}%</strong> of the referred customer's invoice, capped at <strong>$${cap}</strong>.
      </p>
      <form onsubmit="saveSettings(event)">
        <div class="form-row">
          <div class="form-group">
            <label>Payout Percentage (%)</label>
            <input type="number" id="setting-payout-percentage" value="${pct}" step="0.1" min="0" max="100" />
          </div>
          <div class="form-group">
            <label>Payout Cap ($)</label>
            <input type="number" id="setting-payout-cap" value="${cap}" step="1" min="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Min Job Value ($)</label>
            <input type="number" id="setting-min-job-value" value="${settings.min_job_value || '150'}" step="1" min="0" />
          </div>
          <div class="form-group">
            <label>New Customer Discount ($)</label>
            <input type="number" id="setting-new-customer-discount" value="${settings.new_customer_discount || '50'}" step="1" min="0" />
          </div>
          <div class="form-group">
            <label>Max Poll Lookback (hours)</label>
            <input type="number" id="setting-max-lookback-hours" value="${settings.max_lookback_hours || '24'}" step="1" min="1" max="168" />
            <div style="font-size:12px; color:var(--muted); margin-top:4px;">
              Hard cap on how far back the poller can reach. Protects against a stale cursor accidentally enrolling old customers.
            </div>
          </div>
        </div>

        <h4 style="font-family:'Montserrat',sans-serif; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin:18px 0 10px; padding-top:14px; border-top:1px solid var(--border);">Eligibility Filters</h4>
        <div class="form-row">
          <div class="form-group" style="flex:1 1 100%;">
            <label style="display:flex; align-items:center; gap:8px; text-transform:none; letter-spacing:0;">
              <input type="checkbox" id="setting-residential-only" ${(settings.residential_only ?? 'true') === 'true' ? 'checked' : ''} style="width:auto; margin:0;" />
              <span style="font-weight:500; font-size:13px; color:var(--text);">Residential customers only</span>
            </label>
            <div style="font-size:12px; color:var(--muted); margin-top:4px; padding-left:24px;">
              When checked, only ServiceTitan customers with type = "Residential" are enrolled. Commercial accounts are skipped.
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1 1 100%;">
            <label>Excluded Business Unit IDs</label>
            <input type="text" id="setting-excluded-bu-ids" value="${(settings.excluded_business_unit_ids || '').replace(/"/g, '&quot;')}" placeholder="e.g. 6540, 7698 — leave empty to allow all" />
            <div style="font-size:12px; color:var(--muted); margin-top:4px;">
              Comma-separated ServiceTitan business unit IDs. Jobs whose business unit matches any of these are skipped for enrollment (referral matching still works regardless).
            </div>
          </div>
        </div>

        <h4 style="font-family:'Montserrat',sans-serif; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin:18px 0 10px; padding-top:14px; border-top:1px solid var(--border);">Re-engagement Drip</h4>
        <div class="form-row">
          <div class="form-group" style="flex:1 1 100%;">
            <label>Re-engagement Schedule (days after enrollment)</label>
            <input type="text" id="setting-reengage-days" value="${(settings.reengage_days || '').replace(/"/g, '&quot;')}" placeholder="e.g. 7, 14, 30 — leave empty to disable" />
            <div style="font-size:12px; color:var(--muted); margin-top:4px;">
              Comma-separated list of days. The daily cron fires a Chiirp webhook at each interval for enrolled customers who haven't shared yet, with an <code>event</code> field like <code>reengage_day_7</code>. Filter on that field in your Chiirp campaign. Empty disables.
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Re-engagement Max Age (days)</label>
            <input type="number" id="setting-reengage-max-age-days" value="${settings.reengage_max_age_days || '90'}" step="1" min="1" max="365" />
            <div style="font-size:12px; color:var(--muted); margin-top:4px;">
              Don't re-engage customers enrolled more than this many days ago. Protects against blasting old customers when you turn the drip on.
            </div>
          </div>
        </div>

        <button type="submit" class="btn-save" id="settings-save-btn">Save Settings</button>
      </form>
    </div>

    <!-- User Management -->
    <div class="settings-card">
      <div
        onclick="var body=document.getElementById('users-section-body'); var arrow=document.getElementById('users-arrow'); if(body.style.display==='none'){body.style.display='';arrow.textContent='▾';}else{body.style.display='none';arrow.textContent='▸';}"
        style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"
      >
        <h3 style="margin:0;">User Management</h3>
        <span id="users-arrow" style="font-size:18px; color:var(--muted);">▸</span>
      </div>
      <div id="users-section-body" style="display:none; margin-top:16px;">
        <table style="margin-bottom:20px;">
          <thead><tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${adminUsers.map(u => `
              <tr id="user-${u.id}">
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td>
                  <span style="
                    display:inline-block; padding:3px 10px; border-radius:20px;
                    font-size:12px; font-weight:600;
                    color:${u.role === 'super_admin' ? '#8b5cf6' : u.role === 'admin' ? '#3b82f6' : '#6b7280'};
                    background:${u.role === 'super_admin' ? '#ede9fe' : u.role === 'admin' ? '#dbeafe' : '#f3f4f6'};
                  ">${u.role === 'super_admin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Viewer'}</span>
                </td>
                <td>
                  <span style="color:${u.active ? 'var(--green)' : '#ef4444'};font-weight:600;">
                    ${u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style="color:var(--muted);white-space:nowrap;">${u.last_login_at ? formatDate(u.last_login_at) : 'Never'}</td>
                <td style="white-space:nowrap;">
                  ${u.role !== 'super_admin' ? `
                    <button class="btn-sm" style="background:var(--navy);color:#fff;margin-right:4px;"
                      onclick="editUser('${u.id}', '${u.name.replace(/'/g, "\\'")}', '${u.email}', '${u.role}')">
                      Edit
                    </button>
                    <button class="btn-danger"
                      onclick="toggleUser('${u.id}', ${!u.active})">
                      ${u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  ` : ''}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6"><div class="empty-state"><p>No users found</p></div></td></tr>'}
          </tbody>
        </table>

        <div style="border-top:1px solid var(--border); padding-top:16px;">
          <h4 style="font-size:14px; margin-bottom:12px;">Add New User</h4>
          <div class="form-row">
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="new-user-name" placeholder="Full name" />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="new-user-email" placeholder="email@example.com" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="new-user-password" placeholder="Min 6 characters" />
            </div>
            <div class="form-group">
              <label>Role</label>
              <select id="new-user-role">
                <option value="admin">Admin (record payouts, view all)</option>
                <option value="viewer">Viewer (read-only)</option>
                <option value="super_admin">Super Admin (full access)</option>
              </select>
            </div>
          </div>
          <button class="btn-save" onclick="addUser()">Add User</button>
        </div>
      </div>
    </div>

    <script>
    async function saveSettings(e) {
      e.preventDefault();
      const btn = document.getElementById('settings-save-btn');
      btn.textContent = 'Saving...';
      btn.disabled = true;

      const settings = {
        payout_percentage:     document.getElementById('setting-payout-percentage').value,
        payout_cap:            document.getElementById('setting-payout-cap').value,
        min_job_value:         document.getElementById('setting-min-job-value').value,
        new_customer_discount: document.getElementById('setting-new-customer-discount').value,
        max_lookback_hours:    document.getElementById('setting-max-lookback-hours').value,
        residential_only:           document.getElementById('setting-residential-only').checked ? 'true' : 'false',
        excluded_business_unit_ids: document.getElementById('setting-excluded-bu-ids').value,
        reengage_days:         document.getElementById('setting-reengage-days').value,
        reengage_max_age_days: document.getElementById('setting-reengage-max-age-days').value,
      };

      try {
        const res = await fetch('/admin/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings }),
        });
        const data = await res.json();
        if (data.success) {
          btn.textContent = 'Saved!';
          btn.style.background = 'var(--green)';
          setTimeout(function() { btn.textContent = 'Save Settings'; btn.style.background = ''; btn.disabled = false; }, 2000);
        } else {
          alert('Error: ' + (data.error || 'Unknown'));
          btn.textContent = 'Save Settings'; btn.disabled = false;
        }
      } catch (err) {
        alert('Request failed: ' + err.message);
        btn.textContent = 'Save Settings'; btn.disabled = false;
      }
    }

    async function addUser() {
      var name = document.getElementById('new-user-name').value.trim();
      var email = document.getElementById('new-user-email').value.trim();
      var password = document.getElementById('new-user-password').value;
      var role = document.getElementById('new-user-role').value;

      if (!name || !email || !password) {
        alert('Please fill in name, email, and password.');
        return;
      }
      if (password.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
      }

      var res = await fetch('/admin/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, password: password, role: role }),
      });
      var data = await res.json();
      if (data.success) location.reload();
      else alert('Error: ' + (data.error || 'Unknown'));
    }

    function editUser(id, name, email, role) {
      var newName = prompt('Name:', name);
      if (newName === null) return;
      var newEmail = prompt('Email:', email);
      if (newEmail === null) return;
      var newRole = prompt('Role (super_admin, admin, or viewer):', role);
      if (newRole === null) return;
      if (newRole !== 'admin' && newRole !== 'user') {
        alert('Role must be "admin" or "user".');
        return;
      }
      var newPassword = prompt('New password (leave blank to keep current):');
      if (newPassword === null) return;

      var body = { name: newName, email: newEmail, role: newRole };
      if (newPassword) body.password = newPassword;

      fetch('/admin/api/users/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success) location.reload();
          else alert('Error: ' + (data.error || 'Unknown'));
        });
    }

    async function toggleUser(id, newActive) {
      var res = await fetch('/admin/api/users/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive }),
      });
      var data = await res.json();
      if (data.success) location.reload();
      else alert('Error: ' + (data.error || 'Unknown'));
    }
    </script>
  `;
}


module.exports = { renderLogin, renderDashboard };
