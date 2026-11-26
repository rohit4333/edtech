/* Regression checks for the post-refactor security review: reset-link origins,
   unspoofable rate-limit keys and private recording path validation. */

const assert = require('assert');
const config = require('../config');
const rateLimit = require('../middleware/rateLimit');
const recordingAccess = require('../services/recordingAccessService');

const ORIGIN_KEYS = ['APP_ORIGIN', 'CORS_ORIGIN'];

async function main() {
  const saved = {};
  ORIGIN_KEYS.forEach(function (key) { saved[key] = process.env[key]; });

  try {
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.CORS_ORIGIN = 'https://app.example';
    assert.strictEqual(config.resetOrigin(), 'http://localhost:3000',
      'an explicit local origin wins in development');

    delete process.env.APP_ORIGIN;
    process.env.CORS_ORIGIN = 'https://app.example, https://admin.example';
    assert.strictEqual(config.resetOrigin(), 'https://app.example',
      'the first entry of an allowlist is used without the comma');

    process.env.CORS_ORIGIN = ' https://app.example , https://admin.example ';
    assert.strictEqual(config.resetOrigin(), 'https://app.example',
      'spaces around allowlist entries are trimmed');

    process.env.APP_ORIGIN = 'https://one.example';
    assert.strictEqual(config.resetOrigin(), 'https://one.example',
      'an explicit https origin is preferred');

    delete process.env.APP_ORIGIN;
    process.env.CORS_ORIGIN = '*';
    assert.strictEqual(config.resetOrigin(), '', 'a wildcard is never used for a link');
    delete process.env.CORS_ORIGIN;
    assert.strictEqual(config.resetOrigin(), '', 'no origin produces no link');

    const limit = rateLimit.createLimiter({ name: 'security-test', windowMs: 60000, max: 1 });
    function request(forwarded) {
      return {
        headers: { 'x-forwarded-for': forwarded },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' }
      };
    }
    function response() {
      return {
        statusCode: 200,
        set: function () { return this; },
        status: function (code) { this.statusCode = code; return this; },
        json: function () { return this; }
      };
    }
    limit(request('1.2.3.4'), response(), function () {});
    const blocked = response();
    limit(request('9.9.9.9'), blocked, function () {});
    assert.strictEqual(blocked.statusCode, 429,
      'a spoofed forwarding header cannot reset the rate-limit bucket');

    let code = '';
    try { await recordingAccess.signedUrl('ses_math_001', 'other-session/file.mp4'); }
    catch (error) { code = error.code; }
    assert.strictEqual(code, 'FORBIDDEN', 'a recording outside the session is refused');

    code = '';
    try { await recordingAccess.signedUrl('../outside', 'ses_math_001/file.mp4'); }
    catch (error) { code = error.code; }
    assert.strictEqual(code, 'INVALID_SESSION_ID', 'session ids are validated before signing');

    console.log('securityHardening: origin, limiter and private-path assertions passed');
  } finally {
    ORIGIN_KEYS.forEach(function (key) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
