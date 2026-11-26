/* Mathify trainer API client. Falls back silently when the API is unavailable. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.trainer.token';
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
        var account = (info.accounts || []).find(function (item) { return item.role === 'trainer'; });
        var role = account ? account.role : 'trainer';
        return login(
          DEMO_LOGINS[role] || DEMO_LOGINS.trainer,
          info.password || 'mathify-demo'
        );
      })
      .catch(function () {
        return login('trainer@mathify.app', 'mathify-demo');
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

  window.mathifyTrainerApi = {
    base: BASE,
    request: request,
    ensureAuth: ensureAuth,
    getDashboard: function () { return request('/trainer/dashboard').then(function (d) { return d.dashboard; }); },
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
