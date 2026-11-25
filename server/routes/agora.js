/* Agora RTC + RTM token route. The App Certificate stays on the server. */
const express = require('express');
const { RtcTokenBuilder, RtmTokenBuilder, RtcRole } = require('agora-token');
const auth = require('../middleware/auth');
const recordingService = require('../services/agoraRecordingService');

const router = express.Router();
const TOKEN_TTL_SECONDS = 3600;

function rtmToken(appId, appCertificate, uid) {
  if (!RtmTokenBuilder || typeof RtmTokenBuilder.buildToken !== 'function') return null;
  try {
    return RtmTokenBuilder.buildToken(appId, appCertificate, String(uid), TOKEN_TTL_SECONDS);
  } catch (error) {
    return null;
  }
}

router.get('/token', auth.requireAuth, function (req, res) {
  const appId = String(process.env.AGORA_APP_ID || '').trim();
  const appCertificate = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
  const channelName = String(req.query.channelName || '').trim();
  const uid = Number(req.query.uid);

  if (!channelName) {
    return res.status(400).json({
      error: 'MISSING_CHANNEL',
      message: 'channelName is required.'
    });
  }

  if (!Number.isInteger(uid) || uid < 0 || uid > 4294967295) {
    return res.status(400).json({
      error: 'INVALID_UID',
      message: 'uid must be an integer between 0 and 4294967295.'
    });
  }

  if (!appId || !appCertificate) {
    return res.status(503).json({
      error: 'AGORA_NOT_CONFIGURED',
      message: 'Set AGORA_APP_ID and AGORA_APP_CERTIFICATE to issue tokens.'
    });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      TOKEN_TTL_SECONDS,
      TOKEN_TTL_SECONDS
    );

    return res.json({
      token,
      rtcToken: token,
      rtmToken: rtmToken(appId, appCertificate, uid),
      appId,
      channelName,
      uid,
      role: 'publisher',
      expiresAt,
      expiresInSeconds: TOKEN_TTL_SECONDS
    });
  } catch (error) {
    return res.status(500).json({
      error: 'TOKEN_GENERATION_FAILED',
      message: 'The Agora token could not be generated.'
    });
  }
});

router.post('/recording/start', auth.requireAuth, async function (req, res) {
  try {
    const recording = await recordingService.startRecording(req.body || {});
    return res.json({ recording: recording });
  } catch (error) {
    const status = error.code === 'INVALID_PAYLOAD' ? 400 : 502;
    return res.status(status).json({
      error: error.code || 'RECORDING_START_FAILED',
      message: error.message
    });
  }
});

router.post('/recording/stop', auth.requireAuth, async function (req, res) {
  try {
    const recording = await recordingService.stopRecording(req.body || {});
    return res.json({ recording: recording });
  } catch (error) {
    const status = error.code === 'RECORDING_NOT_FOUND' ? 404 : 502;
    return res.status(status).json({
      error: error.code || 'RECORDING_STOP_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
