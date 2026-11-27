/* LiveKit Cloud webhook receiver.
 *
 * This endpoint is unauthenticated at the HTTP layer by necessity — LiveKit
 * cannot present a Mathify JWT — but every request must carry a valid LiveKit
 * webhook JWT whose sha256 claim matches the exact raw body. Session identity
 * is derived only from the server-owned room name; participant roles are
 * rechecked against the database before any presence event is written.
 */

const express = require('express');
const db = require('../db');
const realtime = require('../realtime');
const logger = require('../services/logger');

const router = express.Router();
const ROOM_PREFIX = 'mathify-';
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const PRESENCE_JOIN = ['participant_joined'];
const PRESENCE_LEAVE = ['participant_left', 'participant_connection_aborted'];
const ROOM_EVENTS = ['room_started', 'room_finished'];
const EGRESS_EVENTS = ['egress_started', 'egress_updated', 'egress_ended'];

/* Signature verification needs the untouched bytes, so this route reads the
   raw body before the app's global JSON parser. */
router.use(express.raw({ type: function () { return true; }, limit: '512kb' }));

function bodyText(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body || {});
}

function authHeader(req) {
  return req.get('authorize') || req.get('authorization') ||
    req.get('x-livekit-authorization') || '';
}

function parseIdentity(identity) {
  const match = /^(trainer|student|founder)-([A-Za-z0-9_-]+)$/
    .exec(String(identity || ''));
  if (!match) return null;
  return { role: match[1], id: match[2] };
}

function eventTime(value) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  return new Date().toISOString();
}

async function receiver() {
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  if (!apiKey || !apiSecret) return null;
  let sdk;
  try {
    sdk = require('livekit-server-sdk');
  } catch (error) {
    return null;
  }
  if (!sdk || typeof sdk.WebhookReceiver !== 'function') return null;
  return new sdk.WebhookReceiver(apiKey, apiSecret);
}

async function sessionFromRoom(roomName) {
  const name = String(roomName || '');
  if (!name.startsWith(ROOM_PREFIX)) return null;
  const id = name.slice(ROOM_PREFIX.length);
  if (!id || !SAFE_ID.test(id)) return null;
  return Promise.resolve(db.findSession(id));
}

async function processParticipant(session, event, at) {
  const parsed = parseIdentity(event.participant && event.participant.identity);
  /* A founder is observer-only: never count that presence as a participant. */
  if (!parsed || parsed.role === 'founder') return { ignored: 'unverified_participant' };

  const expectedId = parsed.role === 'trainer' ? session.trainerId : session.studentId;
  if (!expectedId || expectedId !== parsed.id) return { ignored: 'participant_not_in_session' };

  const user = await Promise.resolve(db.findUserById(parsed.id));
  if (!user || user.role !== parsed.role) return { ignored: 'participant_not_in_session' };

  let kind = null;
  if (PRESENCE_JOIN.indexOf(event.event) !== -1) kind = 'agora_join';
  if (PRESENCE_LEAVE.indexOf(event.event) !== -1) kind = 'agora_leave';
  if (!kind) return { ignored: 'unsupported_event' };

  await Promise.resolve(db.insertPresenceEvent({
    sessionId: session.id,
    userId: user.id,
    role: parsed.role,
    kind: kind,
    active: kind === 'agora_join',
    leaving: kind === 'agora_leave',
    at: at
  }));
  await Promise.resolve(realtime.publish(session.id,
    kind === 'agora_join' ? 'participant.joined' : 'participant.left',
    { role: parsed.role, at: at }));

  return { role: parsed.role, kind: kind };
}

async function processRoom(session, event, at) {
  const key = event.event === 'room_started' ? 'startedAt' : 'finishedAt';
  await Promise.resolve(db.updateSession(session.id, function (current) {
    const copy = Object.assign({}, current);
    copy.livekitRoom = Object.assign({}, copy.livekitRoom);
    copy.livekitRoom[key] = at;
    return copy;
  }));
  await Promise.resolve(realtime.publish(session.id, event.event, { at: at }));
  return { roomEvent: event.event };
}

async function processEgress(session, event, at) {
  const info = event.egressInfo || {};
  await Promise.resolve(db.updateSession(session.id, function (current) {
    const copy = Object.assign({}, current);
    copy.livekitEgress = {
      status: event.event,
      egressId: info.egressId ? String(info.egressId).slice(0, 160) : null,
      updatedAt: at
    };
    return copy;
  }));
  await Promise.resolve(realtime.publish(session.id, 'recording.status', {
    status: event.event,
    egressId: info.egressId ? String(info.egressId).slice(0, 160) : null
  }));
  return { egressEvent: event.event };
}

router.post('/', async function (req, res) {
  const webhookReceiver = await receiver();
  if (!webhookReceiver) {
    return res.status(503).json({
      error: 'WEBHOOK_NOT_CONFIGURED',
      message: 'LiveKit webhook credentials are not configured.'
    });
  }

  const raw = bodyText(req);
  let event;
  try {
    event = await webhookReceiver.receive(raw, authHeader(req));
  } catch (error) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }

  if (!event || !event.event || !event.id) {
    return res.status(400).json({ error: 'INVALID_PAYLOAD' });
  }

  const key = 'livekit_webhook:' + String(event.id).slice(0, 200);
  const claim = await Promise.resolve(db.claimReminder(key, {
    kind: 'livekit_webhook',
    event: event.event,
    at: new Date().toISOString()
  }));
  if (!claim || !claim.claimed) {
    return res.json({ ok: true, duplicate: true, event: event.event });
  }

  try {
    const session = await sessionFromRoom(event.room && event.room.name);
    if (!session) {
      return res.json({ ok: true, ignored: 'unknown_room', event: event.event });
    }

    const at = eventTime(event.createdAt);
    let outcome = { event: event.event, sessionId: session.id };
    if (PRESENCE_JOIN.concat(PRESENCE_LEAVE).indexOf(event.event) !== -1) {
      outcome = Object.assign(outcome, await processParticipant(session, event, at));
    } else if (ROOM_EVENTS.indexOf(event.event) !== -1) {
      outcome = Object.assign(outcome, await processRoom(session, event, at));
    } else if (EGRESS_EVENTS.indexOf(event.event) !== -1) {
      outcome = Object.assign(outcome, await processEgress(session, event, at));
    } else {
      outcome.ignored = 'unsupported_event';
    }

    logger.info('livekitWebhook', {
      event: event.event,
      sessionId: session.id,
      role: outcome.role || null,
      ignored: outcome.ignored || null
    });
    return res.json(Object.assign({ ok: true }, outcome));
  } catch (caught) {
    await Promise.resolve(db.releaseReminderClaim(key));
    logger.error('livekitWebhook', {
      event: event.event,
      error: caught && caught.message ? caught.message : 'unknown'
    });
    return res.status(503).json({ error: 'WEBHOOK_PROCESSING_FAILED' });
  }
});

/* Production must never accept an unsigned webhook just because credentials
   are absent in a local .env; the same check is enforced in config guards. */
router.use(function (req, res) {
  return res.status(404).json({ error: 'NOT_FOUND' });
});

module.exports = router;
