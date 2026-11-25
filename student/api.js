/* Mathify student API client. Falls back silently when the API is unavailable. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || 'http://localhost:4000/api';
  var TOKEN_KEY = 'mathify.student.token';
  var DEMO_LOGINS = {
    founder: 'founder@mathify.app',
    trainer: 'trainer@mathify.app',
    student: 'student@mathify.app'
  };
  var memoryToken = null;
  var authPromise = null;

  function readToken() {
    if (memoryToken) return memoryToken;
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function writeToken(value) {
    memoryToken = value;
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch (e) {}
  }

  function rawRequest(path, options, tokenValue) {
    var opts = options || {};
    var headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
    if (tokenValue) headers.Authorization = 'Bearer ' + tokenValue;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) {}
        if (!response.ok) {
          var error = new Error((data && data.message) || 'API request failed.');
          error.status = response.status;
          error.code = data && data.error;
          throw error;
        }
        return data;
      });
    });
  }

  function request(path, options) {
    var opts = options || {};
    if (opts.skipAuth) return rawRequest(path, opts, null);
    return ensureAuth().then(function (tokenValue) {
      return rawRequest(path, opts, tokenValue);
    });
  }

  function login(email, password) {
    return rawRequest('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: { email: email, password: password }
    }).then(function (data) {
      writeToken(data.token);
      return data;
    });
  }

  function ensureAuth() {
    var existing = readToken();
    if (existing) return Promise.resolve(existing);
    if (authPromise) return authPromise;

    authPromise = rawRequest('/auth/demo', { skipAuth: true })
      .then(function (info) {
        var account = (info.accounts || []).find(function (item) { return item.role === 'student'; });
        var role = account ? account.role : 'student';
        return login(
          DEMO_LOGINS[role] || DEMO_LOGINS.student,
          info.password || 'mathify-demo'
        );
      })
      .catch(function () {
        return login('student@mathify.app', 'mathify-demo');
      })
      .then(function (data) {
        authPromise = null;
        return data.token;
      })
      .catch(function (error) {
        authPromise = null;
        throw error;
      });

    return authPromise;
  }

  window.mathifyStudentApi = {
    base: BASE,
    request: request,
    ensureAuth: ensureAuth,
    getDashboard: function () { return request('/student/dashboard').then(function (d) { return d.dashboard; }); },
    askTutor: function (question, sessionId) {
      return request('/student/tutor/query', {
        method: 'POST',
        body: { question: question, sessionId: sessionId || null }
      });
    }
  };
})();
