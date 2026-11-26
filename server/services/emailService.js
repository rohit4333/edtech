/* Transactional email through Resend.
 *
 * Lazy, fail-closed loading keeps the server bootable when the optional
 * package or key is absent. The API key never appears in logs or responses. */

let sdkLoad = null;

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function configured() {
  return Boolean(envValue('RESEND_API_KEY') && envValue('RESEND_FROM'));
}

function loadSdk() {
  if (!sdkLoad) {
    try {
      sdkLoad = Promise.resolve(require('resend'));
    } catch (error) {
      sdkLoad = Promise.reject(error);
    }
  }
  return sdkLoad;
}

/* Returns { ok, id } or { ok:false, code }. Callers decide how to surface it. */
async function sendMail(message) {
  if (!configured()) return { ok: false, code: 'EMAIL_NOT_CONFIGURED' };

  const payload = {
    from: envValue('RESEND_FROM'),
    to: String((message && message.to) || '').trim(),
    subject: String((message && message.subject) || '').slice(0, 200),
    html: String((message && message.html) || '').slice(0, 100000)
  };
  if (!payload.to || !payload.subject || !payload.html) {
    return { ok: false, code: 'EMAIL_INVALID' };
  }

  try {
    const sdk = await loadSdk();
    const Resend = sdk && sdk.Resend;
    if (typeof Resend !== 'function') return { ok: false, code: 'EMAIL_SDK_UNAVAILABLE' };
    const client = new Resend(envValue('RESEND_API_KEY'));
    const result = await client.emails.send(payload);
    if (result && result.error) return { ok: false, code: 'EMAIL_REJECTED' };
    return { ok: true, id: String((result && result.data && result.data.id) || '') };
  } catch (error) {
    return { ok: false, code: 'EMAIL_FAILED' };
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Convenience helper for the classroom invitation. Only a syntactically valid
   email and an http(s) link are accepted; the link is escaped before it is
   placed in the HTML attribute. */
async function sendSessionEmail(studentEmail, sessionLink) {
  const to = String(studentEmail || '').trim();
  const link = String(sessionLink || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !/^https?:\/\/\S+$/i.test(link)) {
    return { ok: false, code: 'EMAIL_INVALID' };
  }
  const safe = escapeHtml(link);
  const html = [
    '<div style="font-family:Poppins,Arial,sans-serif;color:#0E1420">',
    '<h2>Your Mathify classroom is ready</h2>',
    '<p>Your trainer has shared a private 1:1 session with you.</p>',
    '<p><a href="' + safe + '" style="display:inline-block;background:#FF5B2E;color:#0E1420;',
    'padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Join Classroom</a></p>',
    '<p style="font-size:12px;color:#555">If the button does not work, copy this link into your browser: ' +
      safe + '</p>',
    '</div>'
  ].join('');

  const result = await sendMail({
    to: to,
    subject: 'Join your Mathify classroom',
    html: html
  });
  return result;
}

module.exports = { configured, sendMail, sendSessionEmail, escapeHtml };
