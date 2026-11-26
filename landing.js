/* Mathify landing interactions: scroll reveals, a two-step booking request,
   local draft recovery, and a real POST to /api/contact. No payment fields. */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if ('IntersectionObserver' in window && !reduceMotion) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (node) { observer.observe(node); });
  } else {
    reveals.forEach(function (node) { node.classList.add('is-visible'); });
  }

  /* Every Book Demo control on the landing page opens the on-page flow.
     The nav keeps its contact.html destination for no-JS fallback. */
  function openBooking(event) {
    var target = document.getElementById('book-demo');
    if (!target) return;
    if (event) event.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#book-demo');
    }
    var first = document.getElementById('demoParent');
    if (first) {
      window.setTimeout(function () {
        if (!form || form.hidden) return;
        first.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 620);
    }
  }

  document.querySelectorAll('[data-book-demo]').forEach(function (link) {
    link.addEventListener('click', openBooking);
  });
  if (window.location.hash === '#book-demo') {
    window.setTimeout(openBooking, reduceMotion ? 0 : 200);
  }

  var form = document.getElementById('demoForm');
  if (!form) return;

  var step = 1;
  var selectedTime = '';
  var draftKey = 'mathify.demo.draft.v1';

  var parentName = document.getElementById('demoParent');
  var grade = document.getElementById('demoGrade');
  var email = document.getElementById('demoEmail');
  var phone = document.getElementById('demoPhone');
  var timezone = document.getElementById('demoTimezone');
  var message = document.getElementById('demoMessage');
  var chips = Array.prototype.slice.call(form.querySelectorAll('.time-chips button'));
  var error = document.getElementById('demoError');
  var status = document.getElementById('demoStatus');
  var stepLabel = document.getElementById('stepLabel');
  var progressFill = document.getElementById('progressFill');
  var back = document.getElementById('demoBack');
  var next = document.getElementById('demoNext');
  var send = document.getElementById('demoSend');
  var success = document.getElementById('demoSuccess');
  var successCopy = document.getElementById('successCopy');
  var successRef = document.getElementById('successRef');
  var whatsapp = document.getElementById('whatsappConfirm');
  var editRequest = document.getElementById('editRequest');
  var progress = form.parentNode.querySelector('.booking-progress');

  function localTimezone() {
    try {
      return (window.Intl && Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
    } catch (errorValue) {
      return '';
    }
  }

  function setStatus(text, tone) {
    if (!status) return;
    status.textContent = text || '';
    if (status.dataset) status.dataset.tone = tone || '';
  }

  function setError(text) {
    if (!error) return;
    error.textContent = text || '';
    error.hidden = !text;
  }

  function buildMessage() {
    var zone = (timezone && timezone.value.trim()) || localTimezone() || 'your timezone';
    var when = selectedTime || 'Any time';
    var child = (grade && grade.value) || 'the child';
    var guardian = (parentName && parentName.value.trim()) || 'A parent';
    return 'Hi Mathify — I would like to book a 35-minute live 1-on-1 demo for ' +
      child + '. Parent/guardian: ' + guardian + '. Preferred time: ' + when +
      '. Timezone: ' + zone + '. Please confirm a real slot with me.';
  }

  function refreshMessage() {
    if (!message) return;
    if (message.dataset.edited !== 'true') message.value = buildMessage();
  }

  function saveDraft() {
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify({
        step: step,
        parentName: parentName ? parentName.value : '',
        grade: grade ? grade.value : '',
        email: email ? email.value : '',
        phone: phone ? phone.value : '',
        timezone: timezone ? timezone.value : '',
        time: selectedTime,
        message: message ? message.value : '',
        edited: Boolean(message && message.dataset.edited === 'true')
      }));
    } catch (errorValue) { /* storage may be disabled; the form still works */ }
  }

  function clearDraft() {
    try { window.sessionStorage.removeItem(draftKey); } catch (errorValue) { /* ignore */ }
  }

  function loadDraft() {
    var raw = null;
    try { raw = window.sessionStorage.getItem(draftKey); } catch (errorValue) { return; }
    if (!raw) return;
    var draft;
    try { draft = JSON.parse(raw); } catch (errorValue) { return; }
    if (!draft || typeof draft !== 'object') return;

    if (parentName && draft.parentName) parentName.value = draft.parentName;
    if (grade && draft.grade) grade.value = draft.grade;
    if (email && draft.email) email.value = draft.email;
    if (phone && draft.phone) phone.value = draft.phone;
    if (timezone && draft.timezone) timezone.value = draft.timezone;
    if (message && draft.message) {
      message.value = draft.message;
      if (draft.edited) message.dataset.edited = 'true';
    }
    if (draft.time) {
      selectedTime = draft.time;
      chips.forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.dataset.time === selectedTime));
      });
    }
    step = draft.step === 2 ? 2 : 1;
  }

  function setStep(value) {
    step = value === 2 ? 2 : 1;
    form.querySelectorAll('.form-step').forEach(function (panel) {
      panel.hidden = Number(panel.dataset.step) !== step;
    });
    if (stepLabel) stepLabel.textContent = 'STEP ' + step + ' OF 2';
    if (progressFill) progressFill.style.width = step === 2 ? '100%' : '50%';
    if (back) back.hidden = step !== 2;
    if (next) next.hidden = step !== 1;
    if (send) send.hidden = step !== 2;
    if (step === 2) refreshMessage();
    setError('');
    saveDraft();
    if (step === 2 && email) email.focus({ preventScroll: true });
    if (step === 1 && parentName) parentName.focus({ preventScroll: true });
  }

  function validateStep(value) {
    var panel = form.querySelector('.form-step[data-step="' + value + '"]');
    if (!panel) return true;
    var fields = Array.prototype.slice.call(panel.querySelectorAll('input[required], select[required], textarea[required]'));
    for (var index = 0; index < fields.length; index += 1) {
      var field = fields[index];
      if (!field.checkValidity()) {
        var label = panel.querySelector('label[for="' + field.id + '"]');
        var text = label ? label.textContent.trim() : (field.name || 'This field');
        setError(value === 2 && field === email
          ? 'Enter a valid email address so we can reply.'
          : 'Please complete: ' + text + '.');
        field.focus({ preventScroll: true });
        return false;
      }
    }
    setError('');
    return true;
  }

  if (!timezone || !timezone.value) {
    timezone.value = localTimezone();
  }

  loadDraft();
  setStep(step);
  refreshMessage();

  next.addEventListener('click', function () {
    if (validateStep(1)) setStep(2);
  });
  back.addEventListener('click', function () { setStep(1); });

  [parentName, grade, email, phone, timezone].forEach(function (field) {
    if (!field) return;
    field.addEventListener('input', function () { refreshMessage(); saveDraft(); });
    field.addEventListener('change', function () { refreshMessage(); saveDraft(); });
  });
  if (message) {
    message.addEventListener('input', function () {
      message.dataset.edited = 'true';
      saveDraft();
    });
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      selectedTime = chip.dataset.time || '';
      chips.forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === chip));
      });
      refreshMessage();
      saveDraft();
    });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!validateStep(2)) return;

    var payload = {
      name: parentName.value.trim(),
      email: email.value.trim(),
      phone: phone ? phone.value.trim() : '',
      message: message.value.trim()
    };
    setError('');
    setStatus('Sending your request…', 'pending');
    send.disabled = true;

    try {
      var apiBase = window.MATHIFY_API_BASE || '/api';
      var response = await fetch(apiBase + '/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = {};
      try { data = await response.json(); } catch (errorValue) { data = {}; }
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'We could not send that request.');
      }

      clearDraft();
      form.hidden = true;
      if (progress) progress.hidden = true;
      success.hidden = false;
      if (successCopy) {
        successCopy.textContent = 'We will confirm a real demo slot with ' + payload.name +
          ' on ' + payload.email + ' shortly.';
      }
      if (successRef) {
        successRef.textContent = data.reference ? 'Reference · ' + data.reference : '';
      }
      if (whatsapp) {
        whatsapp.href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(
          'Hi Mathify — I just requested a 35-minute 1-on-1 demo' +
          (data.reference ? ' (ref ' + data.reference + ')' : '') +
          '. My email is ' + payload.email + '.'
        );
      }
      if (status) setStatus('', '');
    } catch (errorValue) {
      setStatus((errorValue && errorValue.message ? errorValue.message : 'We could not send that request.') +
        ' Please use WhatsApp or email from the Contact page.', 'error');
      send.disabled = false;
    }
  });

  editRequest.addEventListener('click', function () {
    success.hidden = true;
    form.hidden = false;
    if (progress) progress.hidden = false;
    setStep(2);
  });
})();
