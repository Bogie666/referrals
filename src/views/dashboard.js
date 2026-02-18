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
    rewarded:  { color: '#10b981', bg: '#d1fae5', label: '✓ Rewarded' },
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

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
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
    input[type=password] {
      width: 100%; padding: 12px 16px; border: 1px solid #d1d5db;
      border-radius: 8px; font-size: 15px; outline: none; transition: border 0.2s;
    }
    input[type=password]:focus { border-color: #1d3a6e; box-shadow: 0 0 0 3px rgba(29,58,110,0.1); }
    button {
      width: 100%; padding: 13px; background: #1d3a6e; color: #fff;
      border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
      cursor: pointer; margin-top: 24px; transition: background 0.2s;
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
      <label for="password">Admin Password</label>
      <input type="password" name="password" id="password" placeholder="Enter password" autofocus required />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

function renderDashboard({ stats, referrals, topReferrers, recentActivity, monthlyTrend, activeTab = 'overview' }) {
  const navItems = [
    { id: 'overview',   label: '📊 Overview',       href: '/admin' },
    { id: 'referrals',  label: '🔗 Referrals',       href: '/admin/referrals' },
    { id: 'customers',  label: '⭐ Top Referrers',   href: '/admin/referrers' },
    { id: 'activity',   label: '📋 Activity',        href: '/admin/activity' },
    { id: 'portal',     label: '📱 Portal Preview',   href: '/admin/portal' },
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
      --bg:     #f1f5f9;
      --card:   #ffffff;
      --text:   #0f172a;
      --muted:  #64748b;
      --border: #e2e8f0;
      --sidebar-w: 220px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
    }

    /* ── Sidebar ── */
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

    /* ── Main content ── */
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

    /* ── Stat cards ── */
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

    /* ── Pipeline bar ── */
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

    /* ── Two column layout ── */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 28px;
    }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

    /* ── Card ── */
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

    /* ── Table ── */
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
      background: #f8fafc;
    }
    tbody tr { border-bottom: 1px solid var(--border); }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: #f8fafc; }
    tbody td {
      padding: 12px 16px;
      vertical-align: middle;
    }
    .td-name { font-weight: 500; color: var(--text); }
    .td-sub  { font-size: 12px; color: var(--muted); margin-top: 2px; }

    /* ── Activity feed ── */
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
    .activity-text { flex: 1; }
    .activity-text p { font-size: 13px; color: var(--text); line-height: 1.4; }
    .activity-text span { font-size: 12px; color: var(--muted); margin-top: 2px; display: block; }

    /* ── Chart container ── */
    .chart-wrap {
      padding: 20px;
      height: 240px;
      position: relative;
    }

    /* ── Filter bar ── */
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

    /* ── Empty state ── */
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--muted);
    }
    .empty-state p { font-size: 14px; margin-top: 8px; }

    /* ── Scrollable table wrapper ── */
    .table-wrap { overflow-x: auto; }
  </style>
</head>
<body>

<!-- ── Sidebar ── -->
<aside class="sidebar">
  <div class="sidebar-brand">
    <h1>❄️ LEX Referral</h1>
    <p>Admin Dashboard</p>
  </div>
  <nav class="sidebar-nav">
    ${navItems.map(n => `
      <a href="${n.href}" class="${n.id === activeTab ? 'active' : ''}">${n.label}</a>
    `).join('')}
  </nav>
  <div class="sidebar-footer">
    <a href="/admin/logout">🚪 Sign Out</a>
  </div>
</aside>

<!-- ── Main ── -->
<main class="main">

  ${activeTab === 'overview' ? renderOverview({ stats, referrals, topReferrers, recentActivity, trendLabels, trendCreated, trendRewarded }) : ''}
  ${activeTab === 'referrals' ? renderReferralsTab(referrals) : ''}
  ${activeTab === 'customers' ? renderReferrersTab(topReferrers) : ''}
  ${activeTab === 'activity'  ? renderActivityTab(recentActivity) : ''}
  ${activeTab === 'portal'    ? renderPortalTab() : ''}

</main>

