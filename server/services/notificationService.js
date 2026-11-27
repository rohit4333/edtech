/* Human-handoff and lifecycle notifications.
 *
 * Slack uses the built-in fetch. All email goes through the shared Resend
 * service in emailService.js; no key is logged or serialized to a browser.
 * A missing Resend configuration is reported honestly and never mocked.
 */

const emailService = require('./emailService');
const config = require('../config');
const policy = require('../config/policy.json');
const timezoneService = require('./timezoneService');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 500);
}

/* One human-facing batch identifier for mail: the readable enrollment name,
   with the stable record id alongside it when both are available. */
function batchLabel(session) {
  const data = session || {};
  const code = clean(data.batchCode, 80);
  const id = clean(data.batchId, 80);
  if (!code && !id) return '';
  return code && id && code !== id ? code + ' (' + id + ')' : (code || id);
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
  const subject = 'New Mathify demo · ' + clean(request.parentName || request.name || 'Website visitor', 120);
  const lines = [
    'MATHIFY DEMO REQUEST',
    'Demo ID: ' + clean(request.demoId || request.id || '—', 80),
    'Parent: ' + clean(request.parentName || request.name || '—', 120),
    'Child: ' + clean(request.childName || '—', 120),
    'Email: ' + clean(request.email || '—', 160),
    'Phone: ' + clean(request.phone || '—', 60),
    'Curriculum: ' + clean(request.curriculumLabel || request.curriculum || '—', 120),
    'Grade: ' + clean(request.gradeLabel || request.grade || '—', 40),
    'Timezone: ' + clean(request.timezone || '—', 80),
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

/* Demo lifecycle mail to the parent address supplied in the booking. Links use
   only a validated server origin; a missing origin never becomes a URL. */
async function sendDemoEmail(info) {
  const data = info || {};
  const to = clean(data.email, 200);
  if (!to || !EMAIL.test(to)) return { sent: false, reason: 'no_recipient' };
  const kind = ['credentials', 'assigned', 'complete'].indexOf(data.kind) === -1
    ? 'assigned' : data.kind;
  const lines = [
    'MATHIFY DEMO · ' + kind.toUpperCase(),
    'Hello ' + clean(data.parentName || 'Parent', 80) + ',',
    '',
    'Child: ' + clean(data.childName || 'your child', 120),
    'Demo ID: ' + clean(data.demoId || '—', 80),
    'Batch: ' + clean(data.batchCode || 'pending assignment', 40)
  ];
  if (data.trainerName) lines.push('Trainer: ' + clean(data.trainerName, 120));

  if (kind === 'credentials') {
    lines.push('', 'Your shared child/parent demo login:',
      'Email: ' + to,
      'Password: ' + clean(data.password || '—', 120));
    if (data.studentLink) lines.push('Child desk: ' + clean(data.studentLink, 300));
    if (data.parentLink) lines.push('Parent desk: ' + clean(data.parentLink, 300));
    lines.push('', 'Keep this password. It stays your login until you change it yourself in ' +
      'Profile → Password. The demo desk opens when a trainer is assigned. ' +
      'After the demo it still opens payments and policies, but not classes.');
    lines.push('', 'Check your dashboard any time for your demo ID, batch and trainer.');
  } else if (kind === 'assigned') {
    lines.push('', 'A trainer has been assigned and your demo login is ready. ' +
      'Sign in with the password from the previous email.');
    if (data.studentLink) lines.push('Child desk: ' + clean(data.studentLink, 300));
    if (data.parentLink) lines.push('Parent desk: ' + clean(data.parentLink, 300));
  } else {
    lines.push('', 'Your demo is complete. The shared login now opens payments, ' +
      'the fee structure and class policies only. Choose a pack to continue classes.');
    if (data.parentLink) lines.push('Parent desk: ' + clean(data.parentLink, 300));
  }
  const subject = kind === 'credentials'
    ? 'Your Mathify demo login and demo ID'
    : kind === 'assigned'
      ? 'Your Mathify trainer has been assigned'
      : 'Your Mathify demo is complete';
  return sendTextEmail(to, subject, lines, false);
}

/* Password changes are always confirmed by email. The message never contains
   the old or new password, and delivery stays fail-closed without Resend. */
async function sendPasswordChangedEmail(info) {
  const data = info || {};
  const to = clean(data.email, 200);
  if (!to || !EMAIL.test(to)) return { sent: false, reason: 'no_recipient' };
  const lines = [
    'MATHIFY · PASSWORD CHANGED',
    'Hello ' + clean(data.name || 'there', 80) + ',',
    '',
    'The password for your ' + clean(data.role || 'Mathify', 40) + ' account was changed just now.',
    'If this was you, no further action is needed.',
    'If you did not change it, contact Mathify support immediately.',
    '',
    'Your new password is never included in this email.'
  ];
  return sendTextEmail(to, 'Your Mathify password was changed', lines, false);
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
    'Batch ID: ' + (batchLabel(session) || '—'),
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

/* ---------------------------------------------------------- join reminders */

/* Join links are built only from a validated server origin. A wildcard CORS
   value or a missing APP_ORIGIN never becomes a clickable link. */
function joinUrl(session) {
  const origin = config.resetOrigin();
  if (!origin || !session || !session.id) return null;
  return origin + '/classroom/connect.html?sessionId=' +
    encodeURIComponent(String(session.id)) + '&role=student&view=student&state=live';
}

/* The same UTC instant, rendered in the recipient's registered zone. The
   child's registration zone is the fallback for a shared family login. */
function startLabel(session, recipient) {
  const raw = session && (session.startsAt || session.scheduledAt || session.date);
  if (!raw) return 'See your dashboard';
  const zone = timezoneService.forUser(
    recipient,
    (session && (session.studentTimezone || session.timezone)) || process.env.MATHIFY_TIMEZONE
  );
  const formatted = timezoneService.format(raw, zone);
  return formatted ? formatted.text : clean(raw, 80);
}

function joinEmailHtml(title, lines, url, buttonLabel) {
  const esc = emailService.escapeHtml;
  const button = url
    ? '<p><a href="' + esc(url) + '" style="display:inline-block;background:#FF5B2E;' +
      'color:#0E1420;padding:12px 18px;border-radius:6px;text-decoration:none;' +
      'font-weight:600">' + esc(buttonLabel) + '</a></p>' +
      '<p style="font-size:12px;color:#555">If the button does not work, copy this link: ' +
      esc(url) + '</p>'
    : '';
  return '<div style="font-family:Poppins,Arial,sans-serif;color:#0E1420">' +
    '<h2>' + esc(title) + '</h2>' +
    '<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.5">' +
    esc(lines.join('\n')) + '</pre>' + button + '</div>';
}

async function sendJoinEmail(message) {
  const data = message || {};
  const recipient = data.recipient || {};
  const session = data.session || {};
  const role = data.role === 'parent' ? 'parent' : 'trainer';
  const to = clean(recipient.email, 200);
  if (!to) return { sent: false, reason: 'no_recipient' };
  const url = joinUrl(session);
  if (!url) return { sent: false, reason: 'origin_not_configured' };

  const studentName = clean(session.studentName || recipient.studentName || 'your student', 120);
  const title = role === 'parent'
    ? 'Your child’s Mathify class starts in 15 minutes'
    : 'Your Mathify class starts in 15 minutes';
  const lines = role === 'parent'
    ? [
      'Hello ' + clean(recipient.name || 'Parent', 80) + ',',
      '',
      studentName + '’s 1:1 maths class starts in 15 minutes.',
      'Session: ' + clean(session.title || 'Mathify 1:1', 160),
      'Batch ID: ' + (batchLabel(session) || '—'),
      'Starts (your time): ' + startLabel(session, recipient),
      '',
      'The shared classroom opens 10 minutes before the start. Use the button below to be ready on time.'
    ]
    : [
      'Hi ' + clean(recipient.name || 'Trainer', 80) + ',',
      '',
      'Your 1:1 maths class with ' + studentName + ' starts in 15 minutes.',
      'Session: ' + clean(session.title || 'Mathify 1:1', 160),
      'Batch ID: ' + (batchLabel(session) || '—'),
      'Starts (your time): ' + startLabel(session, recipient),
      '',
      'The room opens 10 minutes before the start. Join early so the class clock and pay are not affected.'
    ];

  const result = await emailService.sendMail({
    to: to,
    subject: title,
    html: joinEmailHtml(title, lines, url, 'Join classroom')
  });
  return result.ok ? { sent: true, id: result.id } : { sent: false, reason: result.code };
}

/* Late-join wording is derived from the published policy so the warning never
   overstates or invents a penalty. */
function lateJoinWarning() {
  const bands = (policy.payout && policy.payout.lateJoinBands) || [];
  const half = bands.find(function (band) {
    return Number(band.payFactor) > 0 && Number(band.payFactor) < 1;
  });
  const none = bands.find(function (band) { return Number(band.payFactor) === 0; });
  if (!half && !none) return 'Joining late may reduce your session pay.';
  const parts = [];
  if (half) parts.push('joining ' + half.fromMinutes + '–' + half.toMinutes +
    ' minutes late pays ' + Math.round(Number(half.payFactor) * 100) + '%');
  if (none) parts.push('joining ' + none.fromMinutes + ' minutes or more late pays nothing');
  return 'Joining late affects pay: ' + parts.join('; ') + '.';
}

async function sendTrainerUrgentReminder(info) {
  const data = info || {};
  const trainer = data.trainer || {};
  const session = data.session || {};
  const to = clean(trainer.email, 200);
  if (!to) return { email: { sent: false, reason: 'no_recipient' } };
  const url = joinUrl(session);
  if (!url) return { email: { sent: false, reason: 'origin_not_configured' } };

  const title = 'Join now — your Mathify slot is appearing';
  const lines = [
    'Hi ' + clean(trainer.name || 'Trainer', 80) + ',',
    '',
    'Your class starts in about 2 minutes and you have not joined yet.',
    'Session: ' + clean(session.title || 'Mathify 1:1', 160),
    'Batch ID: ' + (batchLabel(session) || '—'),
    'Starts (your time): ' + startLabel(session, trainer),
    '',
    'Join now to avoid a late-join penalty. ' + lateJoinWarning()
  ];
  const result = await emailService.sendMail({
    to: to,
    subject: title,
    html: joinEmailHtml(title, lines, url, 'Join classroom now')
  });
  return {
    email: result.ok ? { sent: true, id: result.id } : { sent: false, reason: result.code }
  };
}

/* Low-balance renewal mail. The parent is told the exact remaining classes,
   the batch ID and where to renew. Delivery never claims success without
   Resend, and the code never includes a password or payment detail. */
async function sendRenewalEmail(info) {
  const data = info || {};
  const parent = data.parent || {};
  const student = data.student || {};
  const to = clean(parent.email, 200);
  if (!to || !EMAIL.test(to)) return { sent: false, reason: 'no_recipient' };

  const balance = Math.max(0, Number(data.balance) || 0);
  const noun = balance === 1 ? 'class' : 'classes';
  const batch = clean(data.batchCode, 80);
  const lines = [
    'MATHIFY · SUBSCRIPTION RENEWAL REMINDER',
    'Hello ' + clean(parent.name || 'Parent', 80) + ',',
    '',
    clean(student.name || 'Your child', 120) + ' has ' + balance + ' ' + noun + ' left in the current pack.',
    'Renew the subscription now so the classes continue without a break.',
    'Batch ID: ' + (batch || '—')
  ];
  const origin = config.resetOrigin();
  if (origin) lines.push('', 'Parent desk: ' + origin.replace(/\/$/, '') + '/parent/index.html');

  const subject = 'Renew your Mathify subscription · ' + balance + ' ' + noun + ' left';
  return sendTextEmail(to, subject, lines, false);
}

/* A batch is handed to a trainer in one step. Whether the slots are a demo or
   a regular class, the trainer always receives the batch ID by email. Delivery
   stays fail-closed when Resend is not configured. */
async function sendTrainerAssignmentEmail(info) {
  const data = info || {};
  const trainer = data.trainer || {};
  const batch = data.batch || {};
  const to = clean(trainer.email, 200);
  if (!to || !EMAIL.test(to)) return { sent: false, reason: 'no_recipient' };

  const isDemo = data.isDemo !== false;
  const code = clean(batch.code || batch.id || '—', 80);
  const lines = [
    'MATHIFY · BATCH ASSIGNED',
    'Hello ' + clean(trainer.name || 'Trainer', 80) + ',',
    '',
    'A batch has been assigned to you.',
    'Batch ID: ' + code,
    'Batch record: ' + clean(batch.id || '—', 120),
    'Student: ' + clean(data.studentName ||
      (batch.student && batch.student.name) || 'your student', 120),
    'Class type: ' + (isDemo ? 'Demo session' : 'Regular class')
  ];
  const slots = Array.isArray(data.slots) ? data.slots : [];
  if (slots.length) {
    lines.push('', 'Scheduled slots: ' + slots.length);
    slots.slice(0, 6).forEach(function (slot, index) {
      const raw = slot && (slot.startsAt || slot.scheduledAt || slot.start);
      lines.push((index + 1) + '. ' + (raw ? clean(raw, 80) : 'See your dashboard'));
    });
  }
  const origin = config.resetOrigin();
  if (origin) lines.push('', 'Trainer desk: ' + origin.replace(/\/$/, '') + '/trainer/today');

  const subject = 'Mathify batch ' + code + ' assigned · ' +
    (isDemo ? 'demo session' : 'regular class');
  return sendTextEmail(to, subject, lines, false);
}

module.exports = {
  sendSlackAlert,
  sendEmailAlert,
  notifyHumanHandoff,
  notifyContactRequest,
  sendDemoEmail,
  sendPasswordChangedEmail,
  notifyParentRecap,
  sendSessionReminder,
  sendJoinEmail,
  sendTrainerUrgentReminder,
  sendTrainerAssignmentEmail,
  sendRenewalEmail,
  sendAttentionDigest
};
