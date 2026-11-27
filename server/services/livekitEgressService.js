/* LiveKit Egress recording for verified 1:1 sessions.
 *
 * The browser never supplies a room or storage credential. The room is derived
 * from the authorized session id; the S3-compatible destination and object key
 * stay on the server. Recordings live in a private bucket: this service never
 * writes a bearer-free public URL. Browsers receive short-lived signed links
 * from /api/recordings/:sessionId/url after an authorization check. Without
 * LiveKit credentials or recording storage this fails closed with an honest
 * code instead of claiming a recording exists. */

const crypto = require('crypto');
const db = require('../db');
const realtime = require('../realtime');

const SESSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
let sdkLoad = null;

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function failure(code, message, status, cause) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

/* LiveKit dashboards hand out a wss:// client URL. The server SDK needs the
   matching HTTPS management endpoint; concatenating https:// in front of the
   wss:// value produces an invalid host and a bare `fetch failed`. */
function normalizeHost(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/^wss:\/\//i.test(url)) return 'https://' + url.slice(6).replace(/\/+$/, '');
  if (/^ws:\/\//i.test(url)) return 'http://' + url.slice(5).replace(/\/+$/, '');
  if (/^https?:\/\//i.test(url)) return url;
  return 'https://' + url.replace(/\/+$/, '');
}

function livekitConfig() {
  const url = envValue('LIVEKIT_URL');
  const apiKey = envValue('LIVEKIT_API_KEY');
  const apiSecret = envValue('LIVEKIT_API_SECRET');
  const host = normalizeHost(url);
  if (!host || !apiKey || !apiSecret) return null;
  return {
    host: host,
    apiKey: apiKey,
    apiSecret: apiSecret
  };
}

function storageConfig() {
  const bucket = envValue('LIVEKIT_EGRESS_BUCKET');
  const accessKey = envValue('LIVEKIT_EGRESS_ACCESS_KEY');
  const secretKey = envValue('LIVEKIT_EGRESS_SECRET_KEY');
  const region = envValue('LIVEKIT_EGRESS_REGION');
  if (!bucket || !accessKey || !secretKey || !region) return null;
  return {
    bucket: bucket,
    accessKey: accessKey,
    secret: secretKey,
    region: region,
    endpoint: envValue('LIVEKIT_EGRESS_ENDPOINT'),
    forcePathStyle: /^(1|true|yes)$/i.test(envValue('LIVEKIT_EGRESS_FORCE_PATH_STYLE'))
  };
}

function configured() {
  return Boolean(livekitConfig() && storageConfig());
}

function sdkModule() {
  if (!sdkLoad) {
    try {
      const sdk = require('livekit-server-sdk');
      if (!sdk || typeof sdk.EgressClient !== 'function' ||
          typeof sdk.RoomServiceClient !== 'function') {
        throw new Error('LiveKit server SDK clients are unavailable');
      }
      sdkLoad = Promise.resolve(sdk);
    } catch (error) {
      sdkLoad = Promise.reject(error);
    }
  }
  return sdkLoad;
}

function client() {
  return sdkModule().then(function (sdk) {
    const credentials = livekitConfig();
    if (!credentials) {
      throw failure('RECORDING_NOT_CONFIGURED', 'LiveKit credentials are not configured.', 503);
    }
    return new sdk.EgressClient(
      credentials.host, credentials.apiKey, credentials.apiSecret
    );
  });
}

/* Egress requires an existing room. LiveKit normally creates it on first
   join, but a trainer can start recording before anyone connects, so the
   server creates the server-owned room idempotently first. */
async function ensureRoom(roomName) {
  const sdk = await sdkModule();
  const credentials = livekitConfig();
  if (!credentials) {
    throw failure('RECORDING_NOT_CONFIGURED', 'LiveKit credentials are not configured.', 503);
  }
  const rooms = new sdk.RoomServiceClient(
    credentials.host, credentials.apiKey, credentials.apiSecret
  );
  const existing = await rooms.listRooms([roomName]);
  if (Array.isArray(existing) && existing.length) return;
  try {
    await rooms.createRoom({
      name: roomName,
      emptyTimeout: 300,
      departureTimeout: 60,
      maxParticipants: 10
    });
  } catch (error) {
    if (!/already exists|already.*room/i.test(String((error && error.message) || ''))) {
      throw error;
    }
  }
}

/* Storage RLS scopes reads to the first path segment being the session id
   (server/migrations/0009_recordings_storage.sql). Any operator prefix comes
   after that segment and can never break the authorization contract. */
function objectKey(sessionId, startedAt) {
  const prefix = envValue('LIVEKIT_EGRESS_KEY_PREFIX').replace(/^\/+|\/+$/g, '');
  const stamp = String(startedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const parts = [sessionId];
  if (prefix) parts.push(prefix);
  parts.push(stamp + '-' + crypto.randomBytes(4).toString('hex') + '.mp4');
  return parts.join('/');
}

/* EgressInfo is a protobuf message, but toJSON-like access is enough here.
   `location` is an S3 URI for internal storage only; it is never a browser URL. */
function safeInfo(info) {
  const file = info && info.fileResults && info.fileResults[0];
  return {
    egressId: String((info && info.egressId) || ''),
    status: String((info && info.status) || ''),
    objectKey: String((file && file.filename) || ''),
    location: String((file && file.location) || ''),
    durationSeconds: Number((info && info.duration) || 0)
  };
}

/* EgressStatus: 3 = EGRESS_COMPLETE; 4/5/6 are failed/aborted/limit. A
   reservation object key is not proof that a file was actually uploaded. */
function producedFile(details) {
  return Boolean(details && details.objectKey) &&
    !/^(4|5|6|EGRESS_FAILED|EGRESS_ABORTED|EGRESS_LIMIT_REACHED)$/i
      .test(String((details && details.status) || ''));
}

function baseRecord(sessionId, startedAt, key) {
  return {
    id: 'rec_' + crypto.randomUUID(),
    sessionId: sessionId,
    roomName: 'mathify-' + sessionId,
    egressId: '',
    objectKey: key,
    location: '',
    url: null,
    status: 'recording',
    mode: 'livekit',
    provider: 'livekit-egress',
    startedAt: startedAt,
    stoppedAt: null,
    durationSeconds: 0
  };
}

async function startRecording(input) {
  const sessionId = String((input && input.sessionId) || '').trim();
  if (!SESSION_PATTERN.test(sessionId)) {
    throw failure('INVALID_SESSION_ID', 'A valid session id is required.', 400);
  }
  const credentials = livekitConfig();
  const storage = storageConfig();
  if (!credentials || !storage) {
    throw failure('RECORDING_NOT_CONFIGURED',
      'LiveKit recording storage is not configured.', 503);
  }

  const existing = await db.findActiveRecording(sessionId);
  if (existing) {
    throw failure('RECORDING_ALREADY_ACTIVE', 'This session already has an active recording.', 409);
  }

  const startedAt = new Date().toISOString();
  const key = objectKey(sessionId, startedAt);
  const roomName = 'mathify-' + sessionId;
  const output = {
    filepath: key,
    fileType: 1,
    output: { case: 's3', value: storage }
  };

  await ensureRoom(roomName);

  /* Reserve the row after the room exists but before starting Egress. A
     provider call that succeeds after a DB failure would be untracked. */
  let record = await db.saveRecording(baseRecord(sessionId, startedAt, key));

  try {
    const egressClient = await client();
    const info = await egressClient.startRoomCompositeEgress(roomName, output, {
      layout: envValue('LIVEKIT_EGRESS_LAYOUT') || 'grid'
    });
    const details = safeInfo(info);
    record = await db.saveRecording(Object.assign({}, record, {
      egressId: details.egressId || '',
      objectKey: details.objectKey || key,
      location: details.location || '',
      status: 'recording'
    }));
    await realtime.publish(sessionId, 'recording.started', {
      recordingId: record.id,
      mode: 'livekit',
      active: true
    });
    return record;
  } catch (error) {
    await db.saveRecording(Object.assign({}, record, {
      status: 'failed',
      failureCode: (error && error.code) || 'RECORDING_START_FAILED',
      stoppedAt: new Date().toISOString()
    }));
    await realtime.publish(sessionId, 'recording.failed', {
      recordingId: record.id,
      mode: 'livekit',
      active: false
    });
    throw failure('RECORDING_START_FAILED', 'LiveKit could not start the recording.', 502, error);
  }
}

/* A completed or already-stopped egress is reconciled locally instead of
   leaving a row permanently marked as recording. */
function wordingLooksFinished(error) {
  const text = String((error && error.message) || (error && error.code) || '').toLowerCase();
  return /not found|already (?:stopped|ended|complete)|completed|invalid|no such/.test(text);
}

async function stopRecording(input) {
  const recordingId = String((input && input.recordingId) || '').trim();
  const existing = recordingId ? await db.findRecording(recordingId) : null;
  if (!existing) {
    throw failure('RECORDING_NOT_FOUND', 'Recording not found.', 404);
  }
  if (existing.status === 'stopped') return existing;
  if (existing.status !== 'recording' || existing.mode !== 'livekit') {
    throw failure('RECORDING_NOT_ACTIVE', 'This recording is not active.', 409);
  }
  if (!livekitConfig()) {
    throw failure('RECORDING_NOT_CONFIGURED', 'LiveKit credentials are not configured.', 503);
  }

  const stoppedAt = new Date().toISOString();
  let details = { objectKey: '', location: '', durationSeconds: 0 };
  try {
    const egressClient = await client();
    const info = await egressClient.stopEgress(String(existing.egressId || ''));
    details = safeInfo(info);
  } catch (error) {
    if (!wordingLooksFinished(error)) {
      throw failure('RECORDING_STOP_FAILED', 'LiveKit could not stop the recording.', 502, error);
    }
  }

  const durationSeconds = details.durationSeconds ||
    Math.max(0, Math.round((Date.parse(stoppedAt) - Date.parse(existing.startedAt)) / 1000));
  const ready = producedFile(details);
  const record = await db.saveRecording(Object.assign({}, existing, {
    status: ready ? 'stopped' : 'failed',
    failureCode: ready ? null : 'EGRESS_NO_FILE',
    mode: 'livekit',
    provider: 'livekit-egress',
    stoppedAt: stoppedAt,
    durationSeconds: durationSeconds,
    objectKey: details.objectKey || existing.objectKey || null,
    location: details.location || existing.location || '',
    url: null
  }));

  if (ready && existing.sessionId) {
    await db.updateSession(existing.sessionId, function (session) {
      session.recording = {
        id: record.id,
        sessionId: existing.sessionId,
        objectKey: record.objectKey,
        status: 'stopped',
        durationSeconds: record.durationSeconds,
        readyAt: stoppedAt,
        url: null
      };
      return session;
    });
  }

  await realtime.publish(existing.sessionId || existing.roomName,
    ready ? 'recording.stopped' : 'recording.failed', {
      recordingId: record.id,
      stoppedAt: stoppedAt,
      hasFile: ready
    });
  if (!ready) {
    throw failure('RECORDING_NO_FILE', 'LiveKit did not produce a recording file.', 502);
  }
  return record;
}

/* Called when a session ends so an abandoned browser tab cannot leave an
   active egress or a stuck "recording" row behind. */
async function stopSessionRecording(sessionId) {
  const active = await db.findActiveRecording(String(sessionId || ''));
  if (!active || active.mode !== 'livekit') return null;
  return stopRecording({ recordingId: active.id });
}

/* A verified LiveKit egress webhook is the source of truth for the final
   object path. Reconcile it into the recording row and the session's viewer
   record so every role can later request a short-lived signed link. */
async function reconcileEgress(sessionId, info, at, eventName) {
  const id = String(sessionId || '').trim();
  if (!SESSION_PATTERN.test(id)) return null;

  const details = safeInfo(info || {});
  const egressId = details.egressId;
  const finished = eventName === 'egress_ended' ||
    /END(?:ED)?|COMPLETE/i.test(details.status);
  const ready = producedFile(details);
  const status = finished ? (ready ? 'stopped' : 'failed') : 'recording';

  const rows = await Promise.resolve(db.listRecordings());
  const candidates = rows.filter(function (row) { return row.sessionId === id; });
  let existing = egressId
    ? candidates.find(function (row) { return row.egressId === egressId; })
    : null;
  if (!existing) {
    existing = candidates.find(function (row) { return row.status === 'recording'; });
  }

  const patch = {
    egressId: egressId || (existing && existing.egressId) || '',
    objectKey: details.objectKey ||
      (finished && !ready ? null : (existing && existing.objectKey)) || null,
    location: details.location || (existing && existing.location) || '',
    status: status,
    failureCode: finished && !ready ? 'EGRESS_NO_FILE' : null,
    mode: 'livekit',
    provider: 'livekit-egress',
    durationSeconds: details.durationSeconds || (existing && existing.durationSeconds) || 0,
    stoppedAt: finished ? (at || new Date().toISOString()) : null,
    url: null
  };
  if (!existing && (!ready || !finished)) return null;

  const record = await Promise.resolve(db.saveRecording(Object.assign(
    existing || {
      id: 'rec_' + crypto.randomUUID(),
      sessionId: id,
      roomName: 'mathify-' + id,
      startedAt: at || new Date().toISOString()
    },
    patch
  )));

  if (finished && ready) {
    await Promise.resolve(db.updateSession(id, function (session) {
      session.recording = {
        id: record.id,
        sessionId: id,
        objectKey: patch.objectKey,
        status: 'stopped',
        durationSeconds: patch.durationSeconds,
        readyAt: patch.stoppedAt,
        url: null
      };
      return session;
    }));
  }
  return record;
}

module.exports = {
  configured,
  normalizeHost,
  objectKey,
  startRecording,
  stopRecording,
  stopSessionRecording,
  reconcileEgress
};
