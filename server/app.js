const config = require('./config');

const express = require('express');
const cors = require('cors');
const path = require('path');
const auth = require('./middleware/auth');
const realtime = require('./realtime');
const logger = require('./services/logger');
const rateLimit = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const trainerRoutes = require('./routes/trainer');
const studentRoutes = require('./routes/student');
const sessionRoutes = require('./routes/sessions');
const policyRoutes = require('./routes/policy');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const agoraRoutes = require('./routes/agora');
const razorpayRoutes = require('./routes/razorpay');
const leaveRoutes = require('./routes/leaves');
const contactRoutes = require('./routes/contact');
const chatRoutes = require('./routes/chat');
const parentChatRoutes = require('./routes/parentChat');
const networkRoutes = require('./routes/network');
const networkQuality = require('./services/networkQualityService');
const badgeService = require('./services/badgeService');
const celebrationService = require('./services/celebrationService');

const app = express();

/* Public write endpoints get a coarse in-process throttle on top of their
   signature checks. Login throttling lives in routes/auth.js. */
const webhookThrottle = rateLimit.createLimiter({ name: 'webhook', windowMs: 60000, max: 120 });
const contactThrottle = rateLimit.createLimiter({ name: 'contact', windowMs: 60000, max: 20 });
const probeThrottle = rateLimit.createLimiter({ name: 'network-probe', windowMs: 60000, max: 40 });
app.use('/api/network', probeThrottle);
app.use('/api/razorpay/webhook', webhookThrottle);
app.use('/api/agora/webhook', webhookThrottle);
app.use('/api/webhooks/recording', webhookThrottle);
app.use('/api/contact', contactThrottle);

app.use(cors({
  origin: config.corsOrigins()
}));
/* Razorpay and Agora sign the raw body, so these routes must be read first. */
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));
app.use('/api/agora/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', function (req, res) {
  return res.json({
    ok: true,
    service: 'mathify-server',
    phase: 1,
    database: config.databaseMode,
    supabaseConfigured: config.supabaseConfigured,
    realtime: realtime.mode
  });
});

/* Browser-safe Supabase config. The secret key is never exposed here. */
app.get('/api/public/config', function (req, res) {
  return res.json({
    supabase: {
      url: config.supabase.url,
      publishableKey: config.supabase.publishableKey,
      realtimeEnabled: Boolean(config.supabase.url && config.supabase.publishableKey)
    },
    realtimeMode: realtime.mode,
    network: networkQuality.settings(),
    badges: badgeService.catalog(),
    celebrations: celebrationService.publicConfig()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/trainer', trainerRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agora', agoraRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/parent-chat', parentChatRoutes);

app.get('/api/realtime/log', auth.requireAuth, auth.requireRole('trainer', 'founder'), function (req, res) {
  return res.json({ mode: realtime.mode, events: realtime.recent(req.query.limit) });
});

/* A tiny inline favicon keeps browser consoles clean without exposing a new
   static file or an extra asset request on every dashboard. */
app.get('/favicon.ico', function (req, res) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="6" fill="#0E1420"/>' +
    '<text x="16" y="22" font-family="monospace" font-size="18" text-anchor="middle" fill="#FF5B2E">M</text>' +
    '</svg>';
  res.set('Cache-Control', 'public, max-age=86400');
  return res.type('image/svg+xml').send(svg);
});

/* Serve the Mathify surfaces from the same origin as the API. Only reviewed
   browser assets are exposed: server source, migrations, .env and .git are
   never reachable through this static mount. */
const webRoot = path.resolve(__dirname, '..');
const publicFiles = new Set([
  'index.html', 'apps.html', 'pricing.html', 'terms.html',
  'privacy.html', 'refund.html', 'contact.html', 'public.css'
]);
const publicDirs = new Set(['assets', 'classroom', 'founder', 'home', 'lms', 'parent', 'shared', 'student', 'trainer']);
const staticFiles = express.static(webRoot, {
  dotfiles: 'deny',
  fallthrough: true,
  index: 'index.html'
});

app.use(function (req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  let pathname;
  try {
    pathname = decodeURIComponent(req.path).replace(/\\/g, '/');
  } catch (error) {
    return next();
  }
  const segments = pathname.split('/').filter(Boolean);

  if (!segments.length) {
    return res.sendFile(path.join(webRoot, 'index.html'));
  }
  if (segments.some(function (segment) { return segment.charAt(0) === '.'; })) {
    return next();
  }
  if (segments.length === 1 && publicFiles.has(segments[0])) {
    return staticFiles(req, res, next);
  }
  if (publicDirs.has(segments[0])) {
    return staticFiles(req, res, next);
  }
  return next();
});

app.use(function (req, res) {
  return res.status(404).json({ error: 'NOT_FOUND', message: 'No such endpoint.' });
});

app.use(function (error, req, res, next) {
  logger.error('http', {
    event: 'unhandled_error',
    method: req.method,
    path: req.path,
    message: error && error.message ? error.message : 'unknown'
  });
  logger.alert('Unhandled Mathify API error', {
    method: req.method,
    path: req.path,
    message: error && error.message ? error.message : 'unknown'
  }).catch(function () { /* alert delivery is best effort */ });
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
});

module.exports = app;
