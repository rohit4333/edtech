/* LiveKit Egress recording for verified 1:1 sessions.
 *
 * The browser never supplies a room or storage credential. The room is derived
 * from the authorized session id; the S3-compatible destination stays on the
 * server. Without LiveKit credentials or recording storage this fails closed
 * with an honest code instead of claiming a recording exists. */

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

function livekitConfig() {
  const url = envValue('LIVEKIT_URL');
  const apiKey = envValue('LIVEKIT_API_KEY');
  const apiSecret = envValue('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) return null;
  return {
    host: /^https?:\/\//i.test(url) ? url : 'https://' + url,
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

function client() {
  if (!sdkLoad) {
    try {
      const sdk = require('livekit-server-sdk');
      if (!sdk || typeof sdk.EgressClient !== 'function') {
        throw new Error('EgressClient is unavailable');
      }
      sdkLoad = Promise.resolve(sdk);
    } catch (error) {
      sdkLoad = Promise.reject(error);
    }
  }
  return sdkLoad.then(function (sdk) {
    const credentials = livekitConfig();
    if (!credentials) {
      throw failure('RECORDING_NOT_CONFIGURED', 'LiveKit credentials are not configured.', 503);
    }
    return new sdk.EgressClient(
      credentials.host, credentials.apiKey, credentials.apiSecret
    );
  });
}

function objectKey(sessionId, startedAt) {
  const prefix = envValue('LIVEKIT_EGRESS_KEY_PREFIX').replace(/^\/+|\/+$/g, '');
  const stamp = startedAt.replace(/[:.]/g, '-');
  const parts = [];
  if (prefix) parts.push(prefix);
  parts.push(sessionId, stamp + '-' + crypto.randomBytes(4).toString('hex') + '.mp4');
  return parts.join('/');
}

function publicUrl(key) {
  const base = envValue('LIVEKIT_RECORDING_PUBLIC_BASE').replace(/\/+$/, '');
  return base ? base + '/' + key : null;
}

/* EgressInfo is a protobuf message, but toJSON-like access is enough here. */
function safeInfo(info) {
  const file = info && info.fileResults && info.fileResults[0];
  return {
    egressId: String((info && info.egressId) || ''),
    status: String((info && info.status) || ''),
    objectKey: String((file && file.filename) || ''),
    url: String((file && file.location) || ''),
    durationSeconds: Number((info && info.duration) || 0)
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

  try {
    const egressClient = await client();
    const info = await egressClient.startRoomCompositeEgress(roomName, output, {
      layout: envValue('LIVEKIT_EGRESS_LAYOUT') || 'grid'
    });
    const details = safeInfo(info);
    const recordingId = 'rec_' + crypto.randomUUID();
    const record = await db.saveRecording({
      id: recordingId,
      sessionId: sessionId,
      roomName: roomName,
      egressId: details.egressId,
      objectKey: details.objectKey || key,
      url: details.url || publicUrl(key),
      status: 'recording',
      mode: 'livekit',
      provider: 'livekit-egress',
      startedAt: startedAt,
      stoppedAt: null,
      durationSeconds: 0
    });
    await realtime.publish(sessionId, 'recording.started', {
      recordingId: record.id,
      mode: 'livekit',
      active: true
    });
    return record;
  } catch (error) {
    if (error && error.code) throw error;
    throw failure('RECORDING_START_FAILED', 'LiveKit could not start the recording.', 502, error);
  }
}

async function stopRecording(input) {
  const recordingId = String((input && input.recordingId) || '').trim();
  const existing = recordingId ? await db.findRecording(recordingId) : null;
  if (!existing) {
    throw failure('RECORDING_NOT_FOUND', 'Recording not found.', 404);
  }
  if (existing.status === 'stopped') return existing;
  if (!livekitConfig()) {
    throw failure('RECORDING_NOT_CONFIGURED', 'LiveKit credentials are not configured.', 503);
  }

  const stoppedAt = new Date().toISOString();
  try {
    const egressClient = await client();
    const info = await egressClient.stopEgress(String(existing.egressId || ''));
    const details = safeInfo(info);
    const record = await db.saveRecording(Object.assign({}, existing, {
      status: 'stopped',
      mode: 'livekit',
      provider: 'livekit-egress',
      stoppedAt: stoppedAt,
      durationSeconds: details.durationSeconds ||
        Math.max(0, Math.round((Date.parse(stoppedAt) - Date.parse(existing.startedAt)) / 1000)),
      objectKey: details.objectKey || existing.objectKey || null,
      url: details.url || existing.url || publicUrl(details.objectKey || existing.objectKey || '')
    }));

    if (existing.sessionId && record.url && /^https?:\/\//i.test(record.url)) {
      await db.updateSession(existing.sessionId, function (session) {
        session.recording = {
          url: record.url,
          objectKey: record.objectKey,
          durationSeconds: record.durationSeconds,
          readyAt: stoppedAt
        };
        return session;
      });
    }

    await realtime.publish(existing.sessionId || existing.roomName, 'recording.stopped', {
      recordingId: record.id,
      stoppedAt: stoppedAt,
      hasUrl: Boolean(record.url)
    });
    return record;
  } catch (error) {
    if (error && error.code) throw error;
    throw failure('RECORDING_STOP_FAILED', 'LiveKit could not stop the recording.', 502, error);
  }
}

module.exports = {
  configured,
  startRecording,
  stopRecording
};
