const config = require('./config');

const express = require('express');
const cors = require('cors');
const path = require('path');
const auth = require('./middleware/auth');
const db = require('./db');
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
const livekitRoutes = require('./routes/livekit');
const livekitRecordingRoutes = require('./routes/livekitRecording');
const recordingAccessRoutes = require('./routes/recordingAccess');
const feedbackRoutes = require('./routes/generateFeedback');
const aiPingRoutes = require('./routes/aiTestPing');
const razorpayRoutes = require('./routes/razorpay');
const leaveRoutes = require('./routes/leaves');
const contactRoutes = require('./routes/contact');
const chatRoutes = require('./routes/chat');
const parentChatRoutes = require('./routes/parentChat');
const rmRoutes = require('./routes/rm');
const networkRoutes = require('./routes/network');
const announcementRoutes = require('./routes/announcements');
const networkQuality = require('./services/networkQualityService');
const sessionAccess = require('./services/sessionAccessService');
const sessionTiming = require('./services/sessionTimingService');
const badgeService = require('./services/badgeService');
const celebrationService = require('./services/celebrationService');

const app = express();

/* Only trust forwarding headers when an operator explicitly configures a
   known proxy hop count. The rate limiter keys on req.ip, so an untrusted
   X-Forwarded-For header can never reset a bucket. */
const trustProxy = String(process.env.TRUST_PROXY || '').trim();
if (trustProxy && trustProxy !== 'false' && trustProxy !== '0') {
  const hops = /^\d+$/.test(trustProxy) ? Number(trustProxy) : true;
  app.set('trust proxy', hops);
}

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
/* KYC images are uploaded as base64 JSON. Give this route its own larger
   limit while every other API body stays at 2 MB. */
app.use('/api/trainer/onboarding/documents', express.json({ limit: '6mb' }));
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
    sessionAccess: sessionAccess.settings(),
    sessionTiming: sessionTiming.settings(),
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
app.use('/api/livekit/recording', livekitRecordingRoutes);
app.use('/api/recordings', recordingAccessRoutes);
app.use('/api/livekit', livekitRoutes);
/* Same handler, shorter path used by the classroom client. */
app.use('/api/get-token', livekitRoutes);
app.use('/api/generate-feedback', feedbackRoutes);
app.use('/api/ai/test-ping', aiPingRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/parent-chat', parentChatRoutes);
app.use('/api/rm', rmRoutes);

/* The app-level diagnostic log follows the same browser-safe rules as the
   session event bridge: the same forbidden-key scrub and an allowlist of the
   caller's sessions. No raw outbox event is returned verbatim. */
const REALTIME_CHANNEL_PREFIX = 'mathify:session:';
const EVENT_FORBIDDEN_KEY = /answer|correct|hint|why|explain|trainer|instruction|misconception|key/i;

function scrubEventPayload(value, depth) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(function (item) { return scrubEventPayload(item, (depth || 0) + 1); });
  if ((depth || 0) > 4) return undefined;
  const clean = {};
  Object.keys(value).forEach(function (key) {
    if (EVENT_FORBIDDEN_KEY.test(key)) return;
    const safe = scrubEventPayload(value[key], (depth || 0) + 1);
    if (safe !== undefined) clean[key] = safe;
  });
  return clean;
}

app.get('/api/realtime/log', auth.requireAuth, auth.requireRole('trainer', 'founder'), async function (req, res) {
  try {
    const size = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
    const [events, sessions] = await Promise.all([
      realtime.recent(req.query.limit),
      db.listSessionsForUser(req.user)
    ]);
    const allowed = {};
    (Array.isArray(sessions) ? sessions : []).forEach(function (session) {
      allowed[String(session.id)] = true;
    });

    const visible = (Array.isArray(events) ? events : []).filter(function (event) {
      const channel = String((event && event.channel) || '');
      if (channel.indexOf(REALTIME_CHANNEL_PREFIX) !== 0) return false;
      return Boolean(allowed[channel.slice(REALTIME_CHANNEL_PREFIX.length)]);
    }).slice(-size).map(function (event) {
      return {
        seq: event.seq,
        at: event.at,
        channel: event.channel,
        event: event.event,
        payload: scrubEventPayload(event.payload, 0) || {}
      };
    });

    return res.json({ mode: realtime.mode, events: visible });
  } catch (error) {
    return res.status(502).json({ error: 'REALTIME_LOG_FAILED', message: error.message });
  }
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
  'privacy.html', 'refund.html', 'contact.html', 'password-reset.html', 'register.html', 'public.css',
  'landing.css', 'landing.js', 'login.html'
]);
const publicDirs = new Set(['assets', 'classroom', 'founder', 'home', 'lms', 'login', 'parent', 'register', 'rm', 'shared', 'student', 'trainer']);

/* Each dashboard nav item is a real page URL. These routes serve the matching
   desk document; the shared section router then shows only that page's UI. */
const sectionPages = {
  '/trainer/today': 'trainer/index.html',
  '/trainer/sessions': 'trainer/index.html',
  '/trainer/leave': 'trainer/index.html',
  '/trainer/students': 'trainer/index.html',
  '/trainer/insights': 'trainer/index.html',
  '/student/home': 'student/index.html',
  '/student/recordings': 'student/index.html',
  '/student/mastery': 'student/index.html',
  '/student/reports': 'student/index.html',
  '/student/schedule': 'student/index.html',
  '/founder/overview': 'founder/index.html',
  '/founder/policy': 'founder/index.html',
  '/founder/mastery': 'founder/index.html',
  '/founder/trainer-policy': 'founder/index.html',
  '/founder/money': 'founder/index.html',
  '/founder/announcements': 'founder/index.html',
  '/founder/trainer-admin': 'founder/index.html',
  '/founder/student-admin': 'founder/index.html',
  '/founder/audit': 'founder/index.html',
  '/rm/dashboard': 'rm/index.html',
  '/rm/trainers': 'rm/index.html',
  '/rm/students': 'rm/index.html',
  '/rm/penalties': 'rm/index.html',
  '/rm/classes': 'rm/index.html',
  '/parent/inbox': 'parent/index.html',
  '/parent/child': 'parent/index.html',
  '/parent/sessions': 'parent/index.html',
  '/parent/guidance': 'parent/index.html',
  '/parent/policies': 'parent/index.html'
};
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
  if (Object.prototype.hasOwnProperty.call(sectionPages, pathname)) {
    return res.sendFile(path.join(webRoot, sectionPages[pathname]));
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
