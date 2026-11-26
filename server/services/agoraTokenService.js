/* Server-owned Agora identity and tokens. Channel, uid and peer identity are
   derived from the session + verified role; browser input is never trusted. */
const crypto = require('crypto');
const { RtcTokenBuilder, RtmTokenBuilder, RtcRole } = require('agora-token');
const config = require('../config');
const networkQuality = require('./networkQualityService');

const TOKEN_TTL_SECONDS = 3600;

function numericUid(userId) {
  const digest = crypto.createHash('sha256').update(String(userId || '')).digest('hex');
  return parseInt(digest.slice(0, 8), 16) % 1000000000;
}

function configured() {
  const appId = String(process.env.AGORA_APP_ID || '').trim();
  const appCertificate = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
  return appId && appCertificate ? { appId, appCertificate } : null;
}

/* The mock database mode is the local demo contract. Fake App IDs/certificates
   make the Agora builder return an empty string; deterministic mock tokens keep
   local flows usable without ever emitting a null/empty RTM token as success. */
function mockMode() {
  return config.databaseMode !== 'supabase';
}

function mockToken(prefix, parts) {
  const digest = crypto.createHash('sha256')
    .update(parts.map(function (part) { return String(part); }).join('|'))
    .digest('hex')
    .slice(0, 32);
  return prefix + '_' + digest;
}

function usableToken(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function rtcToken(settings, channel, uid, role) {
  const mockFallback = function () {
    return mockMode()
      ? mockToken('mock_rtc', [settings.appId, channel, uid, role, TOKEN_TTL_SECONDS])
      : null;
  };

  if (!RtcTokenBuilder || typeof RtcTokenBuilder.buildTokenWithUid !== 'function') {
    const fallback = mockFallback();
    if (fallback) return fallback;
    throw Object.assign(new Error('The Agora RTC token builder is unavailable.'), {
      code: 'RTC_TOKEN_UNAVAILABLE', status: 503
    });
  }

  let token = null;
  try {
    token = RtcTokenBuilder.buildTokenWithUid(
      settings.appId,
      settings.appCertificate,
      channel,
      uid,
      role,
      TOKEN_TTL_SECONDS,
      TOKEN_TTL_SECONDS
    );
  } catch (error) {
    token = null;
  }

  if (!usableToken(token)) {
    const fallback = mockFallback();
    if (fallback) return fallback;
    throw Object.assign(new Error('The Agora RTC token could not be generated.'), {
      code: 'RTC_TOKEN_FAILED', status: 500
    });
  }
  return token;
}

function rtmToken(settings, uid) {
  const mockFallback = function () {
    return mockMode()
      ? mockToken('mock_rtm', [settings.appId, uid, TOKEN_TTL_SECONDS])
      : null;
  };

  if (!RtmTokenBuilder || typeof RtmTokenBuilder.buildToken !== 'function') {
    const fallback = mockFallback();
    if (fallback) return fallback;
    throw Object.assign(new Error('The Agora RTM token builder is unavailable.'), {
      code: 'RTM_TOKEN_UNAVAILABLE', status: 503
    });
  }

  let token = null;
  try {
    token = RtmTokenBuilder.buildToken(
      settings.appId, settings.appCertificate, String(uid), TOKEN_TTL_SECONDS
    );
  } catch (error) {
    token = null;
  }

  /* Empty output is a failed issuance, not a valid token. Never return a 200
     with a null/empty RTM token outside the explicit mock-mode allowance. */
  if (!usableToken(token)) {
    const fallback = mockFallback();
    if (fallback) return fallback;
    throw Object.assign(new Error('The Agora RTM token could not be generated.'), {
      code: 'RTM_TOKEN_FAILED', status: 500
    });
  }
  return token;
}

function issueSessionToken(session, user) {
  const settings = configured();
  if (!settings) {
    throw Object.assign(new Error(
      'Set AGORA_APP_ID and AGORA_APP_CERTIFICATE to issue tokens.'
    ), { code: 'AGORA_NOT_CONFIGURED', status: 503 });
  }
  if (!session || !session.rtc || !session.rtc.channel) {
    throw Object.assign(new Error('This session has no Agora channel.'), {
      code: 'SESSION_CHANNEL_MISSING', status: 409
    });
  }
  if (!networkQuality.bothReady(session)) {
    throw Object.assign(new Error(
      'Both people must pass the connection speed check before the class can start.'
    ), { code: 'NETWORK_BELOW_MINIMUM', status: 409 });
  }

  const channel = String(session.rtc.channel);
  const uid = numericUid(user.id);
  const observer = user.role === 'founder';
  const rtcRole = observer ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const peerId = user.role === 'student' ? session.trainerId : session.studentId;
  const peerUid = numericUid(peerId);
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

  const rtc = rtcToken(settings, channel, uid, rtcRole);
  const rtm = rtmToken(settings, uid);

  return {
    provider: 'agora',
    mode: 'agora',
    appId: settings.appId,
    channelName: channel,
    channel: channel,
    uid: uid,
    peerUid: peerUid,
    token: rtc,
    rtcToken: rtc,
    rtmToken: rtm,
    role: observer ? 'subscriber' : 'publisher',
    observer: observer,
    viewerRole: observer ? 'founder' : (user.role === 'student' ? 'student' : 'trainer'),
    expiresAt: expiresAt,
    expiresInSeconds: TOKEN_TTL_SECONDS
  };
}

module.exports = { TOKEN_TTL_SECONDS, numericUid, issueSessionToken };
