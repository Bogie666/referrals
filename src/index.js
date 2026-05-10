require('dotenv').config();

// ── Startup checks — fail fast if critical env vars are missing ──
const REQUIRED_ENV = ['SESSION_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌  Missing required environment variable: ${key}`);
    console.error(`    Add it to your .env file or hosting environment.`);
    process.exit(1);
  }
}

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const cors = require('cors');

const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const cronRoutes = require('./routes/cron');
const bookRoute = require('./routes/book');
const referralRoute = require('./routes/referral');
const shareRoute = require('./routes/share');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Security: relax CSP so admin Chart.js, customer portal fonts/QR,
//    and the LEX scheduler widget all load. Scheduler is hosted at
//    scheduler-mu-three.vercel.app (script + CSS) and posts bookings to
//    the same origin.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", "'unsafe-inline'",
        "cdnjs.cloudflare.com", "cdn.jsdelivr.net",
        "https://scheduler-mu-three.vercel.app",
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'", "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://scheduler-mu-three.vercel.app",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https://www.lexairconditioning.com"],
      connectSrc: ["'self'", "https://scheduler-mu-three.vercel.app"],
    },
  },
}));

// ── Body parsing & cookies ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── CORS ──
app.use(cors({
  origin: [
    'https://lexairconditioning.com',
    'https://www.lexairconditioning.com',
    'https://lexperks.com',
    'https://www.lexperks.com',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ──
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } }));
app.use('/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts.' }));

// ── Routes ──
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);
app.use('/api/cron', cronRoutes);
app.use('/book', bookRoute);
app.use('/referral', referralRoute);
app.use(shareRoute);  // mounts /share/:code AND /my-referrals at root

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'LEX Referral App', timestamp: new Date().toISOString() });
});

// ── Root redirect — bare lexperks.com goes to the customer portal.
//    Admin access is at /admin (separate URL, separate auth).
app.get('/', (req, res) => res.redirect('/my-referrals'));

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
