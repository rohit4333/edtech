/* LMS API client.
 *
 * One authenticated client for the planner reads and the founder-only mutation
 * calls. The subject is an academic parameter only: a trainer request is always
 * pinned to the trainer's own field, and RM requests are refused in the browser
 * before a request is made. The server repeats both checks.
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
    var slug = normalize(requested) || (access && access.subject()) || 'math';
    if (access && access.role && access.role() === 'trainer' && !access.canUse(slug)) {
      slug = access.subject() || 'math';
    }
    return slug;
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
    }
  };
}());
