const db = require('../db');
const token = require('../auth/token');
const trainerAccess = require('../services/trainerAccessService');

/* Identity returned to the browser. Contact details are never part of it. */
/* Timezone is a display preference, not a contact detail: it is safe in the
   signed-in identity and required to render class times in the viewer's zone. */
const PUBLIC_USER_KEYS = ['id', 'name', 'role', 'timezone'];

/* Business fields the Express handlers need for the signed-in user only. */
const SESSION_USER_KEYS = [
  'id', 'name', 'role', 'status', 'title', 'grade', 'mastery', 'streak', 'batch',
  'sessionsRemaining', 'payPerSession', 'maxHoursPerDay', 'maxSessionsPerDay',
  'badges', 'trophyPoints', 'timezone',
  /* Internal routing key only. /auth/me still uses PUBLIC_USER_KEYS, so this
     link never reaches a browser identity payload. */
  'childId'
];

function pickKeys(user, keys) {
  if (!user) return null;
  const safe = {};
  keys.forEach(function (key) {
    if (user[key] !== undefined) safe[key] = user[key];
  });
  return safe;
}

function publicUser(user) {
  return pickKeys(user, PUBLIC_USER_KEYS);
}

function sessionUser(user) {
  return pickKeys(user, SESSION_USER_KEYS);
}

function getBearer(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function requireAuth(req, res, next) {
  try {
    const payload = token.verify(getBearer(req));
    if (!payload) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign in to continue.' });
    }

    /* Mock reads are synchronous; the live Supabase adapter is async. Awaiting
       both keeps identity loading identical in every database mode. */
    const user = await db.findUserById(payload.sub);
    const pendingStaff = user && user.status === 'pending' &&
      (user.role === 'trainer' || user.role === 'relationship_manager');
    if (!user || (user.status !== 'active' && !pendingStaff)) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Account is not active.' });
    }

    /* A trainer whose KYC is not founder-approved may sign in only to finish
       onboarding, read the locked dashboard notice and change a handover
       password. Every roster, batch, session and classroom endpoint is refused
       here before any handler can load data. */
    if (user.role === 'trainer' && user.status === 'pending') {
      const requestPath = String(req.originalUrl || req.path || '').split('?')[0];
      const setupOnly = /^\/api\/auth\/me$/.test(requestPath) ||
        /^\/api\/auth\/password\/change$/.test(requestPath) ||
        /^\/api\/trainer\/onboarding(?:\/|$)/.test(requestPath) ||
        requestPath === '/api/trainer/dashboard' ||
        requestPath === '/api/trainer/quiz/templates';
      if (!setupOnly) {
        const access = await trainerAccess.evaluate(user);
        return res.status(403).json(trainerAccess.lockedResponse(access));
      }
    }

    /* A relationship manager follows the same founder-authorised onboarding
       path. Until the founder grants access, only KYC setup, the locked desk
       notice and the handover password change are reachable. */
    if (user.role === 'relationship_manager' && user.status === 'pending') {
      const requestPath = String(req.originalUrl || req.path || '').split('?')[0];
      const setupOnly = requestPath === '/api/auth/me' ||
        requestPath === '/api/auth/password/change' ||
        /^\/api\/rm\/onboarding(?:\/|$)/.test(requestPath) ||
        requestPath === '/api/rm/dashboard';
      if (!setupOnly) {
        const access = await trainerAccess.evaluate(user);
        return res.status(403).json(trainerAccess.lockedResponse(access));
      }
    }

    req.user = sessionUser(user);
    return next();
  } catch (error) {
    console.error('Auth identity load failed:', error.message);
    return res.status(500).json({ error: 'AUTH_DB_ERROR', message: 'Unable to load the signed-in account.' });
  }
}

function requireRole() {
  const roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign in to continue.' });
    }
    if (roles.indexOf(req.user.role) === -1) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'This role cannot access that resource.' });
    }
    return next();
  };
}

function canAccessSession(user, session) {
  if (!user || !session) return false;
  if (user.role === 'founder') return true;
  if (user.role === 'trainer') return session.trainerId === user.id;
  if (user.role === 'student') return session.studentId === user.id;
  /* Parent access is limited to sessions of their own child. This stays a
     synchronous check so every existing session middleware keeps working. */
  if (user.role === 'parent') return Boolean(user.childId && user.childId === session.studentId);
  return false;
}

/* Router-level middleware runs before Express populates route params, so the
   session id must also be readable from the URL when this is mounted with
   router.use('/:sessionId/...'). Route-level mounts still use req.params. */
function sessionIdFrom(req) {
  if (req.params && (req.params.sessionId || req.params.id)) {
    return req.params.sessionId || req.params.id;
  }
  const path = String(req.path || req.originalUrl || '');
  const match = path.match(/\/([^/]+)(?:\/|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function loadSession(req, res, next) {
  try {
    const id = sessionIdFrom(req);
    /* A live Supabase lookup returns a Promise; a mock lookup returns a value.
       Awaiting both prevents a Promise from being treated as a session record. */
    const session = await db.findSession(id);
    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session does not exist.' });
    }
    if (!canAccessSession(req.user, session)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this session.' });
    }
    req.sessionRecord = session;
    return next();
  } catch (error) {
    console.error('Session load failed:', error.message);
    return res.status(500).json({ error: 'SESSION_DB_ERROR', message: 'Unable to load that session.' });
  }
}

module.exports = {
  publicUser,
  sessionUser,
  requireAuth,
  requireRole,
  canAccessSession,
  loadSession
};
