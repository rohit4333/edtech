/* Remembered sign-in for the child, parent and trainer desks.
 *
 * The access token is deliberately short-lived, but the refresh token is
 * signed by the server and kept in localStorage. A browser reload, a new tab
 * or a long break silently renews the desk token instead of logging the family
 * out because of a browser session issue. No password is ever stored here. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var PREFIX = 'mathify.refresh.token.';
  var ACCESS_KEYS = {
    student: ['mathify.student.token', 'mathify.classroom.token.student'],
    trainer: ['mathify.trainer.token', 'mathify.classroom.token.trainer'],
    parent: ['mathify.parent.token'],
    relationship_manager: ['mathify.classroom.token.relationship_manager', 'mathify.rm.token'],
    founder: ['mathify.classroom.token.founder']
  };

  function key(role) { return PREFIX + (role || 'student'); }

  function read(role) {
    try { return window.localStorage.getItem(key(role)); } catch (error) { return null; }
  }

  function store(role, refreshToken, accessToken) {
    try {
      if (refreshToken) window.localStorage.setItem(key(role), refreshToken);
      (ACCESS_KEYS[role] || []).forEach(function (name) {
        if (accessToken) window.localStorage.setItem(name, accessToken);
      });
    } catch (error) { /* private mode: the in-memory token still works */ }
  }

  function clear(role) {
    try { window.localStorage.removeItem(key(role)); } catch (error) { /* private mode */ }
  }

  /* Returns a fresh access token, or null when the remembered sign-in can no
     longer be honoured (revoked password, suspended account, bad secret). */
  function refresh(role) {
    var remembered = read(role);
    if (!remembered || typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: remembered })
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
        if (!response.ok || !data || !data.token) return null;
        store(role, data.refreshToken || remembered, data.token);
        return data.token;
      });
    }).catch(function () { return null; });
  }

  window.MathifySession = {
    refresh: refresh,
    store: store,
    read: read,
    clear: clear,
    accessKeys: ACCESS_KEYS
  };
})();