<script>
// ── Trend chart (overview only) ──
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
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ── Status donut (overview only) ──
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
</script>
</body>
</html>`;
}

function renderOverview({ stats, referrals, topReferrers, recentActivity, trendLabels, trendCreated, trendRewarded }) {
  const total = stats.total || 1; // avoid divide by zero in pipeline widths
  const stages = [
    { key: 'pending',   count: stats.statusCounts.pending,   emoji: '⏳' },
    { key: 'booked',    count: stats.statusCounts.booked,    emoji: '📅' },
    { key: 'completed', count: stats.statusCounts.completed, emoji: '✅' },
    { key: 'rewarded',  count: stats.statusCounts.rewarded,  emoji: '🎁' },
    { key: 'rejected',  count: stats.statusCounts.rejected,  emoji: '✗' },
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
        <span style="font-size:20px;">🎁</span>
        <span style="font-weight:600;color:#92400e;">
          ${stats.statusCounts.completed} referral${stats.statusCounts.completed > 1 ? 's' : ''} ready to reward —
          <span style="font-weight:400;">send the gift card${stats.statusCounts.completed > 1 ? 's' : ''} and mark as rewarded.</span>
        </span>
      </div>
      <a href="/admin/referrals?status=completed" style="
        padding:7px 16px; background:#f59e0b; color:#fff;
        border-radius:8px; text-decoration:none; font-size:13px; font-weight:600; white-space:nowrap;
      ">Review now →</a>
    </div>
    ` : ''}

    <!-- KPI cards -->
    <div class="stats-grid">
      <div class="stat-card navy">
        <div class="stat-label">Total Referrals</div>
        <div class="stat-value">${stats.total}</div>
        <div class="stat-sub">All time</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Rewards Paid</div>
        <div class="stat-value">${formatCurrency(stats.totalRewardsPaid)}</div>
        <div class="stat-sub">${stats.statusCounts.rewarded} gift cards sent</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label">Conversion Rate</div>
        <div class="stat-value">${stats.conversionRate}%</div>
        <div class="stat-sub">Referred → Rewarded</div>
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
            ${s.count > 0 ? `${s.emoji} ${s.count}` : ''}
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

    <!-- Bottom row: recent referrals + activity -->
    <div class="two-col">

      <!-- Recent referrals -->
      <div class="card">
        <div class="card-header">
          <h3>Recent Referrals</h3>
          <a href="/admin/referrals">View all →</a>
        </div>
        <div class="card-body table-wrap">
          <table>
            <thead><tr>
              <th>Referred By</th>
              <th>Referred</th>
              <th>Status</th>
              <th>Date</th>
            </tr></thead>
            <tbody>
              ${referrals.slice(0, 8).map(r => `
                <tr>
                  <td>
                    <div class="td-name">${r.referrer?.name || '—'}</div>
                  </td>
                  <td>
                    <div class="td-name">${r.referred_name || 'Pending'}</div>
                  </td>
                  <td>${statusBadge(r.status)}</td>
                  <td style="color:var(--muted); white-space:nowrap;">${formatDate(r.created_at)}</td>
                </tr>
              `).join('') || '<tr><td colspan="4"><div class="empty-state"><p>No referrals yet</p></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Activity feed -->
      <div class="card">
        <div class="card-header">
          <h3>Live Activity</h3>
          <a href="/admin/activity">View all →</a>
        </div>
        <div class="activity-list">
          ${recentActivity.slice(0, 8).map(a => {
            const icons = { rewarded:'🎁', booked:'📅', pending:'⏳', completed:'✅', rejected:'✗' };
            const msgs = {
              rewarded:  `<strong>${a.referrerName}</strong> earned a ${formatCurrency(a.rewardAmount)} gift card`,
              booked:    `<strong>${a.referredName}</strong> booked their first service`,
              pending:   `New referral link clicked — waiting for booking`,
              completed: `<strong>${a.referredName}</strong>'s job completed — reward processing`,
              rejected:  `Referral rejected`,
            };
            return `
              <div class="activity-item">
                <div class="activity-dot ${a.status}">${icons[a.status] || '•'}</div>
                <div class="activity-text">
                  <p>${msgs[a.status] || a.status}</p>
                  <span>${formatDateTime(a.timestamp)}</span>
                </div>
              </div>
            `;
          }).join('') || '<div class="empty-state"><p>No activity yet</p></div>'}
        </div>
      </div>

    </div>
  `;
}

function renderReferralsTab(referrals) {
  const statuses = ['all', 'pending', 'booked', 'completed', 'rewarded', 'rejected'];
  const needsReward = referrals.filter(r => r.status === 'completed');

  return `
    <div class="page-header">
      <h2>All Referrals</h2>
      <p>Every referral record in the system</p>
    </div>

    ${needsReward.length > 0 ? `
    <!-- ── Needs reward alert banner ── -->
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
        <span style="font-size:24px;">🎁</span>
        <div>
          <div style="font-weight:700; color:#92400e; font-size:15px;">
            ${needsReward.length} referral${needsReward.length > 1 ? 's' : ''} need${needsReward.length === 1 ? 's' : ''} a reward sent
          </div>
          <div style="font-size:13px; color:#b45309; margin-top:2px;">
            These jobs are complete and qualify — send the gift cards, then mark them as rewarded below.
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
      ">View ${needsReward.length} pending →</a>
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

    <div class="card">
      <div class="card-body table-wrap">
        <table>
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
                  <div class="td-name">${r.referred_name || '(not yet booked)'}</div>
                  <div class="td-sub">${r.referred_phone || r.referred_email || ''}</div>
                </td>
                <td>${r.referred_job_value ? formatCurrency(r.referred_job_value) : '—'}</td>
                <td>
                  ${statusBadge(r.status)}
                  ${r.rejection_reason ? `<div class="td-sub" style="color:#ef4444;margin-top:3px;">${r.rejection_reason}</div>` : ''}
                </td>
                <td id="reward-cell-${r.id}">
                  ${r.status === 'rewarded'
                    ? `<span style="color:var(--green);font-weight:600;">${formatCurrency(r.reward_amount)} sent</span>
                       ${r.tango_order_id ? `<div class="td-sub">${r.tango_order_id}</div>` : ''}`
                    : '—'
                  }
                </td>
                <td style="color:var(--muted);white-space:nowrap;">${formatDate(r.created_at)}</td>
                <td style="white-space:nowrap;">
                  ${r.status === 'completed' ? `
                    <button
                      onclick="markRewarded('${r.id}', '${(r.referrer?.name || '').replace(/'/g, "\\'")}')"
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
                    >✓ Mark Rewarded</button>
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
                  ` : ''}
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
    async function markRewarded(id, referrerName) {
      const notes = prompt(
        'Gift card sent to ' + referrerName + '\\n\\nOptional: add a note (e.g. "$75 Visa sent via email")\\nLeave blank and click OK to continue.',
        ''
      );
      if (notes === null) return; // user cancelled

      const btn = document.querySelector('#row-' + id + ' button');
      if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

      try {
        const res = await fetch('/admin/api/referral/' + id + '/mark-rewarded', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        });
        const data = await res.json();

        if (data.success) {
          // Update row in place without a page reload
          const row = document.getElementById('row-' + id);
          const statusCell = row.querySelector('td:nth-child(4)');
          const rewardCell = document.getElementById('reward-cell-' + id);
          const actionCell = row.querySelector('td:last-child');

          statusCell.innerHTML = '<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;color:#10b981;background:#d1fae5;">✓ Rewarded</span>';
          rewardCell.innerHTML = '<span style="color:var(--green);font-weight:600;">$' + (data.rewardAmount || 75) + ' sent</span>' + (notes ? '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + notes + '</div>' : '');
          actionCell.innerHTML = '';
          row.style.background = '#f0fdf4';
          setTimeout(() => { row.style.background = ''; }, 2000);

          // Update the banner count
          const bannerCount = document.querySelectorAll('button[onclick^="markRewarded"]').length;
          if (bannerCount === 0) {
            const banner = document.querySelector('[style*="fffbeb"]');
            if (banner) banner.remove();
          }
        } else {
          alert('Error: ' + (data.error || 'Unknown error'));
          if (btn) { btn.textContent = '✓ Mark Rewarded'; btn.disabled = false; }
        }
      } catch (err) {
        alert('Request failed: ' + err.message);
        if (btn) { btn.textContent = '✓ Mark Rewarded'; btn.disabled = false; }
      }
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
        setTimeout(() => { row.style.background = ''; }, 2000);
      } else {
        alert('Error: ' + (data.error || 'Unknown error'));
      }
    }
    </script>
  `;
}

