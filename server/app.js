const config = require('./config');

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const auth = require('./middleware/auth');
const db = require('./db');
const realtime = require('./realtime');
const tokenService = require('./auth/token');
const logger = require('./services/logger');
const rateLimit = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const trainerRoutes = require('./routes/trainer');
const studentRoutes = require('./routes/student');
const sessionRoutes = require('./routes/sessions');
const policyRoutes = require('./routes/policy');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const livekitRoutes = require('./routes/livekit');
const livekitRecordingRoutes = require('./routes/livekitRecording');
const recordingAccessRoutes = require('./routes/recordingAccess');
const feedbackRoutes = require('./routes/generateFeedback');
const aiPingRoutes = require('./routes/aiTestPing');
const razorpayRoutes = require('./routes/razorpay');
const leaveRoutes = require('./routes/leaves');
const contactRoutes = require('./routes/contact');
const demoRoutes = require('./routes/demo');
const chatRoutes = require('./routes/chat');
const parentChatRoutes = require('./routes/parentChat');
const parentReminderRoutes = require('./routes/parentReminders');
const livekitWebhookRoutes = require('./routes/livekitWebhooks');
const rmRoutes = require('./routes/rm');
const networkRoutes = require('./routes/network');
const announcementRoutes = require('./routes/announcements');
const lmsPlannerRoutes = require('./routes/lmsPlanner');
const codeRoutes = require('./routes/code');
const englishRoutes = require('./routes/english');
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
app.use('/api/webhooks/recording', webhookThrottle);
app.use('/api/webhooks/livekit', webhookThrottle);
app.use('/api/contact', contactThrottle);

app.use(cors({
  origin: config.corsOrigins()
}));
/* Razorpay and LiveKit sign the raw body, so these routes must be read first. */
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));
/* LiveKit signs the exact request bytes, so this route must also be read as a
   Buffer before the shared JSON parser touches it. */
app.use('/api/webhooks/livekit', express.raw({ type: 'application/json', limit: '512kb' }));
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
app.use('/api/livekit/recording', livekitRecordingRoutes);
app.use('/api/recordings', recordingAccessRoutes);
app.use('/api/livekit', livekitRoutes);
/* Same handler, shorter path used by the classroom client. */
app.use('/api/get-token', livekitRoutes);
app.use('/api/generate-feedback', feedbackRoutes);
app.use('/api/ai/test-ping', aiPingRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/lms', lmsPlannerRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/english', englishRoutes);
app.use('/api/razorpay', razorpayRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/parent-chat', parentChatRoutes);
app.use('/api/parent', parentReminderRoutes);
app.use('/api/webhooks/livekit', livekitWebhookRoutes);
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
  'landing.css', 'landing.js', 'login.html', 'view-choice.html', 'sw.js'
]);
/* The installable web app assets are public static files. No server source,
   migration, environment file or credential is inside this directory. */
const publicDirs = new Set(['assets', 'classroom', 'founder', 'home', 'lms', 'login', 'parent', 'planner-agent', 'register', 'rm', 'shared', 'student', 'trainer', 'unified', 'webapp']);

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
  '/parent/policies': 'parent/index.html',
  '/app/home': 'unified/index.html',
  '/app/attendance': 'unified/index.html',
  '/app/recordings': 'unified/index.html',
  '/app/mastery': 'unified/index.html',
  '/app/buddy': 'unified/index.html',
  '/app/parent/inbox': 'unified/index.html',
  '/app/parent/child': 'unified/index.html',
  '/app/parent/sessions': 'unified/index.html',
  '/app/parent/guidance': 'unified/index.html',
  '/app/parent/policies': 'unified/index.html',
  '/app/rm/dashboard': 'unified/index.html',
  '/app/rm/trainers': 'unified/index.html',
  '/app/rm/students': 'unified/index.html',
  '/app/rm/penalties': 'unified/index.html',
  '/app/rm/classes': 'unified/index.html',
  '/founder-admin/overview': 'founder-admin/index.html',
  '/founder-admin/policy': 'founder-admin/index.html',
  '/founder-admin/mastery': 'founder-admin/index.html',
  '/founder-admin/trainer-policy': 'founder-admin/index.html',
  '/founder-admin/money': 'founder-admin/index.html',
  '/founder-admin/announcements': 'founder-admin/index.html',
  '/founder-admin/trainer-admin': 'founder-admin/index.html',
  '/founder-admin/student-admin': 'founder-admin/index.html',
  '/founder-admin/audit': 'founder-admin/index.html'
};
const staticFiles = express.static(webRoot, {
  dotfiles: 'deny',
  fallthrough: true,
  index: 'index.html'
});

