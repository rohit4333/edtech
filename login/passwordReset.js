/* Email-based account recovery.
 *
 * The request endpoint intentionally gives the same answer for an unknown
 * email. Outside production, when mail delivery is not configured, it also
 * returns a clearly labelled one-time development token so the flow can be
 * verified locally. Nothing here changes a role or signs the visitor in. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var params = new URLSearchParams(window.location.search);

  function byId(id) { return document.getElementById(id); }

  var requestForm = byId('requestForm');
  var confirmForm = byId('confirmForm');
  var requestStatus = byId('requestStatus');
  var confirmStatus = byId('confirmStatus');
  var devTokenBox = byId('devTokenBox');
  var devTokenValue = byId('devTokenValue');
  var resetSuccess = byId('resetSuccess');
  var backToLogin = byId('backToLogin');

  function say(node, message, tone) {
    if (!node) return;
    node.textContent = message;
    node.setAttribute('data-tone', tone || 'error');
    node.hidden = !message;
  }

  function request(path, body) {
    return fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.message || 'That request could not be completed.');
          error.code = data.error;
          throw error;
        }
        return data;
      });
    });
  }

  if (params.get('email')) {
    var emailFields = [byId('resetEmail'), byId('confirmEmail')];
    emailFields.forEach(function (field) { if (field) field.value = params.get('email'); });
  }

  if (params.get('token')) {
    var tokenField = byId('resetToken');
    if (tokenField) tokenField.value = params.get('token');
    if (confirmForm) {
      confirmForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var passwordField = byId('resetNewPassword');
      if (passwordField && passwordField.focus) passwordField.focus();
    }
  }

  if (requestForm) {
    requestForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = byId('resetEmail');
      var submit = byId('requestSubmit');
      if (!email || !submit) return;
      submit.disabled = true;
      say(requestStatus, 'Checking that email address…', 'success');

      request('/auth/password-reset/request', { email: email.value })
        .then(function (data) {
          var message = data.delivered
            ? 'A one-time reset link was sent. It expires in ' + data.expiresInMinutes + ' minutes.'
            : 'If that email has an active Mathify account, a one-time reset link is ready. It expires in 15 minutes.';
          say(requestStatus, message, 'success');
          if (data.developmentToken && devTokenValue && devTokenBox) {
            devTokenValue.textContent = data.developmentToken;
            devTokenBox.hidden = false;
            var confirmEmail = byId('confirmEmail');
            var confirmToken = byId('resetToken');
            if (confirmEmail && !confirmEmail.value) confirmEmail.value = email.value;
            if (confirmToken) confirmToken.value = data.developmentToken;
          }
        })
        .catch(function (error) {
          say(requestStatus, (error && error.message) || 'Reset request failed.');
        })
        .then(function () { submit.disabled = false; });
    });
  }

  if (confirmForm) {
    confirmForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = byId('confirmEmail');
      var token = byId('resetToken');
      var password = byId('resetNewPassword');
      var confirm = byId('resetConfirmPassword');
      var submit = byId('confirmSubmit');
      if (!email || !token || !password || !confirm || !submit) return;

      if (password.value !== confirm.value) {
        say(confirmStatus, 'New passwords do not match.');
        return;
      }
      if (password.value.length < 8) {
        say(confirmStatus, 'Use at least 8 characters.');
        return;
      }

      submit.disabled = true;
      say(confirmStatus, 'Setting your new password…', 'success');
      request('/auth/password-reset/confirm', {
        email: email.value,
        token: token.value,
        password: password.value
      }).then(function () {
        say(confirmStatus, '', 'success');
        confirmForm.hidden = true;
        if (requestForm) requestForm.hidden = true;
        if (devTokenBox) devTokenBox.hidden = true;
        if (resetSuccess) resetSuccess.hidden = false;
        if (backToLogin) {
          var role = params.get('role');
          if (role === 'trainer' || role === 'student' || role === 'parent' || role === 'founder') {
            backToLogin.href = '/login.html?role=' + encodeURIComponent(role);
          }
        }
      }).catch(function (error) {
        say(confirmStatus, (error && error.message) || 'Password could not be reset.');
      }).then(function () { submit.disabled = false; });
    });
  }
}());
