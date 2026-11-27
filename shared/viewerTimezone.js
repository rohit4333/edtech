/* Sets window.MATHIFY_TZ to the signed-in account's registered IANA zone.
   The value cached at sign-in is applied synchronously; a background /auth/me
   refresh covers older sessions. No zone is inferred from another participant. */
(function () {
  'use strict';

  var KEY = 'mathify.timezone';
  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEYS = [
    'mathify.student.token', 'mathify.trainer.token', 'mathify.parent.token',
    'mathify.rm.token', 'mathify.classroom.token.founder',
    'mathify.classroom.token.relationship_manager',
    'mathify.planner.token', 'mathify.classroom.token.planner_agent'
  ];

  function valid(zone) {
    if (!zone) return null;
    try { return Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone; }
    catch (error) { return null; }
  }

  function apply(zone) {
    var safe = valid(zone);
    if (!safe) return;
    window.MATHIFY_TZ = safe;
    try { window.localStorage.setItem(KEY, safe); } catch (error) { /* private mode */ }
    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('mathify:timezone', { detail: { timezone: safe } }));
    }
  }

  try { apply(window.localStorage.getItem(KEY)); } catch (error) { /* private mode */ }

  var token = null;
  try {
    for (var i = 0; i < TOKEN_KEYS.length && !token; i += 1) {
      token = window.localStorage.getItem(TOKEN_KEYS[i]);
    }
  } catch (error) { token = null; }
  if (!token) return;

  fetch(BASE + '/auth/me', {
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }
  }).then(function (response) {
    return response.ok ? response.json() : null;
  }).then(function (data) {
    if (data && data.user && data.user.timezone) apply(data.user.timezone);
  }).catch(function () { /* cached zone stays in place */ });
}());
