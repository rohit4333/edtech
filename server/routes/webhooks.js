const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const config = require('../config');
const realtime = require('../realtime');
const whatsappAi = require('../services/whatsappAiService');
const notifications = require('../services/notificationService');

const router = express.Router();

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twiml(message) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Message>' + escapeXml(message) + '</Message></Response>';
}

/* Twilio verifies with HMAC-SHA1 over the configured URL plus sorted form params.
   Verification is skipped only in local mock mode; live mode fails closed. */
function verifyTwilioSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
  if (!authToken || !webhookUrl) return !config.isProduction;

  const signature = req.headers['x-twilio-signature'];
  if (!signature) return false;

  const params = req.body || {};
  const payload = Object.keys(params).sort().map(function (key) {
    return key + String(params[key]);
  }).join('');

  const expected = crypto.createHmac('sha1', authToken)
    .update(webhookUrl + payload)
    .digest('base64');

  const received = Buffer.from(String(signature));
  const calculated = Buffer.from(expected);
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

router.post('/recording', async function (req, res) {
  const configuredSecret = String(process.env.RECORDING_WEBHOOK_SECRET || '').trim();
  if (!configuredSecret) {
    if (config.isProduction) {
      return res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED' });
    }
  } else {
    const provided = Buffer.from(String(req.headers['x-webhook-secret'] || ''));
    const expected = Buffer.from(configuredSecret);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ error: 'INVALID_WEBHOOK_SECRET' });
    }
  }

  const body = req.body || {};
  if (!body.sessionId || !body.url) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'sessionId and url are required.' });
  }

  /* The live adapter returns a Promise here; awaiting both the write and the
     publish keeps the response from dereferencing a pending record. */
  try {
    const updated = await db.updateSession(body.sessionId, function (session) {
      session.recording = {
        url: String(body.url),
        durationSeconds: Number(body.durationSeconds || session.elapsedSeconds || 0),
        readyAt: new Date().toISOString()
      };
      return session;
    });

    if (!updated) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    await realtime.publish(updated.id, 'recording.ready', { url: updated.recording.url });
    return res.json({ ok: true, sessionId: updated.id });
  } catch (error) {
    return res.status(503).json({ error: 'RECORDING_WEBHOOK_FAILED', message: error.message });
  }
});

router.post('/whatsapp', express.urlencoded({ extended: false }), async function (req, res) {
  if (!verifyTwilioSignature(req)) {
    return res.status(403).type('text/plain').send('Invalid Twilio signature.');
  }

  const body = req.body || {};
  const from = body.From;
  const messageBody = body.Body;
  const messageSid = body.MessageSid ? String(body.MessageSid) : null;

  if (!from || !messageBody) {
    return res.status(400).type('text/xml').send(twiml(
      'I did not catch that. Please send your question again.'
    ));
  }

  try {
    /* Atomic claim replaces find-then-record. Concurrent identical SIDs race on
       the primary key in live mode, so only one delivery reaches AI generation. */
    if (messageSid) {
      const claim = await db.claimWhatsappMessage({
        id: messageSid,
        from: String(from),
        body: String(messageBody),
        receivedAt: new Date().toISOString()
      });
      if (!claim || !claim.claimed) {
        return res.type('text/xml').send('<Response/>');
      }
    }

    const outcome = await whatsappAi.generateAiResponse(from, messageBody);

    if (outcome.handoff && outcome.handoff.required) {
      const escalation = await db.recordSupportEscalation({
        id: 'sup_' + crypto.randomUUID(),
        from: String(from),
        studentId: outcome.student ? outcome.student.id : null,
        studentName: outcome.student ? outcome.student.name : null,
        message: String(messageBody).slice(0, 1000),
        summary: outcome.handoff.summary,
        status: 'open',
        createdAt: new Date().toISOString()
      });

      realtime.publish('support', 'support.handoff_required', {
        id: escalation.id,
        summary: escalation.summary,
        studentName: escalation.studentName
      });

      /* Founder still gets email/Slack. The bot then stops for this phone so a
         follow-up cannot create a second escalation while a human is handling it. */
      const notificationResult = await notifications.notifyHumanHandoff({
        phone: from,
        message: messageBody,
        summary: escalation.summary,
        studentName: escalation.studentName
      });
      const pauseState = whatsappAi.pauseBotForParent(from);
      await db.updateSupportEscalation(escalation.id, {
        notifications: notificationResult,
        botPaused: pauseState.paused,
        pausedAt: pauseState.pausedAt
      });

      console.warn('[whatsapp] human handoff required:', escalation.id, escalation.summary,
        'botPaused=' + String(pauseState.paused));
    }

    return res.type('text/xml').send(twiml(outcome.reply));
  } catch (error) {
    console.error('WhatsApp webhook error:', error.message);
    return res.type('text/xml').send(twiml(
      'I am having a brief technical issue. A Mathify coordinator will reply shortly.'
    ));
  }
});

module.exports = router;
