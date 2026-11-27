/* LMS API client.
 *
 * One authenticated client for catalogue and planner reads plus founder edits.
 * Trainer surfaces are read-only and batch-scoped; planner-agent mutation is
 * disabled until the founder explicitly re-enables it. The subject is an
 * academic parameter only: RM requests are refused in the browser and every
 * role gate is repeated on the server.
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

  /* Planner-agent authoring is paused. No browser client exposes an agent
     mutation method; the server also refuses one if a caller invents a route. */
  function agentMutation(path, method, payload) {
    var denied = new Error('Planner-agent mutations are disabled until the founder re-enables them.');
    denied.status = 403;
    denied.code = 'PLANNER_AGENT_MUTATIONS_DISABLED';
    return Promise.reject(denied);
  }

  window.mathifyLmsApi = {
    request: request,
    token: function () { var access = gate(); return access ? access.token() : null; },
    safeSubject: safeSubject,
    catalog: function () { return request('/lms/curriculum-catalog'); },
    plannerGet: function (params) { return request('/lms/planner?' + queryString(params)); },
    assignedPlanners: function () { return request('/lms/assigned-planners'); },
    plannerGuidance: function (params) {
      var source = params || {};
      var query = [];
      ['studentId', 'sessionId'].forEach(function (key) {
        if (source[key] === undefined || source[key] === null || source[key] === '') return;
        query.push(key + '=' + encodeURIComponent(source[key]));
      });
      return request('/lms/planner-guidance?' + query.join('&'));
    },
    plannerRegenerate: function (body) {
      return founderMutation('/lms/planner/regenerate', 'POST', body);
    },
    plannerEdit: function (body) {
      return founderMutation('/lms/planner', 'PATCH', body);
    },
    plannerSuggestions: function (query) {
      return request('/lms/planner-suggestions?' + ideaQuery(query));
    }
  };
}());
