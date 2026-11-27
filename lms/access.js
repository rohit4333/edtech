/* LMS staff access gate.
 *
 * Token payloads are read only to shape the browser UI; the server verifies
 * every request independently. Relationship managers are refused here before
 * any LMS request is made, and trainers are confined to their own academic
 * subject. Founder sees all three subjects. No policy, role or payment branch
 * is created here — this is the same subject catalogue used by the API.
 */
(function () {
  'use strict';

  var ROLE_KEYS = {
    founder: ['mathify.classroom.token.founder'],
    trainer: ['mathify.trainer.token', 'mathify.classroom.token.trainer'],
    rm: ['mathify.classroom.token.relationship_manager', 'mathify.rm.token']
  };
  var SUBJECT_KEYS = [
    'mathify.trainer.subject', 'mathify.classroom.subject',
    'mathify.user.subject', 'mathify.subject'
  ];
  var ALIASES = {
    maths: 'math', mathematics: 'math', numeracy: 'math',
    code: 'coding', programming: 'coding', javascript: 'coding',
    communication: 'english', 'public speaking': 'english',
    reading: 'english', writing: 'english'
  };

  var identity = { role: null, subject: null, denied: false };

  function read(key) {
    try { return window.localStorage.getItem(key) || null; } catch (error) { return null; }
  }

  function normalize(value) {
    var key = String(value === null || value === undefined ? '' : value)
      .trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    return ALIASES[key] || (key === 'math' || key === 'coding' || key === 'english' ? key : null);
  }

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
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) { return null; }
  }

  function detect() {
    var tokens = [];
    Object.keys(ROLE_KEYS).forEach(function (role) {
      ROLE_KEYS[role].forEach(function (key) {
        var value = read(key);
        if (value) tokens.push({ role: role, payload: payloadOf(value), token: value });
      });
    });
    if (window.MATHIFY_ACCESS_TOKEN) {
      tokens.push({
        role: null, payload: payloadOf(window.MATHIFY_ACCESS_TOKEN), token: window.MATHIFY_ACCESS_TOKEN
      });
    }

    var rm = tokens.some(function (item) {
      var role = item.payload && item.payload.role;
      return item.role === 'rm' || role === 'relationship_manager' || role === 'rm';
    });
    if (rm) return { role: 'rm', subject: null, denied: true };

    var founder = tokens.find(function (item) {
      return item.role === 'founder' || (item.payload && item.payload.role === 'founder');
    });
    if (founder) {
      return {
        role: 'founder',
        subject: normalize(founder.payload && founder.payload.subject),
        denied: false
      };
    }

    var trainer = tokens.find(function (item) {
      return item.role === 'trainer' || (item.payload && item.payload.role === 'trainer');
    });
    if (trainer) {
      var stored = null;
      SUBJECT_KEYS.some(function (key) {
        var value = normalize(read(key));
        if (value) { stored = value; return true; }
        return false;
      });
      if (!stored && window.MATHIFY_USER) stored = normalize(window.MATHIFY_USER.subject);
      return {
        role: 'trainer',
        subject: stored || normalize(trainer.payload && trainer.payload.subject),
        denied: false
      };
    }

    var guestSubject = window.MATHIFY_USER ? normalize(window.MATHIFY_USER.subject) : null;
    return { role: null, subject: guestSubject, denied: false };
  }

  identity = detect();

  /* The catalog is role-filtered server-side. When a trainer token is present
     it returns exactly that trainer's subject, which is the safest place to
     derive the field from. */
  function applyCatalog(subjects) {
    if (identity.role === 'trainer' && !identity.subject && Array.isArray(subjects) && subjects.length === 1) {
      identity.subject = normalize(subjects[0] && (subjects[0].subject || subjects[0].slug));
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
    var wanted = identity.role === 'trainer' ? 'trainer' : 'founder';
    var keys = ROLE_KEYS[wanted] || [];
    var candidates = [];
    keys.forEach(function (key) {
      var value = read(key);
      if (value) candidates.push({ value: value, payload: payloadOf(value) });
    });
    if (identity.subject) {
      var match = candidates.find(function (item) {
        return normalize(item.payload && item.payload.subject) === identity.subject;
      });
      if (match) return match.value;
    }
    if (candidates.length) return candidates[0].value;
    return window.MATHIFY_ACCESS_TOKEN || null;
  }

  function canUse(subject) {
    if (identity.denied) return false;
    if (identity.role !== 'trainer' || !identity.subject) return true;
    return normalize(subject) === identity.subject;
  }

  window.MathifyLmsAccess = {
    detect: function () { identity = detect(); return identity; },
    current: function () { return { role: identity.role, subject: identity.subject, denied: identity.denied }; },
    role: function () { return identity.role; },
    subject: function () { return identity.subject; },
    isDenied: function () { return identity.denied; },
    message: function () { return 'LMS access is founder/trainer only.'; },
    token: token,
    normalize: normalize,
    applyCatalog: applyCatalog,
    allowedSubjects: allowedSubjects,
    canUse: canUse
  };
}());
