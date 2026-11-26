/* LiveKit token issuance for Mathify's verified 1:1 sessions.
 *
 * The browser may send `roomName` and `participantName`, but they are treated
 * as untrusted hints: the room, identity and grants are always derived from
 * the authorized session and JWT role. Mock mode is fully deterministic and
 * never loads the SDK or calls a provider. */

const config = require('../config');

const TOKEN_TTL_SECONDS = 2 * 60 * 60;
const ROOM_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

let sdkLoad = null;

function failure(code, message, status, cause) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function liveMode() {
  return config.databaseMode === 'supabase' || config.isProduction === true;
}

function websocketUrl(value) {
  const url = String(value || '').trim();
  if (/^https:\/\//i.test(url)) return 'wss://' + url.slice(8);
  if (/^http:\/\//i.test(url)) return 'ws://' + url.slice(7);
  return url;
}

function configuration() {
  const apiKey = envValue('LIVEKIT_API_KEY');
  const apiSecret = envValue('LIVEKIT_API_SECRET');
  const url = envValue('LIVEKIT_URL');
  return {
    apiKey: apiKey,
    apiSecret: apiSecret,
    url: url,
    websocketUrl: websocketUrl(url),
    available: Boolean(apiKey && apiSecret && url)
  };
}

/* Lazy, fail-closed SDK load. Keeping this out of module scope means an
   uninstalled SDK or a broken install never prevents the Express app from
   booting (all 44 suites require ../app synchronously). */
function loadSdk() {
  if (!sdkLoad) {
    try {
      sdkLoad = Promise.resolve(require('livekit-server-sdk'));
    } catch (error) {
      sdkLoad = Promise.reject(error);
    }
  }
  return sdkLoad;
}

function cleanId(value) {
  return String(value == null ? '' : value).replace(/[^A-Za-z0-9_-]/g, '');
}

function serverRoom(session) {
  const id = cleanId(session && session.id);
  if (!id) throw failure('SESSION_ROOM_MISSING', 'This session has no LiveKit room.', 409);
  return 'mathify-' + id;
}

/* `roomName` is accepted from req.body as requested, but may only confirm the
   room the server already derived. A mismatch is a hard privacy failure. */
function requestedRoom(session, requested) {
  const room = serverRoom(session);
  if (requested === undefined || requested === null) return room;
  const clean = String(requested).trim();
  if (!clean) return room;
  if (ROOM_PATTERN.test(clean) && clean === room) return room;
  throw failure('ROOM_MISMATCH', 'roomName does not match the verified session room.', 403);
}

function identityFor(user) {
  const role = String((user && user.role) || 'participant').toLowerCase();
  return role + '-' + (cleanId(user && user.id) || 'unknown');
}

function peerFor(session, user) {
  const role = String((user && user.role) || '').toLowerCase();
  const peerId = role === 'student' ? session.trainerId : session.studentId;
  const peerRole = role === 'student' ? 'trainer' : 'student';
  return peerId ? peerRole + '-' + cleanId(peerId) : '';
}

function displayName(user, requested) {
  const clean = String(requested == null ? '' : requested).trim().slice(0, 120);
  if (clean) return clean;
  return String((user && user.name) || (user && user.role) || 'Participant').slice(0, 120);
}

function baseRtc(session, user, options) {
  const opts = options || {};
  const observer = opts.observer === true || String(user && user.role) === 'founder';
  const roomName = requestedRoom(session, opts.roomName);
  const identity = identityFor(user);
  const expiresInSeconds = TOKEN_TTL_SECONDS;
  return {
    provider: 'livekit',
    roomName: roomName,
    room: roomName,
    channelName: roomName,
    identity: identity,
    uid: identity,
    name: displayName(user, opts.participantName),
    peerIdentity: peerFor(session, user),
    peerUid: peerFor(session, user),
    role: observer ? 'subscriber' : 'publisher',
    observer: observer,
    viewerRole: observer ? 'founder' : (String(user && user.role) === 'student' ? 'student' : 'trainer'),
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
    expiresInSeconds: expiresInSeconds
  };
}

/* Returns the RTC descriptor (sync in mock mode, a Promise in live mode). */
function issueSessionToken(session, user, options) {
  const rtc = baseRtc(session, user, options);
  const settings = configuration();

  if (!liveMode()) {
    return Object.assign({}, rtc, {
      mode: 'mock',
      mock: true,
      token: 'mock-livekit-token-' + rtc.identity,
      rtcToken: 'mock-livekit-token-' + rtc.identity,
      url: 'wss://livekit.mock.local',
      livekitUrl: 'wss://livekit.mock.local'
    });
  }

  if (!settings.available) {
    throw failure('LIVEKIT_NOT_CONFIGURED',
      'Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to issue tokens.', 503);
  }

  return loadSdk().then(function (sdk) {
    const AccessToken = sdk && sdk.AccessToken;
    if (typeof AccessToken !== 'function') {
      throw failure('LIVEKIT_SDK_UNAVAILABLE', 'The LiveKit server SDK could not be loaded.', 503);
    }
    const token = new AccessToken(settings.apiKey, settings.apiSecret, {
      identity: rtc.identity,
      name: rtc.name,
      ttl: TOKEN_TTL_SECONDS
    });
    token.addGrant({
      roomJoin: true,
      room: rtc.roomName,
      canPublish: !rtc.observer,
      canSubscribe: true,
      canPublishData: !rtc.observer,
      canUpdateOwnMetadata: !rtc.observer
    });
    /* v2 toJwt() is async and must be awaited. */
    return token.toJwt();
  }).then(function (jwt) {
    return Object.assign({}, rtc, {
      mode: 'livekit',
      mock: false,
      token: jwt,
      rtcToken: jwt,
      url: settings.websocketUrl,
      livekitUrl: settings.websocketUrl
    });
  }).catch(function (error) {
    if (error && error.status) throw error;
    throw failure('LIVEKIT_TOKEN_FAILED', 'Could not create the LiveKit token.', 502, error);
  });
}

/* Dev-only convenience for the standalone demo page: accepts the body values
   literally. The route that calls this is gated by ALLOW_DIRECT_ROOM_TOKENS
   and is disabled in production/Supabase mode. */
function issueDirectToken(options) {
  const opts = options || {};
  const roomName = String(opts.roomName || '').trim();
  const participantName = String(opts.participantName || '').trim();

  if (!ROOM_PATTERN.test(roomName)) {
    throw failure('INVALID_ROOM', 'roomName must be 1-128 letters, numbers, "_" or "-".', 400);
  }
  if (!participantName) {
    throw failure('INVALID_PARTICIPANT', 'participantName is required.', 400);
  }

  const settings = configuration();
  const identity = 'guest-' + (cleanId(participantName) || 'participant');
  const expiresInSeconds = TOKEN_TTL_SECONDS;
  const base = {
    provider: 'livekit',
    mode: liveMode() && settings.available ? 'livekit' : 'mock',
    roomName: roomName,
    room: roomName,
    identity: identity,
    name: participantName.slice(0, 120),
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
    expiresInSeconds: expiresInSeconds
  };

  if (base.mode === 'mock') {
    return Promise.resolve(Object.assign({}, base, {
      mock: true,
      token: 'mock-livekit-token-' + identity,
      rtcToken: 'mock-livekit-token-' + identity,
      url: 'wss://livekit.mock.local',
      livekitUrl: 'wss://livekit.mock.local'
    }));
  }

  return loadSdk().then(function (sdk) {
    const token = new sdk.AccessToken(settings.apiKey, settings.apiSecret, {
      identity: identity,
      name: base.name,
      ttl: expiresInSeconds
    });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    return token.toJwt();
  }).then(function (jwt) {
    return Object.assign({}, base, {
      mock: false,
      token: jwt,
      rtcToken: jwt,
      url: settings.websocketUrl,
      livekitUrl: settings.websocketUrl
    });
  }).catch(function (error) {
    if (error && error.status) throw error;
    throw failure('LIVEKIT_TOKEN_FAILED', 'Could not create the LiveKit token.', 502, error);
  });
}

/* Optional AI tutor dispatch. Never runs in mock mode, never on a founder
   observer join, and carries no names, contact details or answer keys. */
function dispatchAgent(session, rtc, options) {
  const agentName = envValue('LIVEKIT_AGENT_NAME');
  const skipped = function (reason) {
    return { skipped: true, dispatched: false, reused: false, reason: reason };
  };
  if (!agentName) return Promise.resolve(skipped('NO_AGENT_NAME'));
  if (!rtc || rtc.mock) return Promise.resolve(skipped('MOCK_MODE'));
  if (rtc.observer || (options && String(options.actor && options.actor.role) !== 'trainer')) {
    return Promise.resolve(skipped('NOT_ALLOWED'));
  }

  const settings = configuration();
  if (!settings.available) return Promise.resolve(skipped('NOT_CONFIGURED'));

  return loadSdk().then(function (sdk) {
    const AgentDispatchClient = sdk && sdk.AgentDispatchClient;
    if (typeof AgentDispatchClient !== 'function') return skipped('SDK_TOO_OLD');
    const client = new AgentDispatchClient(settings.url, settings.apiKey, settings.apiSecret);

    /* createDispatch has no dedupe of its own. One AI tutor per session room. */
    return Promise.resolve(client.listDispatch(rtc.roomName)).then(function (listed) {
      const rows = Array.isArray(listed) ? listed
        : (listed && Array.isArray(listed.agentDispatches) ? listed.agentDispatches : []);
      const exists = rows.some(function (row) {
        return String((row && row.agentName) || '') === agentName;
      });
      if (exists) return { skipped: false, dispatched: false, reused: true };
      return client.createDispatch(rtc.roomName, agentName, {
        metadata: JSON.stringify({ source: 'mathify', sessionId: cleanId(session && session.id) })
      }).then(function (dispatch) {
        return {
          skipped: false,
          dispatched: true,
          reused: false,
          id: String((dispatch && (dispatch.id || dispatch.dispatchId)) || '')
        };
      });
    });
  }).catch(function () {
    /* Dispatch is an enhancement; a failed dispatch must not block the human
       1:1 call. The client only sees a safe, generic status. */
    return { skipped: true, dispatched: false, reused: false, reason: 'DISPATCH_FAILED' };
  });
}

module.exports = {
  TOKEN_TTL_SECONDS,
  configuration,
  websocketUrl,
  loadSdk,
  issueSessionToken,
  issueDirectToken,
  dispatchAgent
};
