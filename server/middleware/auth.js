const db = require('../db');
const token = require('../auth/token');

function publicUser(user) {
  if (!user) return null;
  const safe = Object.assign({}, user);
  delete safe.passwordHash;
  return safe;
}

function getBearer(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function requireAuth(req, res, next) {
  const payload = token.verify(getBearer(req));
  if (!payload) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign in to continue.' });
  }

  const user = db.findUserById(payload.sub);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Account is not active.' });
  }

  req.user = publicUser(user);
  return next();
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

function loadSession(req, res, next) {
  const id = sessionIdFrom(req);
  const session = db.findSession(id);
  if (!session) {
    return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session does not exist.' });
  }
  if (!canAccessSession(req.user, session)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not part of this session.' });
  }
  req.sessionRecord = session;
  return next();
}

module.exports = {
  publicUser,
  requireAuth,
  requireRole,
  canAccessSession,
  loadSession
};
