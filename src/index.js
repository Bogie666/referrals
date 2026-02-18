require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security: relax CSP so Chart.js CDN works in admin dashboard
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://www.lexairconditioning.com"],
      connectSrc: ["'self'"],
    },
  },
}));

// ── Body parsing & cookies ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── CORS: only on public API routes ──
app.use('/api', (req, res, next) => {
  const allowedOrigin = process.env.SITE_URL || 'https://lexair.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Rate limiting ──
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } }));
app.use('/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts.' }));

// ── Routes ──
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'LEX Referral App', timestamp: new Date().toISOString() });
});

// ── Root redirect ──
app.get('/', (req, res) => res.redirect('/admin'));

// ── 404 ──
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ LEX Referral App running on port ${PORT}`);
  console.log(`   Admin:    /admin`);
  console.log(`   Webhooks: POST /webhooks/servicetitan`);
  console.log(`   API:      GET  /api/referral/:slug`);
});

module.exports = app;