function renderReferrersTab(topReferrers) {
  return `
    <div class="page-header">
      <h2>Top Referrers</h2>
      <p>Customers who have successfully referred others</p>
    </div>
    <div class="card">
      <div class="card-body table-wrap">
        <table>
          <thead><tr>
            <th>#</th>
            <th>Customer</th>
            <th>Referrals</th>
            <th>Total Earned</th>
            <th>Referral Link</th>
            <th>Member Since</th>
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
                <td>
                  <code style="font-size:12px;background:#f1f5f9;padding:3px 8px;border-radius:4px;">
                    ${c.referral_link}
                  </code>
                </td>
                <td style="color:var(--muted);">${formatDate(c.created_at)}</td>
              </tr>
            `).join('') || `
              <tr><td colspan="6">
                <div class="empty-state">
                  <p>No referrers yet — they'll appear here once jobs complete</p>
                </div>
              </td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderActivityTab(recentActivity) {
  const icons = { rewarded:'🎁', booked:'📅', pending:'⏳', completed:'✅', rejected:'✗' };
  return `
    <div class="page-header">
      <h2>Activity Feed</h2>
      <p>Real-time referral events</p>
    </div>
    <div class="card">
      <div class="activity-list">
        ${recentActivity.map(a => `
          <div class="activity-item">
            <div class="activity-dot ${a.status}">${icons[a.status] || '•'}</div>
            <div class="activity-text">
              <p>
                <strong>${a.referrerName}</strong>
                ${a.status === 'rewarded' ? ` earned a gift card for referring ${a.referredName}` : ''}
                ${a.status === 'booked'   ? ` — ${a.referredName} booked their first service` : ''}
                ${a.status === 'pending'  ? ` — referral link clicked, awaiting booking` : ''}
                ${a.status === 'completed'? ` — ${a.referredName}'s job completed, processing reward` : ''}
                ${a.status === 'rejected' ? ` — referral rejected` : ''}
              </p>
              <span>${formatDateTime(a.timestamp)}</span>
            </div>
            <div>${statusBadge(a.status)}</div>
          </div>
        `).join('') || '<div class="empty-state"><p>No activity yet</p></div>'}
      </div>
    </div>
  `;
}

// ──────────────────────────────────────────────────────────────
// Portal Preview Tab
// ──────────────────────────────────────────────────────────────
function renderPortalTab() {
  const demoPhones = [
    { label: 'Sarah Mitchell',  phone: '9724561001', sub: '3 referrals · Top Referrer' },
    { label: 'James Thornton',  phone: '9724561002', sub: '2 referrals' },
    { label: 'Maria Gonzalez',  phone: '9724561003', sub: '2 referrals' },
    { label: 'Robert Chen',     phone: '9724561004', sub: '1 referral' },
    { label: 'Marcus Johnson',  phone: '9724561008', sub: '1 referral' },
  ];
  const stDemoPhones = [
    { label: 'Jennifer Walsh',  phone: '9725550101', sub: 'ST self-signup · has jobs' },
    { label: 'Mike Castillo',   phone: '9725550102', sub: 'ST self-signup · has jobs' },
    { label: 'Tyler Brooks',    phone: '9725550201', sub: 'ST · no completed jobs yet' },
  ];

  return `
    <div class="page-header" style="margin-bottom:24px;">
      <h2 style="font-size:22px; font-weight:700; color:var(--navy); margin:0 0 6px;">Portal Preview</h2>
      <p style="color:var(--muted); font-size:14px; margin:0;">Interactive preview of what customers see when they visit the referral portal.</p>
    </div>

    <!-- Info banner -->
    <div style="
      background:#eff6ff; border:1.5px solid #93c5fd; border-radius:12px;
      padding:14px 20px; margin-bottom:24px;
      display:flex; align-items:flex-start; gap:12px;
    ">
      <span style="font-size:18px; flex-shrink:0;">📱</span>
      <div style="font-size:13px; color:#1e40af; line-height:1.5;">
        <strong>This is what your customers see.</strong> Enter any phone number below,
        or click a demo account to preview the portal. This is a live preview using
        the same API your WordPress plugin calls.
      </div>
    </div>

    <!-- Quick-pick demo buttons -->
    <div style="margin-bottom:28px;">
      <div style="font-size:12px; font-weight:600; color:var(--muted);
                  text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">
        Demo Accounts
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${demoPhones.map(d => `
          <button
            onclick="portalQuickPick('${d.phone}')"
            style="
              padding:8px 14px; border-radius:8px;
              border:1px solid var(--border); background:var(--card);
              font-size:13px; font-weight:500; cursor:pointer;
              color:var(--text); transition:all 0.15s; text-align:left;
            "
            onmouseover="this.style.background='var(--navy)';this.style.color='#fff';this.style.borderColor='var(--navy)';"
            onmouseout="this.style.background='var(--card)';this.style.color='var(--text)';this.style.borderColor='var(--border)';"
          >
            <div>${d.label}</div>
            ${d.sub ? `<div style="font-size:11px; opacity:0.65; margin-top:1px;">${d.sub}</div>` : ''}
          </button>
        `).join('')}
      </div>
      <div style="font-size:12px; font-weight:600; color:var(--muted);
                  text-transform:uppercase; letter-spacing:0.05em; margin:14px 0 10px;">
        ServiceTitan Self-Signup Demo
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${stDemoPhones.map(d => `
          <button
            onclick="portalQuickPick('${d.phone}')"
            style="
              padding:8px 14px; border-radius:8px;
              border:1px solid #c7d2fe; background:#eef2ff;
              font-size:13px; font-weight:500; cursor:pointer;
              color:var(--text); transition:all 0.15s; text-align:left;
            "
            onmouseover="this.style.background='var(--navy)';this.style.color='#fff';this.style.borderColor='var(--navy)';"
            onmouseout="this.style.background='#eef2ff';this.style.color='var(--text)';this.style.borderColor='#c7d2fe';"
          >
            <div>${d.label}</div>
            ${d.sub ? `<div style="font-size:11px; opacity:0.65; margin-top:1px;">${d.sub}</div>` : ''}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Phone frame -->
    <div style="
      max-width: 420px;
      margin: 0 auto;
      background: #1e293b;
      border-radius: 44px;
      padding: 16px 12px 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2), inset 0 0 0 2px #334155;
    ">
      <!-- Notch -->
      <div style="
        width: 80px; height: 6px; background: #475569;
        border-radius: 3px; margin: 0 auto 12px;
      "></div>

      <!-- Screen -->
      <div style="
        background: #f1f5f9;
        border-radius: 32px;
        padding: 20px 8px;
        min-height: 520px;
        overflow: hidden;
      ">

        <!-- Portal widget -->
        <div id="lex-portal-root">

          <!-- Screen 1: Phone lookup -->
          <div id="lex-portal-lookup" class="lex-portal-screen active">
            <div class="lex-portal-card">
              <div class="lex-portal-icon"><img src="https://www.lexairconditioning.com/wp-content/uploads/2024/11/lex-air-web-transparent_badge-color.png" alt="LEX Air" style="width:56px; height:auto;" /></div>
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

          <!-- Screen 2: Loading -->
          <div id="lex-portal-loading" class="lex-portal-screen">
            <div class="lex-portal-card" style="text-align:center; padding: 60px 24px;">
              <div class="lex-portal-spinner"></div>
              <p style="margin-top:20px; color:var(--muted);">Looking up your account...</p>
            </div>
          </div>

          <!-- Screen 3: Not found -->
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

          <!-- Screen 4: No referral link yet -->
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

          <!-- Screen 5: Main portal -->
          <div id="lex-portal-main" class="lex-portal-screen">
            <div class="lex-portal-card lex-portal-header-card">
              <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
                <div class="lex-portal-avatar" id="lex-portal-avatar"></div>
                <div>
                  <h2 id="lex-portal-name" style="margin:0; font-size:20px;"></h2>
                  <p style="margin:2px 0 0; color:var(--muted); font-size:13px;">LEX Referral Member</p>
                </div>
              </div>
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

            <div class="lex-portal-card">
              <h3 class="lex-portal-section-title">Your Referral Link</h3>
              <p style="font-size:14px; color:var(--muted); margin-bottom:16px;">
                Share this link with friends and family. When they complete their first service,
                you get a <strong id="lex-reward-amount-display">$75</strong> gift card and they save
                <strong id="lex-discount-amount-display">$50</strong>.
              </p>
              <div class="lex-portal-link-row">
                <input type="text" id="lex-portal-link-input" readonly />
                <button onclick="lexPortalCopyLink()" id="lex-copy-btn">Copy</button>
              </div>
              <div class="lex-portal-share-buttons">
                <a id="lex-portal-sms-btn" href="#" class="lex-portal-share-btn lex-share-sms">
                  💬 Text a Friend
                </a>
                <a id="lex-portal-email-btn" href="#" class="lex-portal-share-btn lex-share-email">
                  ✉️ Send Email
                </a>
              </div>
            </div>

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

            <div class="lex-portal-card" id="lex-portal-history-card">
              <h3 class="lex-portal-section-title">Your Referrals</h3>
              <div id="lex-portal-referral-list"></div>
            </div>

            <div style="text-align:center; padding: 8px 0 24px;">
              <button class="lex-portal-btn-link" onclick="lexPortalReset()">
                Sign out
              </button>
            </div>
          </div>

        </div>
        <!-- /lex-portal-root -->

      </div>
      <!-- /screen -->

      <!-- Home indicator -->
      <div style="
        width: 100px; height: 4px; background: #475569;
        border-radius: 2px; margin: 12px auto 0;
      "></div>
    </div>
    <!-- /phone frame -->

    <!-- Portal CSS -->
    <style>
      #lex-portal-root {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        max-width: 100%;
        margin: 0 auto;
        padding: 0 4px;
      }
      .lex-portal-screen { display: none; }
      .lex-portal-screen.active { display: block; }

      .lex-portal-card {
        background: #fff;
        border-radius: 16px;
        padding: 24px 20px;
        margin-bottom: 12px;
        border: 1px solid var(--border);
      }
      .lex-portal-icon { font-size: 36px; text-align: center; margin-bottom: 12px; }
      .lex-portal-card h2 {
        font-size: 19px; font-weight: 700; color: var(--navy);
        text-align: center; margin: 0 0 10px;
      }
      .lex-portal-sub {
        text-align: center; color: var(--muted);
        font-size: 13px; line-height: 1.5; margin: 0 0 20px;
      }

      .lex-portal-field { margin-bottom: 16px; }
      .lex-portal-field label {
        display: block; font-size: 12px; font-weight: 600;
        color: #374151; margin-bottom: 6px;
      }
      .lex-portal-field input {
        width: 100%; padding: 11px 14px;
        border: 1.5px solid var(--border); border-radius: 10px;
        font-size: 15px; outline: none; transition: border 0.2s;
        box-sizing: border-box;
      }
      .lex-portal-field input:focus {
        border-color: var(--navy);
        box-shadow: 0 0 0 3px rgba(29,58,110,0.08);
      }
      .lex-portal-error { font-size: 12px; color: #dc2626; margin-top: 6px; }

      .lex-portal-btn-primary {
        display: block; width: 100%; padding: 12px;
        background: var(--navy); color: #fff; border: none;
        border-radius: 10px; font-size: 15px; font-weight: 600;
        cursor: pointer; text-align: center; text-decoration: none;
        transition: background 0.2s; box-sizing: border-box;
      }
      .lex-portal-btn-primary:hover { background: #162d57; color: #fff; }
      .lex-portal-btn-primary.loading { opacity: 0.7; pointer-events: none; }

      .lex-portal-btn-secondary {
        display: block; width: 100%; padding: 10px;
        background: transparent; color: var(--navy);
        border: 1.5px solid var(--navy); border-radius: 10px;
        font-size: 14px; font-weight: 500; cursor: pointer;
        box-sizing: border-box; transition: background 0.2s;
      }
      .lex-portal-btn-secondary:hover { background: #f0f7ff; }

      .lex-portal-btn-link {
        background: none; border: none; color: var(--muted);
        font-size: 13px; cursor: pointer; text-decoration: underline; padding: 0;
      }

      .lex-portal-avatar {
        width: 44px; height: 44px; border-radius: 50%;
        background: var(--navy); display: flex;
        align-items: center; justify-content: center;
        font-size: 18px; color: #fff; font-weight: 700; flex-shrink: 0;
      }

      .lex-portal-stats-row {
        display: flex; align-items: center;
        background: var(--bg); border-radius: 12px; padding: 14px; gap: 0;
      }
      .lex-portal-stat { flex: 1; text-align: center; }
      .lex-portal-stat-value { font-size: 22px; font-weight: 700; color: var(--navy); line-height: 1; }
      .lex-portal-stat-value.green { color: var(--green); }
      .lex-portal-stat-value.orange { color: var(--orange); }
      .lex-portal-stat-label { font-size: 11px; color: var(--muted); margin-top: 4px; }
      .lex-portal-stat-divider { width: 1px; height: 32px; background: var(--border); }

      .lex-portal-link-row { display: flex; margin-bottom: 14px; }
      .lex-portal-link-row input {
        flex: 1; padding: 10px 12px;
        border: 1.5px solid var(--border); border-right: none;
        border-radius: 10px 0 0 10px; font-size: 12px;
        background: #f8fafc; outline: none; color: var(--muted);
      }
      .lex-portal-link-row button {
        padding: 10px 16px; background: var(--navy); color: #fff;
        border: none; border-radius: 0 10px 10px 0;
        font-size: 13px; font-weight: 600; cursor: pointer;
        white-space: nowrap; transition: background 0.2s;
      }
      .lex-portal-link-row button:hover { background: #162d57; }

      .lex-portal-share-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
      .lex-portal-share-btn {
        flex: 1; min-width: 100px; padding: 9px 10px;
        border-radius: 8px; font-size: 12px; font-weight: 500;
        text-align: center; text-decoration: none; cursor: pointer;
        border: 1.5px solid var(--border); background: #fff;
        color: var(--navy) !important; transition: background 0.15s;
        box-sizing: border-box;
      }
      .lex-portal-share-btn:hover { background: #f0f7ff; }
      .lex-share-sms { background: #f0fdf4; border-color: #86efac; color: #166534 !important; }
      .lex-share-sms:hover { background: #dcfce7; }

      .lex-portal-section-title {
        font-size: 14px; font-weight: 700; color: var(--navy);
        margin: 0 0 14px; padding-bottom: 10px;
        border-bottom: 1px solid var(--border);
      }

      .lex-portal-steps { display: flex; flex-direction: column; gap: 14px; }
      .lex-portal-step { display: flex; align-items: flex-start; gap: 12px; }
      .lex-portal-step-num {
        width: 26px; height: 26px; border-radius: 50%;
        background: var(--navy); color: #fff;
        font-size: 12px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; margin-top: 1px;
      }
      .lex-portal-step strong { display: block; font-size: 13px; margin-bottom: 2px; }
      .lex-portal-step p { font-size: 12px; color: var(--muted); margin: 0; line-height: 1.4; }

      .lex-portal-referral-item {
        display: flex; align-items: center;
        justify-content: space-between;
        padding: 10px 0; border-bottom: 1px solid var(--border); gap: 10px;
      }
      .lex-portal-referral-item:last-child { border-bottom: none; padding-bottom: 0; }
      .lex-portal-ref-name { font-size: 13px; font-weight: 500; }
      .lex-portal-ref-date { font-size: 11px; color: var(--muted); margin-top: 2px; }
      .lex-portal-ref-badge {
        font-size: 11px; font-weight: 600;
        padding: 2px 8px; border-radius: 20px; white-space: nowrap;
      }
      .badge-rewarded  { background: #d1fae5; color: #065f46; }
      .badge-booked    { background: #dbeafe; color: #1e40af; }
      .badge-pending   { background: #fef3c7; color: #92400e; }
      .badge-completed { background: #ede9fe; color: #5b21b6; }
      .badge-rejected  { background: #fee2e2; color: #991b1b; }

      .lex-portal-spinner {
        width: 36px; height: 36px;
        border: 3px solid var(--border); border-top-color: var(--navy);
        border-radius: 50%; animation: lex-spin 0.7s linear infinite;
        margin: 0 auto;
      }
      @keyframes lex-spin { to { transform: rotate(360deg); } }
      @keyframes lex-fadein { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

      .lex-portal-fine { font-size: 11px; color: var(--muted); text-align: center; margin-top: 14px; }
      .lex-portal-fine a { color: var(--navy); }

      .lex-portal-header-card h2 { text-align: left; }
      .lex-portal-header-card .lex-portal-sub { text-align: left; }
    </style>

    <!-- Portal JS -->
    <script>
    (function() {
      let currentData = null;

      function showScreen(id) {
        document.querySelectorAll('.lex-portal-screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
      }

      const phoneInput = document.getElementById('lex-portal-phone');
      if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
          let val = e.target.value.replace(/\\D/g, '').slice(0, 10);
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

      window.lexPortalLookup = async function() {
        const raw = (phoneInput?.value || '').replace(/\\D/g, '');
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
          const res = await fetch('/api/portal/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: raw }),
          });

          const data = await res.json();

          // Not a LEX customer
          if (res.status === 404) {
            resetNotFoundScreen();
            showScreen('lex-portal-notfound');
            return;
          }

          // ST unreachable
          if (res.status === 503) {
            var nfCard = document.getElementById('lex-portal-notfound');
            nfCard.querySelector('h2').textContent = 'Unable to Verify Account';
            nfCard.querySelector('.lex-portal-sub').textContent =
              data.message || 'We are having trouble verifying your account right now. Please call us at (972) 466-1917.';
            showScreen('lex-portal-notfound');
            return;
          }

          if (!res.ok || data.error) {
            resetNotFoundScreen();
            showScreen('lex-portal-notfound');
            return;
          }

          // Found but no completed jobs yet
          if (!data.hasReferralLink) {
            var titleEl = document.getElementById('lex-nolink-title');
            var messageEl = document.getElementById('lex-nolink-message');
            if (data.noJobsYet && titleEl) {
              titleEl.textContent = 'You\\'re Almost In!';
            } else if (titleEl) {
              titleEl.textContent = 'Almost Ready!';
            }
            if (messageEl && data.message) {
              messageEl.textContent = data.message;
            }
            showScreen('lex-portal-nolink');
            return;
          }

          // Has a referral link
          currentData = data;
          populatePortal(data);

          // Welcome banner for brand new self-signups
          if (data.isNew) {
            showWelcomeBanner(data.name);
          }

          showScreen('lex-portal-main');

        } catch (err) {
          console.error('[Portal] Lookup error:', err);
          resetNotFoundScreen();
          showScreen('lex-portal-notfound');
        } finally {
          btn.classList.remove('loading');
          btn.textContent = 'Find My Account';
        }
      };

      function populatePortal(data) {
        const firstName = data.name.split(' ')[0];
        const initials = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        document.getElementById('lex-portal-name').textContent = data.name;
        document.getElementById('lex-portal-avatar').textContent = initials;

        document.getElementById('lex-portal-total-referrals').textContent = data.totalReferrals;
        document.getElementById('lex-portal-total-rewards').textContent = '$' + (data.totalRewards || 0);
        const pending = (data.referrals || []).filter(r => ['pending','booked','completed'].includes(r.status)).length;
        document.getElementById('lex-portal-pending-count').textContent = pending;

        const reward = data.rewardAmount || 75;
        const discount = data.discountAmount || 50;
        document.getElementById('lex-reward-amount-display').textContent = '$' + reward;
        document.getElementById('lex-discount-amount-display').textContent = '$' + discount;
        document.getElementById('lex-step-reward').textContent = '$' + reward;
        document.getElementById('lex-step-discount').textContent = '$' + discount;

        const linkInput = document.getElementById('lex-portal-link-input');
        linkInput.value = data.referralLink;

        const smsMsg = encodeURIComponent(
          'Hey! I use LEX Air Conditioning for all my home services in DFW. ' +
          'Use my link to save $' + discount + ' on your first service: ' + data.referralLink
        );
        document.getElementById('lex-portal-sms-btn').href = 'sms:?&body=' + smsMsg;

        const emailSubject = encodeURIComponent(firstName + ' thinks you would love LEX Air Conditioning');
        const emailBody = encodeURIComponent(
          'Hey,\\n\\nI have been using LEX Air Conditioning for HVAC, plumbing, and electrical work here in DFW and they are great.\\n\\n' +
          'Use my referral link to save $' + discount + ' on your first service:\\n' + data.referralLink + '\\n\\n' +
          'They have been in business since 2004 and have over 2,000 reviews. Highly recommend!\\n\\n— ' + data.name
        );
        document.getElementById('lex-portal-email-btn').href = 'mailto:?subject=' + emailSubject + '&body=' + emailBody;

        renderReferralHistory(data.referrals || []);
      }

      function renderReferralHistory(referrals) {
        const list = document.getElementById('lex-portal-referral-list');
        const card = document.getElementById('lex-portal-history-card');

        if (!referrals.length) {
          card.style.display = 'none';
          return;
        }
        card.style.display = 'block';

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
          return '<div class="lex-portal-referral-item">' +
            '<div>' +
              '<div class="lex-portal-ref-name">' + name + '</div>' +
              (date ? '<div class="lex-portal-ref-date">' + date + '</div>' : '') +
            '</div>' +
            '<span class="lex-portal-ref-badge ' + s.cls + '">' + s.label + '</span>' +
          '</div>';
        }).join('');
      }

      function showWelcomeBanner(fullName) {
        var firstName = fullName.split(' ')[0];
        var banner = document.createElement('div');
        banner.style.cssText =
          'background:#d1fae5; border:1.5px solid #10b981; border-radius:12px;' +
          'padding:14px 20px; margin-bottom:16px;' +
          'display:flex; align-items:center; gap:12px;' +
          'animation: lex-fadein 0.4s ease;';
        banner.innerHTML =
          '<span style="font-size:24px;">🎉</span>' +
          '<div>' +
            '<strong style="color:#065f46;">Welcome to the LEX Referral Program, ' + firstName + '!</strong>' +
            '<p style="margin:3px 0 0; font-size:13px; color:#047857;">' +
              'Your referral link is ready. Start sharing and earn a $' + (currentData?.rewardAmount || 75) + ' gift card for every friend who completes a service!' +
            '</p>' +
          '</div>';
        var mainScreen = document.getElementById('lex-portal-main');
        mainScreen.insertBefore(banner, mainScreen.firstChild);
        setTimeout(function() {
          banner.style.transition = 'opacity 0.5s';
          banner.style.opacity = '0';
          setTimeout(function() { banner.remove(); }, 500);
        }, 6000);
      }

      function resetNotFoundScreen() {
        var nfCard = document.getElementById('lex-portal-notfound');
        if (nfCard) {
          nfCard.querySelector('h2').textContent = 'Account Not Found';
          nfCard.querySelector('.lex-portal-sub').textContent =
            'We couldn\\'t find an account with that number. Make sure you\\'re using the number on file with LEX, or give us a call and we\\'ll look it up.';
        }
      }

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

      window.lexPortalReset = function() {
        currentData = null;
        if (phoneInput) phoneInput.value = '';
        const errorEl = document.getElementById('lex-portal-phone-error');
        if (errorEl) errorEl.style.display = 'none';
        showScreen('lex-portal-lookup');
      };

      window.portalQuickPick = function(phone) {
        const d = phone.replace(/\\D/g, '');
        const formatted = '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
        if (phoneInput) {
          phoneInput.value = formatted;
          lexPortalLookup();
        }
      };

    })();
    </script>
  `;
}

module.exports = { renderLogin, renderDashboard };
