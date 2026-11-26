/* Mathify trainer API client. A verified credential token is required; when
   none is present the browser is sent to the shared sign-in page. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.trainer.token';
  var ROLE = 'trainer';
  var LOGIN_PAGE = '/login.html?role=' + ROLE;
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

  window.mathifyTrainerApi = {
    base: BASE,
    request: request,
    ensureAuth: ensureAuth,
    getDashboard: function () { return request('/trainer/dashboard').then(function (d) { return d.dashboard; }); },
    getBatches: function () { return request('/trainer/batches').then(function (d) { return d.batches; }); },
    getOnboarding: function () { return request('/trainer/onboarding').then(function (d) { return d.onboarding; }); },
    submitOnboarding: function (body) {
      return request('/trainer/onboarding', { method: 'POST', body: body })
        .then(function (d) { return d.onboarding; });
    },
    uploadDocument: function (body) {
      return request('/trainer/onboarding/documents', { method: 'POST', body: body })
        .then(function (d) { return d.document; });
    },
    updatePersonal: function (body) {
      return request('/trainer/onboarding/personal', { method: 'PATCH', body: body })
        .then(function (d) { return d.onboarding; });
    },
    getAttention: function () { return request('/trainer/attention').then(function (d) { return d.attention; }); },
    getAttendance: function () { return request('/trainer/attendance').then(function (d) { return d.register; }); },
    getScore: function () { return request('/trainer/score').then(function (d) { return d.score; }); },
    getPayout: function (period) {
      return request('/trainer/payouts' + (period ? '/' + encodeURIComponent(period) : ''))
        .then(function (d) { return d.payout; });
    },
    getSession: function (id) { return request('/trainer/sessions/' + encodeURIComponent(id)).then(function (d) { return d.session; }); },
    updatePlanner: function (id, body) {
      return request('/trainer/sessions/' + encodeURIComponent(id) + '/planner', { method: 'PATCH', body: body })
        .then(function (d) { return d.session; });
    },
    setPage: function (id, page) {
      return request('/trainer/sessions/' + encodeURIComponent(id) + '/page', { method: 'PATCH', body: { page: page } })
        .then(function (d) { return d.session; });
    },
    saveAttendance: function (id, records) {
      return request('/trainer/attendance/' + encodeURIComponent(id) + '/save', { method: 'POST', body: { records: records } })
        .then(function (d) { return d; });
    },
    getWeekSchedule: function (start) {
      return request('/trainer/schedule/week?start=' + encodeURIComponent(start))
        .then(function (d) { return d.schedule; });
    },
    getSchedule: function (month) {
      return request('/trainer/schedule' + (month ? '?month=' + encodeURIComponent(month) : ''))
        .then(function (d) { return d.schedule; });
    },
    getSlots: function () { return request('/trainer/slots').then(function (d) { return d; }); },
    addSlot: function (body) {
      return request('/trainer/slots', { method: 'POST', body: body }).then(function (d) { return d.slot; });
    },
    deleteSlot: function (id) {
      return request('/trainer/slots/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (d) { return d; });
    },
    askCopilot: function (question, sessionId) {
      return request('/trainer/copilot/query', {
        method: 'POST',
        body: { question: question, sessionId: sessionId || null }
      });
    },
    askSupport: function (question) {
      return request('/chat/trainer-support', {
        method: 'POST',
        body: { question: question }
      });
    }
  };
})();
