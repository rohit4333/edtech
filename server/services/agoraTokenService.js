/* Server-owned Agora identity and tokens. Channel, uid and peer identity are
   derived from the session + verified role; browser input is never trusted. */
const crypto = require('crypto');
const { RtcTokenBuilder, RtmTokenBuilder, RtcRole } = require('agora-token');
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

function rtmToken(appId, appCertificate, uid) {
  if (!RtmTokenBuilder || typeof RtmTokenBuilder.buildToken !== 'function') return null;
  try {
    return RtmTokenBuilder.buildToken(appId, appCertificate, String(uid), TOKEN_TTL_SECONDS);
  } catch (error) {
    return null;
  }
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
  const peerId = user.role === 'student' ? session.trainerId : session.studentId;
  const peerUid = numericUid(peerId);
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      settings.appId,
      settings.appCertificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      TOKEN_TTL_SECONDS,
      TOKEN_TTL_SECONDS
    );
    return {
      provider: 'agora',
      mode: 'agora',
      appId: settings.appId,
      channelName: channel,
      channel,
      uid,
      peerUid,
      token: token,
      rtcToken: token,
      rtmToken: rtmToken(settings.appId, settings.appCertificate, uid),
      role: 'publisher',
      viewerRole: user.role === 'student' ? 'student' : 'trainer',
      expiresAt,
      expiresInSeconds: TOKEN_TTL_SECONDS
    };
  } catch (error) {
    throw Object.assign(new Error('The Agora token could not be generated.'), {
      code: 'TOKEN_GENERATION_FAILED', status: 500
    });
  }
}

module.exports = { TOKEN_TTL_SECONDS, numericUid, issueSessionToken };
