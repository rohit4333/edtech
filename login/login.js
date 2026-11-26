/* Mathify credential sign in.
 *
 * The server is the only source of identity: /auth/login returns a signed JWT
 * and a public user with a verified role. This page stores that token in the
 * same per-surface keys the dashboards already read, then sends the browser to
 * the requested desk. A role chosen in the URL is only a destination hint —
 * if the credentials belong to a different role, sign-in is refused. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var params = new URLSearchParams(window.location.search);

  var ROLES = {
    student: {
      label: 'Student desk',
      destination: 'student/index.html',
      demoEmail: 'student@mathify.app',
      tokenKeys: ['mathify.student.token', 'mathify.classroom.token.student']
    },
    trainer: {
      label: 'Trainer console',
      destination: 'trainer/index.html',
      demoEmail: 'trainer@mathify.app',
      tokenKeys: ['mathify.trainer.token', 'mathify.classroom.token.trainer']
    },
    founder: {
      label: 'Founder console',
      destination: 'founder/index.html',
      demoEmail: 'founder@mathify.app',
      tokenKeys: ['mathify.classroom.token.founder']
    },
    parent: {
      label: 'Parent app',
      destination: 'parent/index.html',
      demoEmail: 'parent@mathify.app',
      tokenKeys: ['mathify.parent.token']
    }
  };

  function $(id) { return document.getElementById(id); }

  function requestedRole() {
    var value = String(params.get('role') || '').toLowerCase();
    return ROLES[value] ? value : 'student';
  }

  var role = requestedRole();

  /* Only same-origin dashboard paths are accepted as a post-login destination.
     Protocol-relative URLs, backslashes and colons can never be redirected to. */
  function safeNext(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.indexOf('//') !== -1 || value.indexOf('\\') !== -1 || value.indexOf(':') !== -1) return null;
    var clean = value.replace(/^\/+/, '');
    if (/^(student|trainer|founder|parent|classroom|lms)\/[\w\-./?=&%]*$/.test(clean)) return clean;
    if (clean === 'apps.html' || clean === 'index.html') return clean;
    return null;
  }

  var next = safeNext(params.get('next'));

  function request(path, options) {
    var settings = options || {};
    var headers = { Accept: 'application/json' };
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

  function status(message, tone) {
    var node = $('loginStatus');
    if (!node) return;
    node.textContent = message || '';
    node.setAttribute('data-tone', tone || 'error');
    node.hidden = !message;
  }

  function busy(value) {
    var button = $('loginSubmit');
    if (button) {
      button.disabled = value;
      button.textContent = value ? 'Signing in…' : 'Sign in to ' + ROLES[role].label;
    }
    var email = $('loginEmail');
    var password = $('loginPassword');
    if (email) email.disabled = value;
    if (password) password.disabled = value;
  }

  function storeToken(token) {
    ROLES[role].tokenKeys.forEach(function (key) {
      try { window.localStorage.setItem(key, token); } catch (error) { /* private mode */ }
    });
  }

  function roleName(value) {
    return ROLES[value] ? ROLES[value].label : 'another';
  }

  function applyRole(value, updateUrl) {
    if (!ROLES[value]) return;
    role = value;
    document.querySelectorAll('.role-tab').forEach(function (tab) {
      tab.setAttribute('aria-pressed', tab.getAttribute('data-role') === value ? 'true' : 'false');
    });
    var destination = $('loginDestination');
    if (destination) destination.textContent = ROLES[value].label;
    busy(false);
    status('');
    if (updateUrl && window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set('role', value);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    loadDemoOption();
  }

  function submit(email, password) {
    if (!email || !password) {
      status('Enter both your email and password.');
      return;
    }
    busy(true);
    status('');
    request('/auth/login', {
      method: 'POST',
      body: { email: email, password: password }
    }).then(function (data) {
      var user = data && data.user;
      if (!data || !data.token || !user) throw new Error('SIGN_IN_UNAVAILABLE');
      if (user.role !== role) {
        status('Those credentials belong to the ' + roleName(user.role) +
          '. Choose that tab and sign in again.');
        return;
      }
      storeToken(data.token);
      status('Signed in. Opening your ' + ROLES[role].label.toLowerCase() + '…', 'success');
      window.location.assign(next || ROLES[role].destination);
    }).catch(function (error) {
      if (error.status === 429) {
        status('Too many sign-in attempts. Try again in a few minutes.');
      } else if (error.status === 401) {
        status('Email or password is wrong.');
      } else {
        status('Sign-in is unavailable right now. Please try again.');
      }
    }).then(function () { busy(false); });
  }

  /* Demo accounts are an explicit development convenience, never an automatic
     hand-off into a dashboard. The button only appears when the server offers
     demo sign-in, so production visitors always use real credentials. */
  var demoInfo = null;
  function loadDemoOption() {
    var button = $('demoLogin');
    if (!button) return;
    button.hidden = true;
    request('/auth/demo').then(function (info) {
      if (!info || !Array.isArray(info.accounts)) return;
      var account = info.accounts.find(function (item) { return item && item.role === role; });
      if (!account) return;
      demoInfo = info;
      button.hidden = false;
    }).catch(function () { button.hidden = true; });
  }

  function init() {
    var form = $('loginForm');
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = $('loginEmail');
        var password = $('loginPassword');
        submit(email ? email.value.trim() : '', password ? password.value : '');
      });
    }

    document.querySelectorAll('.role-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        applyRole(tab.getAttribute('data-role'), true);
      });
    });

    var toggle = $('passwordToggle');
    var password = $('loginPassword');
    if (toggle && password) {
      toggle.addEventListener('click', function () {
        var show = password.type === 'password';
        password.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show';
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    }

    var demo = $('demoLogin');
    if (demo) {
      demo.addEventListener('click', function () {
        var email = $('loginEmail');
        var password = $('loginPassword');
        if (email) email.value = ROLES[role].demoEmail;
        if (password) password.value = (demoInfo && demoInfo.password) || '';
        submit(email ? email.value : '', password ? password.value : '');
      });
    }

    applyRole(role, false);
  }

  init();
})();
