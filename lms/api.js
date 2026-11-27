/* LMS API client.
 *
 * One authenticated client for planner reads, founder edits and the planner
 * agent's academic design/review queue. The subject is an academic parameter
 * only: a trainer request is always pinned to the trainer's own field, and RM
 * requests are refused in the browser before a request is made. The server
 * repeats both checks.
 */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';

  function gate() { return window.MathifyLmsAccess || null; }

  function request(path, settings) {
    var options = settings || {};
    var access = gate();
    if (access && access.isDenied()) {
      var denied = new Error(access.message());
      denied.status = 403;
      denied.code = 'FORBIDDEN';
      return Promise.reject(denied);
    }
    var headers = { accept: 'application/json' };
    var bearer = access && access.token ? access.token() : null;
    if (bearer) headers.authorization = 'Bearer ' + bearer;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    return fetch(String(BASE).replace(/\/$/, '') + path, {
      method: options.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : options.body
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (error) { body = null; }
        if (!response.ok) {
          var problem = new Error((body && body.message) || 'LMS request failed.');
          problem.status = response.status;
          problem.code = body && body.error;
          throw problem;
        }
        return body;
      });
    });
  }

  function safeSubject(requested) {
    var access = gate();
    var normalize = access && access.normalize
      ? access.normalize
      : function (value) {
        var key = String(value === null || value === undefined ? '' : value).toLowerCase();
        return key === 'math' || key === 'coding' || key === 'english' ? key : null;
      };
    var verified = access && access.subject ? access.subject() : null;
    /* A trainer's field comes from the verified token/catalogue, never from a
       caller-supplied or browser-stored value. */
    if (access && access.role && access.role() === 'trainer') return verified || null;
    return normalize(requested) || verified || 'math';
  }

  function queryString(params) {
    var source = params || {};
    var query = ['subject=' + encodeURIComponent(safeSubject(source.subject))];
    ['curriculum', 'grade', 'studentId', 'topic'].forEach(function (key) {
      if (source[key] === undefined || source[key] === null || source[key] === '') return;
      query.push(encodeURIComponent(key) + '=' + encodeURIComponent(source[key]));
    });
    return query.join('&');
  }

  function withSubject(body) {
    var payload = Object.assign({}, body || {});
    payload.subject = safeSubject(payload.subject);
    return JSON.stringify(payload);
  }

  function founderMutation(path, method, payload) {
    var access = gate();
    if (!access || access.role() !== 'founder') {
      var denied = new Error('Only a founder can edit or regenerate a planner.');
      denied.status = 403;
      denied.code = 'FORBIDDEN';
      return Promise.reject(denied);
    }
    return request(path, { method: method, body: withSubject(payload) });
  }

  /* The agent gets its own gate rather than widening founderMutation. A signed
     planner agent may design a planner or file an academic alternate idea; it
     never gains a founder decision or a child-profile scope. */
  function agentMutation(path, method, payload) {
    var access = gate();
    if (!access || access.role() !== 'planner_agent') {
      var denied = new Error('Only the planner agent can use this desk.');
      denied.status = 403;
      denied.code = 'FORBIDDEN';
      return Promise.reject(denied);
    }
    return request(path, { method: method, body: withSubject(payload) });
  }

  function ideaQuery(params) {
    var source = params || {};
    var query = [];
    if (source.all !== true) query.push('subject=' + encodeURIComponent(safeSubject(source.subject)));
    ['curriculum', 'grade'].forEach(function (key) {
      if (source[key] === undefined || source[key] === null || source[key] === '') return;
      query.push(key + '=' + encodeURIComponent(source[key]));
    });
    return query.join('&');
  }

  window.mathifyLmsApi = {
    request: request,
    token: function () { var access = gate(); return access ? access.token() : null; },
    safeSubject: safeSubject,
    plannerGet: function (params) { return request('/lms/planner?' + queryString(params)); },
    plannerRegenerate: function (body) {
      return founderMutation('/lms/planner/regenerate', 'POST', body);
    },
    plannerEdit: function (body) {
      return founderMutation('/lms/planner', 'PATCH', body);
    },

    /* Planner-agent design calls. Founder-only methods above are untouched. */
    plannerAgentRegenerate: function (body) {
      return agentMutation('/lms/planner/regenerate', 'POST', body);
    },
    plannerAgentEdit: function (body) {
      return agentMutation('/lms/planner', 'PATCH', body);
    },
    plannerSuggest: function (body) {
      return agentMutation('/lms/planner-suggestion', 'POST', body);
    },
    plannerSuggestions: function (query) {
      return request('/lms/planner-suggestions?' + ideaQuery(query));
    }
  };
}());
