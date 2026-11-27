/* LMS staff access gate.
 *
 * Token payloads are read only to shape the browser UI; the server verifies
 * every request independently. Relationship managers are refused here before
 * any LMS request is made, and trainers are confined to their own academic
 * subject. Founder and the planner agent see all three subjects. No policy,
 * role or payment branch is created here — this is the same subject catalogue
 * used by the API.
 */
(function () {
  'use strict';

  var ROLE_KEYS = {
    founder: ['mathify.classroom.token.founder'],
    trainer: ['mathify.trainer.token', 'mathify.classroom.token.trainer'],
    rm: ['mathify.classroom.token.relationship_manager', 'mathify.rm.token'],
    planner_agent: ['mathify.planner.token', 'mathify.classroom.token.planner_agent']
  };
  var ALIASES = {
    maths: 'math', mathematics: 'math', numeracy: 'math',
    code: 'coding', programming: 'coding', javascript: 'coding',
    communication: 'english', 'public speaking': 'english',
    reading: 'english', writing: 'english'
  };

  var identity = { role: null, subject: null, denied: false };
  var activeToken = null;

  function read(key) {
    try { return window.localStorage.getItem(key) || null; } catch (error) { return null; }
  }

  function normalize(value) {
    var key = String(value === null || value === undefined ? '' : value)
      .trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    return ALIASES[key] || (key === 'math' || key === 'coding' || key === 'english' ? key : null);
  }

  /* The existing payload decoder is read-only. A token is only a clue for the
     browser UI: a malformed, expired or refresh token is never a staff token. */
  function payloadOf(token) {
    if (typeof token !== 'string' || token.split('.').length !== 3) return null;
    try {
      var encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (encoded.length % 4) encoded += '=';
      var binary = window.atob(encoded);
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      var payload = JSON.parse(new TextDecoder().decode(bytes));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
      if (payload.kind === 'refresh') return null;
      if (typeof payload.exp === 'number' && payload.exp <= Date.now() / 1000) return null;
      return payload;
    } catch (error) { return null; }
  }

  function roleName(value) {
    var role = String(value === null || value === undefined ? '' : value)
      .trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (role === 'relationship_manager' || role === 'rm') return 'rm';
    if (role === 'planner_agent' || role === 'planneragent') return 'planner_agent';
    return role === 'founder' || role === 'trainer' ? role : null;
  }

  function candidate(value, source) {
    if (!value) return null;
    var payload = payloadOf(value);
    var role = roleName(payload && payload.role);
    if (!role) return null;
    return { role: role, payload: payload, token: value, source: source };
  }

  function candidates() {
    var list = [];
    var injected = candidate(window.MATHIFY_ACCESS_TOKEN, 'injected');
    if (injected) list.push(injected);
    Object.keys(ROLE_KEYS).forEach(function (role) {
      ROLE_KEYS[role].forEach(function (key) {
        var item = candidate(read(key), 'stored');
        if (item) list.push(item);
      });
    });
    return list;
  }

  /* The active desk is the one the page was opened for. An explicit page hint
     outranks every other token in the browser; the injected token is only a
     fallback hint when no page signal is present. */
  function deskRole(list) {
    var hint = null;
    try {
      var params = new URLSearchParams(window.location && window.location.search);
      hint = roleName(params.get('role') || params.get('view'));
    } catch (error) { hint = null; }
    if (!hint && window.document && document.body && document.body.dataset) {
      hint = roleName(document.body.dataset.role || document.body.dataset.desk);
    }
    if (!hint && window.MATHIFY_USER) hint = roleName(window.MATHIFY_USER.role);
    if (!hint) {
      var injected = list.find(function (item) { return item.source === 'injected'; });
      if (injected) hint = injected.role;
    }
    return hint;
  }

  function pickActive(list, wanted) {
    var pool = wanted ? list.filter(function (item) { return item.role === wanted; }) : list;
    if (!pool.length) pool = list;
    if (wanted) {
      return pool.find(function (item) { return item.source === 'injected'; }) || pool[0] || null;
    }
    /* With no page hint, a leftover RM token must never outrank a staff desk. */
    return pool.find(function (item) { return item.role === 'founder'; }) ||
      pool.find(function (item) { return item.role === 'trainer'; }) ||
      pool.find(function (item) { return item.role === 'planner_agent'; }) ||
      pool[0] || null;
  }

  function detect() {
    var list = candidates();
    var active = pickActive(list, deskRole(list));
    activeToken = active ? active.token : null;
    if (!active) {
      var guestSubject = window.MATHIFY_USER ? normalize(window.MATHIFY_USER.subject) : null;
      identity = { role: null, subject: guestSubject, denied: false };
      return identity;
    }
    if (active.role === 'rm') {
      identity = { role: 'rm', subject: null, denied: true };
      return identity;
    }
    /* No localStorage subject key here: those values are user-editable. */
    var subject = normalize(active.payload.subject);
    if (!subject && window.MATHIFY_USER) subject = normalize(window.MATHIFY_USER.subject);
    identity = { role: active.role, subject: subject, denied: false };
    return identity;
  }

  identity = detect();

  /* The catalog is role-filtered server-side with the verified token. For a
     trainer it returns exactly one field, which wins over any older client-side
     guess; a stale browser value never overrides the server's answer. */
  function applyCatalog(subjects) {
    if (identity.role === 'trainer') {
      var visible = (Array.isArray(subjects) ? subjects : []).map(function (item) {
        return normalize(item && (item.subject || item.slug));
      }).filter(Boolean);
      if (visible.length === 1) identity.subject = visible[0];
      else if (visible.length > 1 && identity.subject && visible.indexOf(identity.subject) === -1) {
        identity.subject = null;
      }
    }
    return identity.subject;
  }

  function allowedSubjects(subjects) {
    if (identity.denied) return [];
    var list = Array.isArray(subjects) ? subjects.slice() : [];
    if (identity.role !== 'trainer') return list;
    if (!identity.subject) return [];
    return list.filter(function (item) {
      return normalize(item && (item.subject || item.slug)) === identity.subject;
    });
  }

  function token() {
    if (identity.denied) return null;
    var injected = window.MATHIFY_ACCESS_TOKEN;
    if (injected) {
      var injectedRole = roleName(payloadOf(injected));
      if (!identity.role || injectedRole === identity.role) return injected;
    }
    var list = candidates();
    var active = pickActive(list, identity.role);
    return active ? active.token : (activeToken || null);
  }

  function canUse(subject) {
    if (identity.denied) return false;
    if (identity.role !== 'trainer' || !identity.subject) return true;
    return normalize(subject) === identity.subject;
  }

  /* Authoring is founder-only. Trainers and planner agents get a view-only
     library and view-only planner surface; their tokens never unlock a write. */
  function canAuthor() { return identity.role === 'founder'; }
  function isTrainer() { return identity.role === 'trainer'; }
  function isAgent() { return identity.role === 'planner_agent'; }

  window.MathifyLmsAccess = {
    detect: function () { identity = detect(); return identity; },
    current: function () { return { role: identity.role, subject: identity.subject, denied: identity.denied }; },
    role: function () { return identity.role; },
    subject: function () { return identity.subject; },
    isDenied: function () { return identity.denied; },
    message: function () { return 'LMS access is founder, trainer and planner agent only.'; },
    token: token,
    normalize: normalize,
    applyCatalog: applyCatalog,
    allowedSubjects: allowedSubjects,
    canUse: canUse,
    canAuthor: canAuthor,
    isTrainer: isTrainer,
    isAgent: isAgent
  };
}());
