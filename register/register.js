/* Public account registration for the student, trainer and relationship-manager
   desks. No role is inferred from the browser: the server validates the chosen
   account type and staff accounts stay pending until founder authorisation. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  function byId(id) { return document.getElementById(id); }

  var form = byId('registerForm');
  if (!form) return;

  var role = byId('registerRole');
  var gradeField = byId('gradeField');
  var status = byId('registerStatus');
  var success = byId('registerSuccess');
  var successText = byId('registerSuccessText');
  var nextLink = byId('registerNext');
  var submit = byId('registerSubmit');
  var toggle = byId('registerToggle');
  var password = byId('registerPassword');
  var timezone = byId('registerTimezone');

  if (window.MathifyTimezones) window.MathifyTimezones.populate(timezone);

  function say(node, message, tone) {
    if (!node) return;
    node.textContent = message || '';
    if (tone) node.setAttribute('data-tone', tone);
    else node.removeAttribute('data-tone');
    node.hidden = !message;
  }

  function syncGrade() {
    if (gradeField) gradeField.hidden = !role || role.value !== 'student';
  }
  if (role) {
    role.addEventListener('change', syncGrade);
    syncGrade();
  }

  if (toggle && password) {
    toggle.addEventListener('click', function () {
      var reveal = password.type === 'password';
      password.type = reveal ? 'text' : 'password';
      toggle.textContent = reveal ? 'Hide' : 'Show';
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    say(status, '');
    if (success) success.hidden = true;
    if (!submit) return;

    var body = {
      role: role ? role.value : '',
      name: byId('registerName') ? byId('registerName').value : '',
      email: byId('registerEmail') ? byId('registerEmail').value : '',
      password: password ? password.value : '',
      grade: byId('registerGrade') ? byId('registerGrade').value : '',
      timezone: timezone ? timezone.value : ''
    };
    submit.disabled = true;
    say(status, 'Creating your account…', 'success');

    fetch(BASE + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.message || 'Account could not be created.');
          error.code = data.error;
          throw error;
        }
        return data;
      });
    }).then(function (data) {
      say(status, '');
      if (successText) successText.textContent = (data && data.note) || 'Account created.';
      if (nextLink) {
        var destination = (data && data.next) || '/login.html?role=student';
        if (destination.indexOf('role=relationship_manager') !== -1) {
          destination = destination.replace('role=relationship_manager', 'role=rm');
        }
        nextLink.href = destination;
      }
      if (success) success.hidden = false;
      form.hidden = true;
    }).catch(function (error) {
      say(status, (error && error.message) || 'Account could not be created.');
    }).then(function () { submit.disabled = false; });
  });
}());
