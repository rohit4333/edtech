/* Mathify classroom API client.
 *
 * The classroom used to rely on raw fetch calls and an injected token. This
 * module gives it the same authenticated client as the student and trainer
 * desks, plus the two operations that were missing: ending a session and
 * reading the browser-safe session event stream.
 *
 * No secrets are stored here. A caller-supplied access token always wins;
 * otherwise a demo token is obtained from /api/auth/login. */
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

  function storedToken(roleName) {
    try { return window.localStorage.getItem(TOKEN_PREFIX + roleName); } catch (error) { return null; }
  }

  function preferredRole() {
    if (params.get('view') === 'student' || params.get('role') === 'student') return 'student';
    if (params.get('role') === 'trainer') return 'trainer';
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
  var authPromise = null;

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
      return rawRequest(path, settings, tokenValue);
    });
  }

  function login(email, password) {
    return rawRequest('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: { email: email, password: password }
    }, null).then(function (data) {
      writeToken(data.token);
      return data.token;
    });
  }

  function ensureAuth() {
    var existing = readToken();
    if (existing) return Promise.resolve(existing);
    if (authPromise) return authPromise;

    authPromise = rawRequest('/auth/demo', { skipAuth: true }, null)
      .then(function (info) {
        var account = (info.accounts || []).find(function (item) { return item.role === role; });
        var email = role === 'student' ? 'student@mathify.app' : 'trainer@mathify.app';
        return login(email, info.password || 'mathify-demo');
      })
      .catch(function () {
        return login(role === 'student' ? 'student@mathify.app' : 'trainer@mathify.app', 'mathify-demo');
      })
      .then(function (value) { authPromise = null; return value; })
      .catch(function (error) { authPromise = null; throw error; });

    return authPromise;
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
    }
  };
})();
