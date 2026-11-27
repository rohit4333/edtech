/* Demo booking form: mandatory child, parent, contact, board and grade fields
   are validated by the browser and again by /api/contact. The board and grade
   dropdowns come from the same server-owned catalogue as the LMS. */
(function () {
  'use strict';

  var form = document.getElementById('bookingForm');
  if (!form) return;

  var status = document.getElementById('bookingStatus');
  var button = form.querySelector('button[type="submit"]');
  var apiBase = window.MATHIFY_API_BASE || '/api';
  var curriculumSelect = document.getElementById('bookingCurriculum');
  var gradeSelect = document.getElementById('bookingGrade');
  var timezoneInput = document.getElementById('bookingTimezone');

  function setStatus(text, tone) {
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || '';
  }

  function showCredentials(data) {
    var box = document.getElementById('bookingCredentials');
    if (!box) return;
    var credentials = data && data.credentials;
    box.hidden = !(credentials && credentials.password);
    if (box.hidden) return;
    function put(id, value) {
      var node = document.getElementById(id);
      if (node) node.textContent = value || '—';
    }
    put('bookingDemoId', data.demoId);
    put('bookingEmail', credentials.email);
    put('bookingPassword', credentials.password);
    var links = document.getElementById('credentialLinks');
    var child = document.getElementById('childDeskLink');
    var parent = document.getElementById('parentDeskLink');
    if (links && child && parent) {
      links.hidden = !(credentials.studentLink && credentials.parentLink);
      if (credentials.studentLink) child.href = credentials.studentLink;
      if (credentials.parentLink) parent.href = credentials.parentLink;
    }
  }

  function localTimezone() {
    try {
      return (window.Intl && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    } catch (error) {
      return 'UTC';
    }
  }

  if (timezoneInput && !timezoneInput.value) timezoneInput.value = localTimezone();
  if (window.MathifyCurriculums && window.MathifyCurriculums.populate && curriculumSelect) {
    window.MathifyCurriculums.populate(curriculumSelect, gradeSelect, {});
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;

    var payload = {
      parentName: form.elements.parentName.value.trim(),
      childName: form.elements.childName.value.trim(),
      curriculum: curriculumSelect ? curriculumSelect.value : '',
      grade: gradeSelect ? gradeSelect.value : '',
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      timezone: timezoneInput ? timezoneInput.value : localTimezone(),
      message: form.elements.message.value.trim()
    };

    if (button) button.disabled = true;
    setStatus('Sending your request…', 'pending');

    try {
      var response = await fetch(apiBase + '/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = {};
      try { data = await response.json(); } catch (error) { data = {}; }
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'The request could not be sent.');
      }
      form.reset();
      if (timezoneInput) timezoneInput.value = localTimezone();
      setStatus('Demo ID ' + (data.demoId || 'pending') +
        '. Check your email for more details — we will confirm the slot shortly.', 'success');
      showCredentials(data);
    } catch (error) {
      setStatus('We could not send that request. Email hello@mathify.app or use WhatsApp instead.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
