/* Compatibility seam for the chosen Agora layer. Real tokens are generated
   by services/agoraTokenService.js; this wrapper never fabricates a token. */
const tokenService = require('../services/agoraTokenService');

function issueRtcToken(session, user) {
  try {
    return tokenService.issueSessionToken(session, user);
  } catch (error) {
    return {
      provider: 'agora',
      mode: 'unconfigured',
      channel: session && session.rtc ? session.rtc.channel : null,
      uid: user ? tokenService.numericUid(user.id) : null,
      token: null,
      note: error.message
    };
  }
}

module.exports = { issueRtcToken, numericUid: tokenService.numericUid };
