/* Human-handoff and lifecycle notifications.
 *
 * Slack uses the built-in fetch. All email goes through the shared Resend
 * service in emailService.js; no key is logged or serialized to a browser.
 * A missing Resend configuration is reported honestly and never mocked.
 */

const emailService = require('./emailService');

function clean(value, max) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 500);
}

function htmlFromLines(lines) {
  return '<div style="font-family:Poppins,Arial,sans-serif;color:#0E1420">' +
    '<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5">' +
    emailService.escapeHtml(Array.isArray(lines) ? lines.join('\n') : String(lines || '')) +
    '</pre></div>';
}

/* Shared fail-closed sender. `admin` means the recipient comes from the
   founder-controlled ADMIN_EMAIL setting rather than a session participant. */
async function sendTextEmail(to, subject, lines, admin) {
  const recipient = clean(to, 200);
  if (!recipient || !emailService.configured()) return { sent: false, reason: 'not_configured' };
  if (admin && !clean(process.env.ADMIN_EMAIL, 200)) {
    return { sent: false, reason: 'not_configured' };
  }
  const result = await emailService.sendMail({
    to: recipient,
    subject: clean(subject, 200),
    html: htmlFromLines(lines)
  });
  return result.ok
    ? { sent: true, id: result.id }
    : { sent: false, reason: result.code };
}

async function sendSlackAlert(phone, message, aiSummary, meta) {
  if (!process.env.SLACK_WEBHOOK_URL) return { sent: false, reason: 'not_configured' };

  const info = meta || {};
  const student = clean(info.studentName || 'Unknown student', 120);
  const text = [
    '🚨 *MATHIFY HUMAN HANDOFF REQUIRED* 🚨',
    '*Parent Phone:* ' + clean(phone, 60),
    '*Student:* ' + student,
    '*Original Message:* "' + clean(message, 500) + '"',
    '*AI Summary:* ' + clean(aiSummary, 500),
    '<Action Required: review in the admin log or reply manually on WhatsApp>'
  ].join('\n');

  try {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    if (!response.ok) throw new Error('Slack returned HTTP ' + response.status);
    console.log('Slack handoff alert sent.');
    return { sent: true };
  } catch (error) {
    console.error('Slack notification failed:', error.message);
    return { sent: false, reason: error.message };
  }
}

async function sendEmailAlert(phone, message, aiSummary, meta) {
  const info = meta || {};
  const result = await sendTextEmail(process.env.ADMIN_EMAIL,
    'URGENT: WhatsApp human handoff required', [
      'Parent Phone: ' + clean(phone, 60),
      'Student: ' + clean(info.studentName || 'Unknown student', 120),
      'Original Message: "' + clean(message, 1000) + '"',
      'AI Summary: ' + clean(aiSummary, 1000),
      '',
      'Please intervene manually via WhatsApp.'
    ], true);
  if (result.sent) console.log('Email handoff alert sent.');
  else console.error('Email handoff alert not sent:', result.reason);
  return result;
}

async function notifyHumanHandoff(payload) {
  const input = payload || {};
  const meta = { studentName: input.studentName };
  const results = await Promise.allSettled([
    sendSlackAlert(input.phone, input.message, input.summary, meta),
    sendEmailAlert(input.phone, input.message, input.summary, meta)
  ]);
  return {
    slack: results[0].status === 'fulfilled' ? results[0].value : { sent: false, reason: 'failed' },
    email: results[1].status === 'fulfilled' ? results[1].value : { sent: false, reason: 'failed' }
  };
}

async function notifyContactRequest(input) {
  const request = input || {};
  const subject = 'New Mathify booking request · ' + clean(request.name || 'Website visitor', 120);
  const lines = [
    'MATHIFY BOOKING REQUEST',
    'Name: ' + clean(request.name || '—', 120),
    'Email: ' + clean(request.email || '—', 160),
    'Phone: ' + clean(request.phone || '—', 60),
    'Message: "' + clean(request.message || '—', 800) + '"'
  ].join('\n');

  const slack = (async function () {
    if (!process.env.SLACK_WEBHOOK_URL) return { sent: false, reason: 'not_configured' };
    try {
      const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines })
      });
      if (!response.ok) throw new Error('Slack returned HTTP ' + response.status);
      return { sent: true };
    } catch (error) {
      console.error('Slack booking notification failed:', error.message);
      return { sent: false, reason: error.message };
    }
  })();

  const email = sendTextEmail(process.env.ADMIN_EMAIL, subject, lines, true);
  const results = await Promise.allSettled([slack, email]);
  return {
    slack: results[0].status === 'fulfilled' ? results[0].value : { sent: false, reason: 'failed' },
    email: results[1].status === 'fulfilled' ? results[1].value : { sent: false, reason: 'failed' }
  };
}

