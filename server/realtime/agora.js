/* Provider seam for the chosen Agora layer.
   Phase 1 returns a demo-shaped token; Phase 2 replaces the body with agora-token. */
const crypto = require('crypto');

function numericUid(userId) {
  return parseInt(crypto.createHash('sha256').update(userId).digest('hex').slice(0, 8), 16) % 1000000000;
}

function issueRtcToken(session, user) {
  const appId = process.env.AGORA_APP_ID;
  const uid = numericUid(user.id);
  const base = {
    provider: 'agora',
    channel: session.rtc.channel,
    uid,
    role: user.role === 'trainer' || user.role === 'founder' ? 'host' : 'audience',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
  };

  if (!appId) {
    return Object.assign({}, base, {
      mode: 'demo',
      appId: 'demo-app-id',
      token: 'demo-token-' + uid,
      note: 'Set AGORA_APP_ID / AGORA_APP_CERTIFICATE and add the agora-token package for a real token.'
    });
  }

  return Object.assign({}, base, {
    mode: 'configured',
    appId,
    token: null,
    note: 'Real token generation is Phase 2.'
  });
}

module.exports = { issueRtcToken };
