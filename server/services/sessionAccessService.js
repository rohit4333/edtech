/* Classroom access window + explicit observer policy.
 *
 * Trainer and student may enter the same session room from ten minutes before
 * the scheduled start. A live session stays open. Founder access is not silent:
 * it requires an explicit observer request, is stored on the session, and is
 * broadcast to the room so both real participants can see it.
 *
 * The browser is never the authority. Every entry is re-evaluated server-side
 * when an RTC token is requested. */
const appPolicy = require('../config/policy.json');

const DEFAULTS = {
  earlyJoinMinutes: 10,
  founderObserverRequiresOptIn: true
};

const OBSERVER_ROLES = ['founder'];

function settings() {
  const configured = appPolicy.sessionAccess && typeof appPolicy.sessionAccess === 'object'
    ? appPolicy.sessionAccess : {};
  const minutes = Number(configured.earlyJoinMinutes);
  return {
    earlyJoinMinutes: Number.isFinite(minutes) && minutes >= 0
      ? minutes : DEFAULTS.earlyJoinMinutes,
    founderObserverRequiresOptIn: configured.founderObserverRequiresOptIn !== false
  };
}

function sessionStart(session) {
  if (!session) return null;
  const value = session.scheduledAt || session.startsAt || session.startedAt || session.date;
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function truthy(value) {
  if (value === true || value === 1) return true;
  return String(value === undefined || value === null ? '' : value).toLowerCase() === 'true';
}

function isObserverRole(user) {
  return Boolean(user && OBSERVER_ROLES.indexOf(user.role) !== -1);
}

function observerRequested(user, options) {
  if (!isObserverRole(user)) return false;
  const source = options && typeof options === 'object' ? options : {};
  return truthy(source.observer) || truthy(source.observe);
}

function denial(base, code, status, reason) {
  return Object.assign({}, base, { canEnter: false, code: code, status: status, reason: reason });
}

function evaluate(session, user, options) {
  const config = settings();
  const start = sessionStart(session);
  const base = {
    earlyJoinMinutes: config.earlyJoinMinutes,
    opensAt: start === null ? null : new Date(start - config.earlyJoinMinutes * 60000).toISOString(),
    observer: observerRequested(user, options),
    canEnter: false,
    code: 'ROOM_NOT_OPEN',
    status: 409,
    reason: ''
  };

  if (!session) return denial(base, 'SESSION_NOT_FOUND', 404, 'Session not found.');
  if (session.status === 'ended') {
    return denial(base, 'SESSION_ENDED', 409, 'This session has ended.');
  }

  if (isObserverRole(user) && config.founderObserverRequiresOptIn && !base.observer) {
    return denial(
      base,
      'FOUNDER_OBSERVER_REQUIRED',
      403,
      'Observer access requires an explicit observer request.'
    );
  }

  if (user && user.role !== 'trainer' && user.role !== 'student' && !isObserverRole(user)) {
    return denial(base, 'PARTICIPANT_REQUIRED', 403, 'This role cannot enter the classroom.');
  }

  if (session.status === 'live') {
    return Object.assign({}, base, { canEnter: true, code: 'OPEN', status: 200, reason: '' });
  }
  if (session.status !== 'scheduled') {
    return denial(base, 'ROOM_NOT_OPEN', 409, 'This session is not open for joining.');
  }
  if (start === null) {
    return denial(base, 'ROOM_NOT_OPEN', 409, 'This session has no scheduled start time.');
  }
  if (Date.now() < start - config.earlyJoinMinutes * 60000) {
    return denial(
      base,
      'ROOM_NOT_OPEN',
      409,
      'The room opens ' + config.earlyJoinMinutes + ' minutes before the session.'
    );
  }

  return Object.assign({}, base, { canEnter: true, code: 'OPEN', status: 200, reason: '' });
}

function publicState(session) {
  const value = session && session.founderObserver;
  if (!value) return null;
  return {
    active: Boolean(value.active),
    name: value.name || 'Founder',
    role: 'founder',
    joinedAt: value.joinedAt || null,
    leftAt: value.leftAt || null
  };
}

function setObserver(session, user, at) {
  const previous = session && session.founderObserver;
  const unchanged = Boolean(previous && previous.active && previous.userId === user.id);
  const next = Object.assign({}, session, {
    founderObserver: {
      active: true,
      userId: user.id,
      name: user.name || 'Founder',
      role: 'founder',
      joinedAt: unchanged && previous.joinedAt ? previous.joinedAt : at,
      reason: 'explicit observer'
    }
  });
  return { session: next, changed: !unchanged };
}

function clearObserver(session, at) {
  const previous = session && session.founderObserver;
  if (!previous || !previous.active) return { session: session, changed: false };
  return {
    session: Object.assign({}, session, {
      founderObserver: Object.assign({}, previous, { active: false, leftAt: at })
    }),
    changed: true
  };
}

module.exports = {
  settings,
  sessionStart,
  evaluate,
  publicState,
  setObserver,
  clearObserver,
  eventPayload: publicState
};
