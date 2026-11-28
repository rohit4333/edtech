/* Post-login view chooser.
 *
 * The first login page is unchanged. After a successful sign-in the browser
 * lands here with a short-lived sessionStorage handoff (no password, no JWT).
 * This page verifies the signed token with /auth/me, offers only views allowed
 * by that verified identity, and asks the server to mint the shared parent/kid
 * alternate token when needed. Staff accounts see their own verified desk.
 */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var params = new URLSearchParams(window.location.search);
  var HANDOFF_KEY = 'mathify.postLogin';
  var CHOICE_KEY = 'mathify.viewChoice';

  var VIEWS = {
    student: {
      label: 'Kid desk',
      icon: 'K',
      detail: 'Practice, mastery, recordings and the live 1:1 classroom.',
      destination: '/student/home',
      prefix: 'student/'
    },
    parent: {
      label: 'Parent app',
      icon: 'P',
      detail: 'Child progress, class history, guidance and policies.',
      destination: '/parent/inbox',
      prefix: 'parent/'
    },
    trainer: {
      label: 'Trainer console',
      icon: 'T',
      detail: 'Today’s classes, attendance, students, leave and insights.',
      destination: '/trainer/today',
      prefix: 'trainer/'
    },
    relationship_manager: {
      label: 'Manager desk',
      icon: 'M',
      detail: 'Trainers, students, pay penalties and class coverage.',
      destination: '/rm/dashboard',
      prefix: 'rm/'
    },
    founder: {
      label: 'Founder desk',
      icon: 'F',
      detail: 'Policy, mastery, pay, staff approvals and audit trail.',
      destination: '/founder-admin/overview',
      prefix: 'founder-admin/'
    },
    planner_agent: {
      label: 'Planner desk',
      icon: 'L',
      detail: 'The curriculum planning workspace and lesson preview.',
      destination: '/planner-agent/index.html',
      prefix: 'planner-agent/'
    }
  };

  /* Exactly the same verified family pair the login API already allows. */
  var SHARED_VIEWS = {
    parent: ['parent', 'student'],
    student: ['student', 'parent']
  };

  function $(id) { return document.getElementById(id); }

  function safeNext(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.indexOf('//') !== -1 || value.indexOf('\\') !== -1 || value.indexOf(':') !== -1) return null;
    var clean = value.replace(/^\/+/, '');
    if (/^(app|founder-admin|student|trainer|founder|parent|rm|classroom|lms|planner-agent)\/[\w\-./?=&%]*$/.test(clean)) return clean;
    if (clean === 'apps.html' || clean === 'index.html') return clean;
    return null;
  }

  function readHandoff() {
    try { return JSON.parse(window.sessionStorage.getItem(HANDOFF_KEY) || 'null'); }
    catch (error) { return null; }
  }

  function request(path, options, token) {
    var settings = options || {};
    var headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (settings.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, {
      method: settings.method || 'GET',
      headers: headers,
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
        if (!response.ok) {
          var problem = new Error((data && data.message) || 'Request failed.');
          problem.status = response.status;
          problem.code = data && data.error;
          throw problem;
        }
        return data;
      });
    });
  }

  function accessTokenFor(role) {
    var session = window.MathifySession;
    var keys = session && session.accessKeys ? session.accessKeys[role] : null;
    if (!keys || !keys.length) return null;
    try { return window.localStorage.getItem(keys[0]); }
    catch (error) { return null; }
  }

  function storeAccessToken(role, token) {
    if (!token) return;
    var session = window.MathifySession;
    if (session && typeof session.store === 'function') {
      /* No refresh token is issued for a shared-view switch: the selection is
         session-scoped and the original desk keeps its remembered sign-in. */
      session.store(role, null, token);
      return;
    }
    var keys = session && session.accessKeys ? session.accessKeys[role] : [];
    keys.forEach(function (key) {
      try { window.localStorage.setItem(key, token); } catch (error) {}
    });
  }

  function status(message, tone) {
    var node = $('choiceStatus');
    if (!node) return;
    node.textContent = message || '';
    node.setAttribute('data-tone', tone || 'error');
    node.hidden = !message;
  }

  function destinationFor(role, next) {
    var view = VIEWS[role];
    if (!view) return '/login.html';
    var clean = safeNext(next);
    if (clean && clean.indexOf(view.prefix) === 0) return '/' + clean;
    return view.destination;
  }

  function finish(role, next) {
    try {
      window.sessionStorage.setItem(CHOICE_KEY, JSON.stringify({ role: role, at: Date.now() }));
      window.sessionStorage.removeItem(HANDOFF_KEY);
    } catch (error) { /* private mode: the view still opens */ }
    window.location.replace(destinationFor(role, next));
  }

  function identify() {
    var handoff = readHandoff();
    var hinted = handoff && handoff.role;
    var roles = [];
    if (hinted && VIEWS[hinted]) roles.push(hinted);
    Object.keys(VIEWS).forEach(function (role) {
      if (roles.indexOf(role) === -1) roles.push(role);
    });
    var candidates = roles.filter(function (role) { return Boolean(accessTokenFor(role)); });
    if (!candidates.length) return Promise.resolve(null);

    function attempt(index) {
      if (index >= candidates.length) return Promise.resolve(null);
      var role = candidates[index];
      return request('/auth/me', undefined, accessTokenFor(role)).then(function (data) {
        var verified = data && data.user && data.user.role;
        if (!verified || !VIEWS[verified]) return attempt(index + 1);
        return { role: verified, token: accessTokenFor(role) };
      }).catch(function () { return attempt(index + 1); });
    }
    return attempt(0);
  }

  function renderIdentity(identity, next) {
    var grid = $('choiceGrid');
    var intro = $('choiceIntro');
    if (!grid) return;
    var allowed = SHARED_VIEWS[identity.role] || [identity.role];
    if (intro) {
      intro.textContent = allowed.length === 1
        ? 'Your account is verified for one desk. Open it to continue.'
        : 'One family sign-in, two views. Choose who is using Mathify right now.';
    }
    grid.innerHTML = '';
    allowed.forEach(function (role) {
      var view = VIEWS[role];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-option';
      button.setAttribute('data-view', role);
      var icon = document.createElement('span');
      icon.className = 'choice-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = view.icon;
      var label = document.createElement('b');
      label.textContent = view.label;
      var detail = document.createElement('small');
      detail.textContent = view.detail;
      button.appendChild(icon);
      button.appendChild(label);
      button.appendChild(detail);
      button.addEventListener('click', function () { openView(role, identity, next); });
      grid.appendChild(button);
    });
  }

  function openView(role, identity, next) {
    $$buttons().forEach(function (button) { button.disabled = true; });
    status('Opening ' + VIEWS[role].label + '…', '');
    var chosenToken = identity.token;
    var verified = request('/auth/me', undefined, chosenToken);

    Promise.resolve(role === identity.role ? { user: { role: identity.role }, token: chosenToken } : null)
      .then(function (same) {
        if (same) return same;
        return request('/auth/view', {
          method: 'POST',
          body: { view: role }
        }, chosenToken).then(function (data) {
          if (!data || !data.token || !data.user || data.user.role !== role) {
            throw new Error('That view could not be verified.');
          }
          storeAccessToken(role, data.token);
          return { user: data.user, token: data.token };
        });
      })
      .then(function () {
        /* The /auth/me call above is only a final freshness check; its result
           never widens the view list rendered from the verified identity. */
        return verified.catch(function () { return null; });
      })
      .then(function () { finish(role, next); })
      .catch(function (error) {
        status(error.message || 'That view could not be opened.', 'error');
        $$buttons().forEach(function (button) { button.disabled = false; });
      });
  }

  function $$buttons() {
    return Array.prototype.slice.call(document.querySelectorAll('.choice-option'));
  }

  function init() {
    var handoff = readHandoff();
    var next = (handoff && handoff.next) || safeNext(params.get('next'));
    identify().then(function (identity) {
      if (!identity) {
        status('Your sign-in has expired. Please sign in again.', 'error');
        return;
      }
      renderIdentity(identity, next);
    }).catch(function () {
      status('We could not verify this sign-in. Please try again.', 'error');
    });
  }

  init();
}());
