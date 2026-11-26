/* LiveKit Egress fail-closed contract. No provider is contacted in mock tests;
   missing storage is reported honestly instead of claiming a recording exists. */

const assert = require('assert');
const egress = require('../services/livekitEgressService');

const KEYS = [
  'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
  'LIVEKIT_EGRESS_BUCKET', 'LIVEKIT_EGRESS_ACCESS_KEY',
  'LIVEKIT_EGRESS_SECRET_KEY', 'LIVEKIT_EGRESS_REGION'
];

async function main() {
  const saved = {};
  KEYS.forEach(function (key) {
    saved[key] = process.env[key];
    delete process.env[key];
  });

  try {
    assert.strictEqual(egress.configured(), false, 'egress is not configured without credentials');

    const key = egress.objectKey('ses_math_001', '2026-11-27T10:20:30.000Z');
    assert.ok(key.indexOf('ses_math_001/') === 0,
      'the storage RLS path starts with the session id: ' + key);
    assert.ok(/\.mp4$/.test(key), 'egress output is an mp4 object');

    assert.strictEqual(await egress.stopSessionRecording('ses_math_001'), null,
      'no active recording means nothing to stop');

    let code = '';
    try { await egress.startRecording({ sessionId: 'ses_math_001' }); }
    catch (error) { code = error.code; }
    assert.strictEqual(code, 'RECORDING_NOT_CONFIGURED', 'start fails closed without storage');

    code = '';
    try { await egress.startRecording({ sessionId: '../outside' }); }
    catch (error) { code = error.code; }
    assert.strictEqual(code, 'INVALID_SESSION_ID', 'session ids are validated before any provider call');

    code = '';
    try { await egress.stopRecording({ recordingId: 'rec_missing' }); }
    catch (error) { code = error.code; }
    assert.strictEqual(code, 'RECORDING_NOT_FOUND', 'an unknown recording is refused');

    console.log('livekitEgress: fail-closed assertions passed');
  } finally {
    KEYS.forEach(function (key) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
