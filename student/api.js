/* Mathify student API client. A verified credential token is required; when
   none is present the browser is sent to the shared sign-in page. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.student.token';
  var ROLE = 'student';
  var LOGIN_PAGE = 'login.html?role=' + ROLE;
  var memoryToken = null;

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
      return rawRequest(path, opts, tokenValue).catch(function (error) {
        if (error.status === 401 || error.status === 403) return Promise.reject(requireLogin());
        throw error;
      });
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

  /* No silent demo hand-off. A missing or rejected token sends the browser to
     credential sign-in, carrying the current desk as a safe return path. */
  function requireLogin() {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ }
    memoryToken = null;
    var next = window.location.pathname + window.location.search;
    var target = LOGIN_PAGE + '&next=' + encodeURIComponent(next);
    if (window.location.replace) window.location.replace(target);
    else window.location.href = target;
    return new Error('SIGN_IN_REQUIRED');
  }

  function ensureAuth() {
    var existing = readToken();
    if (existing) return Promise.resolve(existing);
    return Promise.reject(requireLogin());
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
    },
    askStudyBuddy: function (question, image) {
      return request('/chat/student-doubt', {
        method: 'POST',
        body: { question: question, image: image || null }
      });
    },
    fetchPracticeBatch: function (topic, previousBatchId) {
      return request('/student/practice/batch', {
        method: 'POST',
        body: { topic: topic || null, previousBatchId: previousBatchId || null }
      });
    },
    answerPractice: function (batchId, questionId, optionIndex) {
      return request('/student/practice/batch/' + encodeURIComponent(batchId) + '/answer', {
        method: 'POST',
        body: { questionId: questionId, optionIndex: optionIndex }
      });
    }
  };
})();
