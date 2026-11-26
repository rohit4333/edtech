/* Booking form: posts to the Mathify API with explicit pending/success/error
   states. Email and WhatsApp remain visible fallbacks beside the form. */
(function () {
  'use strict';

  var form = document.getElementById('bookingForm');
  if (!form) return;

  var status = document.getElementById('bookingStatus');
  var button = form.querySelector('button[type="submit"]');
  var apiBase = window.MATHIFY_API_BASE || '/api';

  function setStatus(text, tone) {
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || '';
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;

    var payload = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      phone: form.elements.phone.value,
      message: form.elements.message.value
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
      setStatus('Request received. We will contact you shortly.', 'success');
    } catch (error) {
      setStatus('We could not send that request. Email hello@mathify.app or use WhatsApp instead.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
