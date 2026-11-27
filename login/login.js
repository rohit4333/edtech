/* Mathify credential sign in.
 *
 * The server is the only source of identity: /auth/login returns a signed JWT
 * and a public user with a verified role. The role query parameter (or the
 * safe next path) is only a destination hint: it tells the server which desk
 * the visitor opened. For the shared student/parent credential the server
 * issues a token for the opened desk; every other role change is refused. */
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
    relationship_manager: {
      label: 'Relationship manager desk',
      destination: 'rm/index.html',
      demoEmail: 'rm@mathify.app',
      tokenKeys: ['mathify.classroom.token.relationship_manager', 'mathify.rm.token']
    },
    parent: {
      label: 'Parent app',
      demoEmail: 'student@mathify.app',
      destination: 'parent/index.html',
      tokenKeys: ['mathify.parent.token']
    }
  };

  function $(id) { return document.getElementById(id); }

  /* Only same-origin dashboard paths are accepted as a post-login destination.
     Protocol-relative URLs, backslashes and colons can never be redirected to. */
  function safeNext(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.indexOf('//') !== -1 || value.indexOf('\\') !== -1 || value.indexOf(':') !== -1) return null;
    var clean = value.replace(/^\/+/, '');
    if (/^(student|trainer|founder|parent|rm|classroom|lms)\/[\w\-./?=&%]*$/.test(clean)) return clean;
    if (clean === 'apps.html' || clean === 'index.html') return clean;
    return null;
  }

  var next = safeNext(params.get('next'));

  function requestedRole() {
    var fromParam = String(params.get('role') || '').toLowerCase();
    if (fromParam === 'rm') fromParam = 'relationship_manager';
    if (ROLES[fromParam]) return fromParam;
    var prefix = next ? next.split('/')[0] : '';
    return ROLES[prefix] ? prefix : 'student';
  }

  var role = requestedRole();

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
      button.textContent = value ? 'Signing in…' : 'Sign in to Mathify';
    }
    var email = $('loginEmail');
    var password = $('loginPassword');
    if (email) email.disabled = value;
    if (password) password.disabled = value;
  }

  function storeToken(token, targetRole) {
    var keys = (ROLES[targetRole] || ROLES.student).tokenKeys;
    keys.forEach(function (key) {
      try { window.localStorage.setItem(key, token); } catch (error) { /* private mode */ }
    });
  }

  function applyRole(value) {
    if (!ROLES[value]) return;
    role = value;
    var destination = $('loginDestination');
    if (destination) destination.textContent = 'Destination: ' + ROLES[value].label;
    busy(false);
    status('');
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
      body: { email: email, password: password, role: role }
    }).then(function (data) {
      var user = data && data.user;
      if (!data || !data.token || !user) throw new Error('SIGN_IN_UNAVAILABLE');
      var targetRole = ROLES[user.role] ? user.role : role;
      storeToken(data.token, targetRole);
      if (user.timezone) {
        try { window.localStorage.setItem('mathify.timezone', user.timezone); } catch (error) { /* private mode */ }
      }
      status('Signed in. Opening your ' + ROLES[targetRole].label.toLowerCase() + '…', 'success');
      window.location.assign(next || ROLES[targetRole].destination);
    }).catch(function (error) {
      if (error.status === 429) {
        status('Too many sign-in attempts. Try again in a few minutes.');
      } else if (error.status === 401) {
        status('Email or password is wrong.');
      } else if (error.status === 403) {
        status('Those credentials cannot open this desk. Use the app meant for your account.');
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
      if (!info || !Array.isArray(info.accounts) || !info.accounts.length) return;
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
        var pass = $('loginPassword');
        if (email) email.value = ROLES[role].demoEmail;
        if (pass) pass.value = (demoInfo && demoInfo.password) || '';
        submit(email ? email.value : '', pass ? pass.value : '');
      });
    }

    applyRole(role);
  }

  init();
}());
