/* Authorized, short-lived links to private session recordings.
 * The session membership check runs before any link is minted. */

const express = require('express');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const recordings = require('../services/recordingAccessService');

const router = express.Router();
const throttle = rateLimit.createLimiter({
  name: 'recording-access', windowMs: 60000, max: 30
});
router.use(throttle);
router.use(auth.requireAuth);

router.get('/:sessionId/url', auth.loadSession, async function (req, res) {
  try {
    const recording = req.sessionRecord && req.sessionRecord.recording;
    if (!recording || !recording.objectKey || recording.status !== 'stopped') {
      return res.status(404).json({
        error: 'RECORDING_NOT_READY',
        message: 'No finished private recording is available for this session.'
      });
    }
    const link = await recordings.signedUrl(
      req.params.sessionId, recording.objectKey, req.query.expiresIn
    );
    return res.json(link);
  } catch (error) {
    const status = error && error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({
      error: (error && error.code) || 'RECORDING_ACCESS_FAILED',
      message: status < 500 && error && error.message
        ? error.message
        : 'A private recording link could not be created.'
    });
  }
});

module.exports = router;
