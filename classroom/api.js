/* Mathify classroom API client.
 *
 * The classroom used to rely on raw fetch calls and an injected token. This
 * module gives it the same authenticated client as the student and trainer
 * desks, plus the two operations that were missing: ending a session and
 * reading the browser-safe session event stream.
 *
 * No secrets are stored here. A caller-supplied access token always wins;
 * otherwise a verified credential token is required and the browser is sent
 * to /login.html when none is present. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var params = new URLSearchParams(window.location.search);
  var TOKEN_PREFIX = 'mathify.classroom.token.';

  /* The token payload is read only to choose a client identity, never to grant
     access. The server verifies every request independently. */
  function tokenRole(token) {
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
      return payload.role === 'student' || payload.role === 'trainer' || payload.role === 'founder'
        ? payload.role : null;
    } catch (error) { return null; }
  }

  /* Read-only opaque id used only to compare IDE ownership. Never a name,
     email, phone or any contact/KYC/bank field. */
  function tokenSubject(token) {
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
      var value = payload.sub || payload.userId || payload.id;
      if (typeof value !== 'string' && typeof value !== 'number') return null;
      var text = String(value);
      /* An opaque id only. Never forward an email or phone-shaped value into
         IDE ownership state, even if a token happens to carry one. */
      if (text.indexOf('@') >= 0 || /^\+?[\d\s()-]{7,}$/.test(text)) return null;
      return text;
    } catch (error) { return null; }
  }

  function storedToken(roleName) {
    try { return window.localStorage.getItem(TOKEN_PREFIX + roleName); } catch (error) { return null; }
  }

  function preferredRole() {
    if (params.get('view') === 'student' || params.get('role') === 'student') return 'student';
    if (params.get('role') === 'trainer') return 'trainer';
    if (params.get('role') === 'founder') return 'founder';
    var injected = tokenRole(window.MATHIFY_ACCESS_TOKEN);
    if (injected) return injected === 'founder' ? 'trainer' : injected;
    var trainerToken = tokenRole(storedToken('trainer'));
    if (trainerToken) return 'trainer';
    var studentToken = tokenRole(storedToken('student'));
    if (studentToken) return 'student';
    if (window.MATHIFY_USER && window.MATHIFY_USER.role === 'student') return 'student';
    return 'trainer';
  }

  var role = preferredRole();
  /* Student and trainer desks can be open in the same browser. Separate keys
     stop a trainer token from being reused on student-sized requests. */
  var TOKEN_KEY = TOKEN_PREFIX + role;
  var memoryToken = null;

  function readToken() {
    if (window.MATHIFY_ACCESS_TOKEN) return window.MATHIFY_ACCESS_TOKEN;
    if (memoryToken) return memoryToken;
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (error) { return null; }
  }

  function writeToken(value) {
    memoryToken = value;
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch (error) { /* private mode */ }
  }

  function rawRequest(path, options, tokenValue) {
    var settings = options || {};
    var headers = { Accept: 'application/json' };
    if (tokenValue) headers.Authorization = 'Bearer ' + tokenValue;
    if (settings.body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(BASE + path, {
      method: settings.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      keepalive: settings.keepalive === true,
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
        if (!response.ok) {
          var problem = new Error((data && data.message) || 'API request failed.');
          problem.status = response.status;
          problem.code = data && data.error;
          problem.data = data;
          throw problem;
        }
        return data;
      });
    });
  }

  function request(path, options) {
    var settings = options || {};
    if (settings.skipAuth) return rawRequest(path, settings, null);
    return ensureAuth().then(function (tokenValue) {
      return rawRequest(path, settings, tokenValue).catch(function (error) {
        if (error.status !== 401 || window.MATHIFY_ACCESS_TOKEN) throw error;
        if (!window.MathifySession) return Promise.reject(requireLogin());
        return window.MathifySession.refresh(role).then(function (fresh) {
          if (!fresh) return Promise.reject(requireLogin());
          writeToken(fresh);
          return rawRequest(path, settings, fresh).catch(function (again) {
            if (again.status === 401) return Promise.reject(requireLogin());
            throw again;
          });
        });
      });
    });
  }

  function login(email, password) {
    return rawRequest('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: { email: email, password: password }
    }, null).then(function (data) {
      writeToken(data.token);
      if (data.refreshToken && window.MathifySession) {
        window.MathifySession.store(role, data.refreshToken, data.token);
      }
      return data.token;
    });
  }

  /* The copied classroom link is not a login. An injected token (used by
     automated checks) still wins; every other viewer needs real credentials. */
  function requireLogin() {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (error) { /* private mode */ }
    memoryToken = null;
    var next = window.location.pathname + window.location.search;
    var target = '/login.html?role=' + encodeURIComponent(role) +
      '&next=' + encodeURIComponent(next);
    if (window.location.replace) window.location.replace(target);
    else window.location.href = target;
    return new Error('SIGN_IN_REQUIRED');
  }

  function ensureAuth() {
    var existing = readToken();
    if (existing) return Promise.resolve(existing);
    return Promise.reject(requireLogin());
  }

  function sessionPath(sessionId) {
    return '/sessions/' + encodeURIComponent(sessionId);
  }

  window.mathifyClassroomApi = {
    base: BASE,
    role: role,
    request: request,
    ensureAuth: ensureAuth,
    getSessionState: function (sessionId) {
      return request(sessionPath(sessionId) + '/state').then(function (data) { return data.state; });
    },
    getSessionEvents: function (sessionId, since) {
      return request(sessionPath(sessionId) + '/events?since=' + encodeURIComponent(since || 0))
        .then(function (data) { return data.events || []; });
    },
    /* Live 1:1 call identity. No body is sent: channel, uid and role are
       derived by the server from the verified session, never by this page. */
    getRtcToken: function (sessionId, options) {
      var settings = options || {};
      var body = settings.observer === true ? { observer: true } : undefined;
      return request(sessionPath(sessionId) + '/rtc-token', {
        method: 'POST',
        body: body
      }).then(function (data) { return data && data.rtc; });
    },
    /* LiveKit token. The room is still derived by the server from the verified
       session; this page only forwards the session id and observer opt-in. */
    getLiveKitToken: function (sessionId, options) {
      var settings = options || {};
      var body = { sessionId: sessionId };
      if (settings.observer === true) body.observer = true;
      if (settings.roomName) body.roomName = settings.roomName;
      if (settings.participantName) body.participantName = settings.participantName;
      return request('/get-token', { method: 'POST', body: body })
        .then(function (data) { return data && (data.rtc || data); });
    },
    /* The real JWT role is decoded from the token; a founder is deliberately
       mapped to the trainer-shaped call surface, so ask the token here. */
    viewerRole: function () {
      return tokenRole(readToken()) || role;
    },
    /* Opaque session participant id for editor hand-off comparisons only. */
    viewerId: function () {
      return tokenSubject(readToken()) ||
        (window.MATHIFY_USER && (window.MATHIFY_USER.id || window.MATHIFY_USER.userId)) || null;
    },
    /* Trainer-only. The server derives the session and rejects a student call. */
    setMediaPermission: function (sessionId, studentCanToggleMedia) {
      return request(sessionPath(sessionId) + '/media-permission', {
        method: 'POST',
        body: { studentCanToggleMedia: studentCanToggleMedia !== false }
      }).then(function (data) { return data && data.mediaPermissions; });
    },
    /* Trainer-only intentional mic/camera state. Separate from Access so a
       trainer can mute or switch off the camera even while controls are locked. */
    setTrainerMediaState: function (sessionId, patch) {
      return request(sessionPath(sessionId) + '/media-state', {
        method: 'POST',
        body: patch || {}
      }).then(function (data) { return data && data.mediaPermissions; });
    },
    /* Trainer-only. Pausing applause does not change any other permission. */
    setReactionPermission: function (sessionId, patch) {
      return request(sessionPath(sessionId) + '/reaction-permission', {
        method: 'POST',
        body: patch || {}
      }).then(function (data) { return data && data.reactionPermissions; });
    },
    /* Each verified participant reports only their own measurement. */
    reportNetworkCheck: function (sessionId, measurement) {
      return request(sessionPath(sessionId) + '/network-check', {
        method: 'POST',
        body: measurement || {}
      }).then(function (data) { return data && data.network; });
    },
    sendChat: function (sessionId, text) {
      return request(sessionPath(sessionId) + '/chat', {
        method: 'POST',
        body: { text: text }
      }).then(function (data) { return data.message; });
    },
    shareBoard: function (sessionId, shared) {
      return request(sessionPath(sessionId) + '/board/share', {
        method: 'POST',
        body: { shared: shared !== false }
      });
    },
    /* Full-screen board ink. Only the verified trainer or founder may write;
       the student receives the same scrubbed event stream as any participant. */
    pushBoardInk: function (sessionId, payload) {
      return request(sessionPath(sessionId) + '/board/ink', {
        method: 'POST',
        body: payload || {}
      });
    },
    awardBadge: function (sessionId, badgeId) {
      return request(sessionPath(sessionId) + '/badges', {
        method: 'POST',
        body: { badgeId: badgeId }
      }).then(function (data) { return data && data.badge; });
    },
    /* A reaction is a role-tagged gesture. The emoji allowlist is enforced by
       the server from the JWT role; the client cannot send trainer gestures. */
    sendReaction: function (sessionId, emoji) {
      return request(sessionPath(sessionId) + '/reactions', {
        method: 'POST',
        body: { emoji: emoji }
      }).then(function (data) { return data; });
    },
    /* Celebrations are server-owned. A client may only request a configured
       trigger and offer a style preference id from the public catalog. */
    sendCelebration: function (sessionId, trigger, preference) {
      return request(sessionPath(sessionId) + '/celebrate', {
        method: 'POST',
        body: {
          trigger: trigger,
          studentPref: preference && role === 'student' ? preference : null,
          trainerPref: preference && role !== 'student' ? preference : null
        }
      }).then(function (data) { return data; });
    },
    getPublicConfig: function () {
      return request('/public/config');
    },
    notifyParent: function (sessionId, note) {
      return request(sessionPath(sessionId) + '/notify-parent', {
        method: 'POST',
        body: { note: note || '' }
      });
    },
    endSession: function (sessionId, body) {
      return request(sessionPath(sessionId) + '/end', { method: 'POST', body: body || {} });
    },
    revealQuestion: function (sessionId, questionId) {
      return request('/trainer' + sessionPath(sessionId) + '/quiz/reveal', {
        method: 'POST',
        body: questionId ? { questionId: questionId } : { all: true }
      });
    },
    startReteach: function (sessionId, reason) {
      return request('/trainer' + sessionPath(sessionId) + '/quiz/reteach', {
        method: 'POST',
        body: { reason: reason || null }
      });
    },
    grantHint: function (sessionId, questionId, hintIndex) {
      return request('/trainer' + sessionPath(sessionId) + '/quiz/hints', {
        method: 'POST',
        body: { questionId: questionId, hintIndex: hintIndex || 1 }
      });
    },

    /* ------------------------------------------------------- coding workspace
       The browser never receives hidden tests. Paths and bodies are the
       session-scoped contracts implemented by the shared backend. */
    getCodeChallenge: function (sessionId) {
      return request('/code/challenge?sessionId=' + encodeURIComponent(sessionId))
        .then(function (data) { return data && data.challenge; });
    },
    createCodeChallenge: function (body) {
      return request('/code/challenges', { method: 'POST', body: body || {} })
        .then(function (data) { return data && data.challenge; });
    },
    checkCode: function (body) {
      return request('/code/check', { method: 'POST', body: body || {} });
    },
    getIdeState: function (sessionId) {
      return request('/code/sessions/' + encodeURIComponent(sessionId) + '/ide')
        .then(function (data) { return data && data.ide; });
    },
    saveIdeState: function (sessionId, patch) {
      var body = Object.assign({}, patch || {});
      return request('/code/sessions/' + encodeURIComponent(sessionId) + '/ide', {
        method: 'POST', body: body
      }).then(function (data) { return data && data.ide; });
    },

    /* ------------------------------------------------------- english workspace
       Body fields are safe work artifacts only: no contact or private docs. */
    getEnglishWork: function (sessionId) {
      return request('/english/work?sessionId=' + encodeURIComponent(sessionId))
        .then(function (data) { return data && data.work; });
    },
    saveEnglishWork: function (sessionId, work) {
      var body = Object.assign({}, work || {}, { sessionId: sessionId });
      return request('/english/work', { method: 'POST', body: body })
        .then(function (data) { return data && data.work; });
    }
  };
})();
