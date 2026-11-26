/* Agora Cloud Recording seam. Uses the real REST API when configured, mock state otherwise. */
const db = require('../db');
const realtime = require('../realtime');

const BASE = 'https://api.agora.io/v1/apps';

function credentials() {
  const key = String(process.env.AGORA_CUSTOMER_KEY || '').trim();
  const secret = String(process.env.AGORA_CUSTOMER_SECRET || '').trim();
  if (!key || !secret) return null;
  return { key: key, secret: secret };
}

function headers(auth) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Basic ' + Buffer.from(auth.key + ':' + auth.secret).toString('base64')
  };
}

async function agoraRequest(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
  if (!response.ok) {
    const error = new Error((data && data.msg) || 'Agora Cloud Recording request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data || {};
}

function storageConfig(channelName) {
  let storage;
  if (process.env.AGORA_RECORDING_STORAGE_CONFIG) {
    try {
      storage = JSON.parse(process.env.AGORA_RECORDING_STORAGE_CONFIG);
    } catch (error) {
      throw Object.assign(new Error('AGORA_RECORDING_STORAGE_CONFIG is not valid JSON.'), {
        code: 'INVALID_STORAGE_CONFIG'
      });
    }
  } else {
    storage = {
      vendor: Number(process.env.AGORA_RECORDING_VENDOR || 0),
      region: Number(process.env.AGORA_RECORDING_REGION || 0),
      bucket: process.env.AGORA_RECORDING_BUCKET || '',
      accessKey: process.env.AGORA_RECORDING_ACCESS_KEY || '',
      secretKey: process.env.AGORA_RECORDING_SECRET_KEY || '',
      fileNamePrefix: ['mathify', channelName]
    };
  }

  if (!storage.bucket || !storage.accessKey || !storage.secretKey) {
    throw Object.assign(new Error('Agora recording storage is not configured.'), {
      code: 'INVALID_STORAGE_CONFIG', status: 503
    });
  }
  return storage;
}

async function startRecording(input) {
  const channelName = String(input.channelName || '').trim();
  const uid = String(input.uid || '').trim();
  const sessionId = input.sessionId || null;

  if (!channelName || !uid) {
    const error = new Error('channelName and uid are required.');
    error.code = 'INVALID_PAYLOAD';
    throw error;
  }

  const appId = String(process.env.AGORA_APP_ID || '').trim();
  const auth = credentials();
  const startedAt = new Date().toISOString();
  const recordingId = 'rec_' + Date.now();

  if (!auth || !appId) {
    const record = db.saveRecording({
      id: recordingId,
      sessionId: sessionId,
      channelName: channelName,
      uid: uid,
      resourceId: 'mock-resource-' + recordingId,
      sid: 'mock-sid-' + recordingId,
      status: 'recording',
      mode: 'mock',
      startedAt: startedAt,
      stoppedAt: null
    });
    realtime.publish(sessionId || channelName, 'recording.started', {
      recordingId: record.id,
      mode: 'mock'
    });
    return Object.assign({}, record, {
      note: 'Set Agora Cloud Recording credentials to call the real Agora API.'
    });
  }

  const acquireUrl = BASE + '/' + appId + '/cloud_recording/acquire';
  const acquired = await agoraRequest(acquireUrl, {
    method: 'POST',
    headers: headers(auth),
    body: JSON.stringify({
      cname: channelName,
      uid: uid,
      clientRequest: { scenario: 'Recording' }
    })
  });

  const resourceId = acquired.resourceId;
  if (!resourceId) throw new Error('Agora did not return a resourceId.');

  const startUrl = BASE + '/' + appId + '/cloud_recording/resourceid/' +
    resourceId + '/mode/composite/start';
  const started = await agoraRequest(startUrl, {
    method: 'POST',
    headers: headers(auth),
    body: JSON.stringify({
      cname: channelName,
      uid: uid,
      clientRequest: {
        token: input.token || undefined,
        storageConfig: storageConfig(channelName),
        recordingConfig: {
          channelType: 'RTM',
          maxIdleTime: 30,
          transcodingConfig: {
            width: 1280,
            height: 720,
            fps: 15,
            bitrate: 1600,
            mixedVideoLayout: 1
          }
        }
      }
    })
  });

  const record = db.saveRecording({
    id: recordingId,
    sessionId: sessionId,
    channelName: channelName,
    uid: uid,
    resourceId: resourceId,
    sid: started.sid || null,
    status: 'recording',
    mode: 'agora',
    startedAt: startedAt,
    stoppedAt: null
  });

  realtime.publish(sessionId || channelName, 'recording.started', {
    recordingId: record.id,
    resourceId: resourceId,
    sid: record.sid,
    mode: 'agora'
  });

  return record;
}

async function stopRecording(input) {
  const recordingId = input.recordingId;
  const existing = recordingId ? db.findRecording(recordingId) : null;
  if (!existing) {
    const error = new Error('Recording not found.');
    error.code = 'RECORDING_NOT_FOUND';
    throw error;
  }
  if (existing.status === 'stopped') return existing;

  const stoppedAt = new Date().toISOString();
  const auth = credentials();
  const appId = String(process.env.AGORA_APP_ID || '').trim();

  if (existing.mode === 'agora' && auth && appId && existing.resourceId && existing.sid) {
    const stopUrl = BASE + '/' + appId + '/cloud_recording/resourceid/' +
      existing.resourceId + '/sid/' + existing.sid + '/mode/composite/stop';
    await agoraRequest(stopUrl, {
      method: 'POST',
      headers: headers(auth),
      body: JSON.stringify({
        cname: existing.channelName,
        uid: existing.uid
      })
    });
  }

  const updated = db.saveRecording(Object.assign({}, existing, {
    status: 'stopped',
    stoppedAt: stoppedAt,
    url: input.url || existing.url || null
  }));

  realtime.publish(existing.sessionId || existing.channelName, 'recording.stopped', {
    recordingId: updated.id,
    stoppedAt: stoppedAt
  });

  if (existing.sessionId && input.url) {
    db.updateSession(existing.sessionId, function (session) {
      session.recording = {
        url: String(input.url),
        durationSeconds: Math.round((Date.parse(stoppedAt) - Date.parse(existing.startedAt)) / 1000),
        readyAt: stoppedAt
      };
      return session;
    });
  }

  return updated;
}

module.exports = {
  startRecording,
  stopRecording
};