/* The installable web app is a thin overlay on the reviewed pages. Injecting
   one shared script means every existing HTML entry point -- including section
   routes -- gets the manifest and service worker without a second page copy or
   duplicated business logic. API and founder-gate responses are never touched. */
const WEBAPP_BOOTSTRAP = '<script src="/webapp/register.js"></script>';
/* Development-only review aid. Every rendered page names itself in a small
   fixed badge so review feedback can point at one exact surface. Production
   builds never inject it; the badge also disappears with ?devLabel=0. */
const DEV_PAGE_LABEL_BOOTSTRAP = `<script>
(function () {
  if (new URLSearchParams(window.location.search).get('devLabel') === '0') return;
  var badge = document.createElement('div');
  badge.id = 'mathify-dev-page-label';
  Object.assign(badge.style, {
    position:'fixed',left:'12px',bottom:'12px',zIndex:'99999',
    padding:'6px 9px',borderRadius:'8px',
    background:'rgba(14,20,32,.9)',color:'#FDFAF3',
    font:'500 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace',
    letterSpacing:'.08em',textTransform:'uppercase',
    pointerEvents:'none',boxShadow:'0 4px 14px rgba(0,0,0,.24)'
  });
  function pageName() {
    var path = window.location.pathname.replace(/\\/+$/, '') || '/';
    var params = new URLSearchParams(window.location.search);
    var role = params.get('view') === 'student' || params.get('role') === 'student' ? 'student' : 'trainer';
    if (path.indexOf('/trainer/') === 0) return 'Trainer dashboard / Start class';
    if (path.indexOf('/classroom/connect') === 0) return 'Shared connect page';
    if (path.indexOf('/classroom/') === 0) {
      var sheets = [].slice.call(document.querySelectorAll('.sheet'));
      var visible = sheets.filter(function (sheet) {
        return !sheet.hidden && window.getComputedStyle(sheet).display !== 'none';
      });
      if (visible.some(function (sheet) { return sheet.id === 'sheet-planner'; })) return 'Trainer planner designer';
      if (visible.some(function (sheet) { return sheet.id === 'sheet-quiz'; })) return 'Quiz sheet / ' + role;
      if (document.body.classList.contains('quiz-live')) return 'Quiz sheet / ' + role;
      if (params.get('board') === 'full' || document.body.classList.contains('board-open')) {
        return role === 'student' ? 'Student shared whiteboard' : 'Trainer whiteboard / shared board';
      }
      return role === 'student' ? 'Classroom / student' : 'Classroom / trainer';
    }
    if (path.indexOf('/lms/') === 0) {
      var planner = document.getElementById('sheet-planner');
      return planner && !planner.hidden ? 'Trainer planner designer' : 'LMS curriculum library';
    }
    if (path.indexOf('/student/') === 0) return 'Student dashboard';
    if (path.indexOf('/founder-admin/') === 0) return 'Founder admin gate';
    if (path.indexOf('/founder/') === 0) return 'Founder desk';
    if (path.indexOf('/rm/') === 0) return 'RM desk';
    if (path.indexOf('/parent/') === 0) return 'Parent desk';
    if (path.indexOf('/planner-agent/') === 0) return 'Planner agent desk';
    if (path.indexOf('/app/') === 0) return 'Unified app';
    if (path.indexOf('/login') === 0) return 'Login';
    if (path === '/' || path === '/index.html') return 'Landing page';
    return path.split('/').filter(Boolean).join(' / ') || 'Mathify page';
  }
  function paint() {
    var host = document.fullscreenElement || document.body;
    if (!host) return;
    if (badge.parentNode !== host) host.appendChild(badge);
    badge.textContent = 'DEV PAGE · ' + pageName();
  }
  paint();
  window.setInterval(paint, 600);
}());
</script>`;
function sendWebAppHtml(filePath, req, res, next) {
  fs.readFile(filePath, 'utf8', function (error, html) {
    if (error) return next(error);
    var injection = '';
    if (html.indexOf('/webapp/register.js') === -1) injection += WEBAPP_BOOTSTRAP;
    if (process.env.NODE_ENV !== 'production' &&
        html.indexOf('mathify-dev-page-label') === -1) injection += DEV_PAGE_LABEL_BOOTSTRAP;
    if (injection) {
      const marker = '</body>';
      const index = html.toLowerCase().lastIndexOf(marker);
      html = index === -1
        ? html + injection
        : html.slice(0, index) + injection + html.slice(index);
    }
    res.set('Cache-Control', 'no-cache');
    return res.type('html').send(html);
  });
}