async function notifyParentRecap(info) {
  const data = info || {};
  const summary = clean(data.note || 'Session complete.', 1000);
  const lines = [
    'MATHIFY SESSION RECAP',
    'Student: ' + clean(data.studentName || 'Student', 120),
    'Trainer: ' + clean(data.trainerName || 'Mathify trainer', 120),
    'Session: ' + clean(data.sessionId || '—', 80),
    'Note: "' + summary + '"'
  ].join('\n');

  const slack = (async function () {
    if (!process.env.SLACK_WEBHOOK_URL) return { sent: false, reason: 'not_configured' };
    try {
      const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines })
      });
      if (!response.ok) throw new Error('Slack returned HTTP ' + response.status);
      return { sent: true };
    } catch (error) {
      console.error('Slack recap notification failed:', error.message);
      return { sent: false, reason: error.message };
    }
  })();

  const email = sendTextEmail(process.env.ADMIN_EMAIL,
    'Mathify session recap · ' + clean(data.studentName || 'Student', 120), lines, true);
  const results = await Promise.allSettled([slack, email]);
  return {
    slack: results[0].status === 'fulfilled' ? results[0].value : { sent: false, reason: 'failed' },
    email: results[1].status === 'fulfilled' ? results[1].value : { sent: false, reason: 'failed' }
  };
}

async function sendSessionReminder(info) {
  const data = info || {};
  const recipient = data.recipient || {};
  const session = data.session || {};
  const when = clean(data.when || 'upcoming', 20);
  const lines = [
    'MATHIFY SESSION REMINDER · ' + when.toUpperCase(),
    'Student: ' + clean(recipient.name || 'Student', 120),
    'Session: ' + clean(session.id || '—', 80),
    'Title: ' + clean(session.title || '1-on-1 maths session', 160),
    'Starts: ' + clean(session.startsAt || session.scheduledAt || 'See dashboard', 80),
    'Contact: ' + clean(recipient.email || recipient.phone || 'On file', 160)
  ].join('\n');

  const slack = (async function () {
    if (!process.env.SLACK_WEBHOOK_URL) return { sent: false, reason: 'not_configured' };
    try {
      const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines })
      });
      if (!response.ok) throw new Error('Slack returned HTTP ' + response.status);
      return { sent: true };
    } catch (error) {
      console.error('Slack reminder failed:', error.message);
      return { sent: false, reason: error.message };
    }
  })();

  const email = sendTextEmail(recipient.email,
    'Mathify session reminder · ' + when, lines, false);
  const results = await Promise.allSettled([slack, email]);
  return {
    slack: results[0].status === 'fulfilled' ? results[0].value : { sent: false, reason: 'failed' },
    email: results[1].status === 'fulfilled' ? results[1].value : { sent: false, reason: 'failed' }
  };
}

async function sendAttentionDigest(info) {
  const data = info || {};
  const recipient = data.recipient || {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (!recipient.email) return { email: { sent: false, reason: 'not_configured' } };

  const day = clean(data.date || new Date().toISOString().slice(0, 10), 20);
  const scope = clean(data.scope || recipient.name || data.trainerName || 'Trainer', 120);
  const lines = [
    'MATHIFY NEEDS ATTENTION · ' + day.toUpperCase(),
    'Scope: ' + scope,
    'Open items: ' + items.length,
    ''
  ];
  items.forEach(function (item, index) {
    lines.push((index + 1) + '. [' + clean((item && item.kind) || 'update', 24).toUpperCase() + '] ' +
      clean((item && item.title) || 'Review item', 200));
    if (item && item.meta) lines.push('   ' + clean(item.meta, 200));
  });

  const email = await sendTextEmail(recipient.email,
    'Mathify needs attention · ' + items.length + ' open item' + (items.length === 1 ? '' : 's'), lines, false);
  if (!email.sent) console.error('Email attention digest not sent:', email.reason);
  return { email: email };
}

module.exports = {
  sendSlackAlert,
  sendEmailAlert,
  notifyHumanHandoff,
  notifyContactRequest,
  notifyParentRecap,
  sendSessionReminder,
  sendAttentionDigest
};
