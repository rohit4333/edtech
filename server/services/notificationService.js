/* Human-handoff notifications for the WhatsApp parent assistant.
   Slack uses Node 18's built-in fetch; email uses nodemailer (declared in package.json). */
function clean(value, max) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max || 500);
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

    if (!response.ok) {
      throw new Error('Slack returned HTTP ' + response.status);
    }

    console.log('Slack handoff alert sent.');
    return { sent: true };
  } catch (error) {
    console.error('Slack notification failed:', error.message);
    return { sent: false, reason: error.message };
  }
}

async function sendEmailAlert(phone, message, aiSummary, meta) {
  if (!process.env.ADMIN_EMAIL || !process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
    return { sent: false, reason: 'not_configured' };
  }

  const info = meta || {};

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: process.env.NODEMAILER_SERVICE || 'gmail',
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });

    await transporter.sendMail({
      from: '"Mathify OS Bot" <' + process.env.NODEMAILER_EMAIL + '>',
      to: process.env.ADMIN_EMAIL,
      subject: 'URGENT: WhatsApp human handoff required',
      text: [
        'Parent Phone: ' + clean(phone, 60),
        'Student: ' + clean(info.studentName || 'Unknown student', 120),
        'Original Message: "' + clean(message, 1000) + '"',
        'AI Summary: ' + clean(aiSummary, 1000),
        '',
        'Please intervene manually via WhatsApp.'
      ].join('\n')
    });

    console.log('Email handoff alert sent.');
    return { sent: true };
  } catch (error) {
    console.error('Email notification failed:', error.message);
    return { sent: false, reason: error.message };
  }
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

module.exports = {
  sendSlackAlert,
  sendEmailAlert,
  notifyHumanHandoff
};