app.get('/sw.js', function (req, res, next) {
  res.set('Service-Worker-Allowed', '/');
  res.set('Cache-Control', 'no-cache');
  return res.type('application/javascript').sendFile(path.join(webRoot, 'sw.js'), function (error) {
    if (error) return next(error);
  });
});

app.get('/webapp/manifest.webmanifest', function (req, res, next) {
  res.set('Cache-Control', 'public, max-age=3600');
  return res.type('application/manifest+json')
    .sendFile(path.join(webRoot, 'webapp', 'manifest.webmanifest'), function (error) {
      if (error) return next(error);
    });
});

/* The founder desk is deliberately outside the unified app. It is served from
   the reviewed founder assets under a separate gated entry: a short-lived
   HttpOnly cookie set only after a verified founder sign-in. API RBAC still
   authorizes every founder operation independently. */
function readCookies(req) {
  const result = {};
  String(req.headers.cookie || '').split(';').forEach(function (part) {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    if (key) result[key] = part.slice(index + 1).trim();
  });
  return result;
}

async function requireFounderDesktop(req, res, next) {
  const payload = tokenService.verify(readCookies(req).mathify_founder_gate, 'access');
  if (!payload || payload.role !== 'founder') {
    return res.status(403).json({
      error: 'FOUNDER_DESK_REQUIRED',
      message: 'Sign in as the founder to open the admin application.'
    });
  }
  try {
    const user = await db.findUserById(payload.sub);
    if (!user || user.role !== 'founder' || user.status !== 'active' ||
      Number(payload.ver || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(403).json({
        error: 'FOUNDER_DESK_REQUIRED',
        message: 'Sign in as the founder to open the admin application.'
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

const founderAdminFiles = new Set([
  'app.js', 'announcements.js', 'adminDesk.js', 'founder.css', 'announcements.css'
]);

app.get(/^\/founder-admin(?:\/(.*))?$/, requireFounderDesktop, function (req, res, next) {
  const requested = String(req.params[0] || '').replace(/^\/+/, '');
  if (!requested || requested === 'index.html') {
    return sendWebAppHtml(path.join(webRoot, 'founder-admin', 'index.html'), req, res, next);
  }
  const file = path.basename(requested);
  if (requested.indexOf('/') === -1 && founderAdminFiles.has(file)) {
    return res.sendFile(path.join(webRoot, 'founder', file));
  }
  return next();
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
    return sendWebAppHtml(path.join(webRoot, sectionPages[pathname]), req, res, next);
  }
  const segments = pathname.split('/').filter(Boolean);

  if (!segments.length) {
    return sendWebAppHtml(path.join(webRoot, 'index.html'), req, res, next);
  }
  if (segments.some(function (segment) { return segment.charAt(0) === '.'; })) {
    return next();
  }
  const htmlFile = pathname.toLowerCase().endsWith('.html');
  if (htmlFile && (segments.length === 1 ? publicFiles.has(segments[0]) : publicDirs.has(segments[0]))) {
    const filePath = path.resolve(webRoot, '.' + pathname);
    if (filePath.startsWith(webRoot + path.sep) && fs.existsSync(filePath)) {
      return sendWebAppHtml(filePath, req, res, next);
    }
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
