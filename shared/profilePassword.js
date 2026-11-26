/* Profile-section password change.
   Signed-in trainer and student accounts prove their current password here;
   the server stores a fresh salted hash. Forgotten passwords use the linked
   email reset page, and the founder can grant a new password if both fail. */
(function () {
  'use strict';

  var toggle = document.getElementById('changePasswordBtn');
  var form = document.getElementById('changePasswordForm');
  if (!toggle || !form) return;

  var status = document.getElementById('passwordStatus');
  var api = window.mathifyTrainerApi || window.mathifyStudentApi;
  if (!api || typeof api.request !== 'function') return;

  function say(message, kind) {
    if (!status) return;
    status.textContent = message;
    status.className = 'profile-password-status ' + (kind || '');
    status.hidden = false;
  }

  toggle.addEventListener('click', function (event) {
    event.stopPropagation();
    var open = form.hidden;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      var first = document.getElementById('currentPassword');
      if (first && first.focus) first.focus();
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var current = document.getElementById('currentPassword');
    var next = document.getElementById('newPassword');
    var confirm = document.getElementById('confirmPassword');
    if (!current || !next || !confirm) return;
    if (next.value !== confirm.value) {
      say('New passwords do not match.', 'error');
      return;
    }
    if (next.value.length < 8) {
      say('Use at least 8 characters.', 'error');
      return;
    }

    var submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    say('Updating password…');

    api.request('/auth/password/change', {
      method: 'POST',
      body: {
        currentPassword: current.value,
        newPassword: next.value
      }
    }).then(function () {
      form.reset();
      say('Password updated. Use it the next time you sign in.', 'saved');
    }).catch(function (error) {
      say((error && error.message) || 'Password could not be changed.', 'error');
    }).then(function () {
      if (submit) submit.disabled = false;
    });
  });
}());
