/* Live-readiness regression suite.
   Covers the production guard (LiveKit + freelm, not Agora/Cloudflare), salted
   passwords, demo disablement, LiveKit token ownership, webhook fail-closed
   paths, Razorpay order trust, session event scrubbing, score-override
   validation, migration checksum SQL and reviewed static serving. */

const assert = require('assert');
const crypto = require('crypto');
const app = require('../app');
const config = require('../config');
const db = require('../db');
const realtime = require('../realtime');
const password = require('../auth/password');
const migrate = require('../migrate');

/* Every key the production guard touches is snapshotted and restored so this
   suite never leaks a Supabase/LiveKit/freelm value into the next test file. */
const GUARD_ENV_KEYS = [
  'AUTH_SECRET', 'CORS_ORIGIN', 'DATABASE_MODE',
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY',
  'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
  'FREELM_KEYLESS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'TWILIO_AUTH_TOKEN', 'TWILIO_WEBHOOK_URL'
].concat(config.FREELM_PROVIDER_KEYS);

const SAVED_ENV = {};
const ENV_KEYS = [
  'NODE_ENV', 'RECORDING_WEBHOOK_SECRET', 'ENABLE_DEMO_LOGINS',
  'SLACK_WEBHOOK_URL', 'ADMIN_EMAIL', 'NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD'
].concat(GUARD_ENV_KEYS);
ENV_KEYS.forEach(function (key) { SAVED_ENV[key] = process.env[key]; });

function restoreKeys(keys) {
  keys.forEach(function (key) {
    if (SAVED_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED_ENV[key];
  });
}

function restoreEnv() {
  restoreKeys(ENV_KEYS);
}

/* Minimal complete production environment. Each assertion below removes one
   piece to prove the guard fails closed before a provider is contacted. */
function setGuardEnv(overrides) {
  const values = {
    AUTH_SECRET: 'a'.repeat(48),
    CORS_ORIGIN: 'https://mathify.example',
    DATABASE_MODE: 'supabase',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    SUPABASE_SECRET_KEY: 'test-secret-key',
    RAZORPAY_KEY_ID: 'rzp_test',
    RAZORPAY_KEY_SECRET: 'test-razorpay-secret',
    RAZORPAY_WEBHOOK_SECRET: 'test-razorpay-webhook-secret',
    TWILIO_AUTH_TOKEN: 'test-twilio-token',
    TWILIO_WEBHOOK_URL: 'https://mathify.example/whatsapp',
    FREELM_KEYLESS: ''
  };
  config.FREELM_PROVIDER_KEYS.forEach(function (key) { values[key] = ''; });
  Object.keys(overrides || {}).forEach(function (key) { values[key] = overrides[key]; });
  Object.keys(values).forEach(function (key) {
    if (values[key] === undefined || values[key] === null || values[key] === '') {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  });
}

function guardMessageFor(productionConfig) {
  try {
    productionConfig.assertProductionConfig();
    return '';
  } catch (error) {
    return error.message;
  }
}

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  let assertions = 0;
  function check(condition, message) { assert.ok(condition, message); assertions += 1; }

  async function request(method, path, body, token, extraHeaders) {
    const headers = Object.assign({ 'content-type': 'application/json' }, extraHeaders || {});
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (error) { data = text; }
    return { status: response.status, body: data, text: text };
  }

  try {
    /* Never let a test notification reach a real Slack or email channel. */
    ['SLACK_WEBHOOK_URL', 'ADMIN_EMAIL', 'NODEMAILER_EMAIL', 'NODEMAILER_PASSWORD']
      .forEach(function (key) { process.env[key] = ''; });

    /* Production must fail closed before any server starts. */
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SECRET = 'short';
    const configPath = require.resolve('../config');
    delete require.cache[configPath];
    const productionConfig = require('../config');
    let guardMessage = guardMessageFor(productionConfig);
    check(/AUTH_SECRET/.test(guardMessage), 'production guard rejects a weak AUTH_SECRET');
    check(productionConfig.corsOrigins().length === 0, 'production CORS never falls back to *');

    /* LiveKit replaced Agora; freelm replaced Cloudflare Workers AI. */
    check(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].every(function (key) {
      return productionConfig.PRODUCTION_REQUIRED_ENV.indexOf(key) !== -1;
    }), 'production guard requires LiveKit credentials');
    check(!productionConfig.PRODUCTION_REQUIRED_ENV.some(function (key) {
      return /AGORA|CLOUDFLARE|RECORDING_WEBHOOK_SECRET/.test(key);
    }), 'production guard no longer requires Agora or Cloudflare credentials');
    check(productionConfig.FREELM_PROVIDER_KEYS.indexOf('OPENROUTER_API_KEY') !== -1,
      'freelm provider keys are part of the production contract');

    /* Call the already-loaded guard directly. Re-requiring config.js would
       re-run dotenv and silently restore real keys from .env. */
    setGuardEnv();
    check(productionConfig.freelmConfigured() === false,
      'freelm provider detection starts closed with no keys');
    guardMessage = guardMessageFor(productionConfig);
    check(/LIVEKIT_URL/.test(guardMessage), 'production guard requires LIVEKIT_URL');

    /* LiveKit present but no freelm provider still fails. */
    const livekitEnv = {
      LIVEKIT_URL: 'https://mathify.livekit.cloud',
      LIVEKIT_API_KEY: 'test-livekit-key',
      LIVEKIT_API_SECRET: 'test-livekit-secret'
    };
    setGuardEnv(livekitEnv);
    guardMessage = guardMessageFor(productionConfig);
    check(/freelm/.test(guardMessage), 'production guard requires a freelm provider: ' + guardMessage);

    /* LiveKit + one freelm key boots without any Agora or Cloudflare value. */
    setGuardEnv(Object.assign({}, livekitEnv, { OPENROUTER_API_KEY: 'test-provider-key' }));
    guardMessage = guardMessageFor(productionConfig);
    check(guardMessage === '', 'a LiveKit + freelm deployment passes: ' + guardMessage);

    setGuardEnv(Object.assign({}, livekitEnv, { FREELM_KEYLESS: '1' }));
    guardMessage = guardMessageFor(productionConfig);
    check(guardMessage === '', 'an explicit FREELM_KEYLESS opt-in also passes: ' + guardMessage);

    delete require.cache[configPath];
    restoreKeys(GUARD_ENV_KEYS);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    /* Passwords are salted per user, not a shared digest. */
    const first = password.hashPassword('mathify-demo');
    const second = password.hashPassword('mathify-demo');
    check(first.salt !== second.salt && first.hash !== second.hash, 'password salts are unique');
    const saltedUser = { passwordSalt: first.salt, passwordHash: first.hash };
    check(password.verifyPassword('mathify-demo', saltedUser).ok === true, 'salted password verifies');
    check(password.verifyPassword('wrong', saltedUser).ok === false, 'wrong password is rejected');
    check(password.verifyPassword('mathify-demo', {
      passwordHash: password.legacyHash('mathify-demo')
    }).rehash === true, 'legacy hash is upgraded after login');

    const trainerLogin = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'mathify-demo'
    }, null, { 'x-forwarded-for': '203.0.113.80' });
    const studentLogin = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app', password: 'mathify-demo'
    }, null, { 'x-forwarded-for': '203.0.113.81' });
    check(trainerLogin.status === 200 && studentLogin.status === 200, 'demo accounts still sign in locally');
    const trainer = trainerLogin.body.token;
    const student = studentLogin.body.token;
    check(Boolean(trainer && student), 'login returns tokens');

    /* Demo discovery and production-only webhook behaviour. */
    const wasProduction = config.isProduction;
    config.isProduction = true;
    const demoHidden = await request('GET', '/api/auth/demo');
    check(demoHidden.status === 404, 'demo account discovery is disabled in production');
    const recordingMissingSecret = await request('POST', '/api/webhooks/recording', {
      sessionId: 'ses_math_001', url: 'https://example.com/recording.mp4'
    });
    check(recordingMissingSecret.status === 503, 'recording webhook fails closed without a secret');
    const whatsappUnsigned = await request('POST', '/api/webhooks/whatsapp', {
      From: 'whatsapp:+15005550006', Body: 'Hello', MessageSid: 'SM_live_readiness'
    });
    check(whatsappUnsigned.status === 403, 'WhatsApp webhook rejects an unsigned production request');
    config.isProduction = wasProduction;

    /* LiveKit room and identity are derived from the verified session, never
       from the browser's roomName/participantName body fields. */
    const trainerNetwork = await request('POST', '/api/sessions/ses_math_001/network-check', {
      downloadMbps: 40, uploadMbps: 25, latencyMs: 60
    }, trainer);
    const studentNetwork = await request('POST', '/api/sessions/ses_math_001/network-check', {
      downloadMbps: 35, uploadMbps: 20, latencyMs: 75
    }, student);
    check(trainerNetwork.status === 200 && studentNetwork.status === 200,
      'both participants can report a passing connection');
    const trainerRtc = await request('POST', '/api/get-token', {
      sessionId: 'ses_math_001',
      participantName: 'attacker'
    }, trainer);
    check(trainerRtc.status === 200,
      'trainer can obtain a server-signed LiveKit token: ' + trainerRtc.text);
    check(trainerRtc.body.roomName === 'mathify-ses_math_001',
      'room name is derived from the verified session');
    check(trainerRtc.body.identity === 'trainer-usr_trainer_001',
      'trainer identity comes from the verified JWT');
    check(trainerRtc.body.peerIdentity === 'student-usr_student_001',
      'peer identity comes from the session record');
    const studentRtc = await request('POST', '/api/get-token', {
      sessionId: 'ses_math_001'
    }, student);
    check(studentRtc.status === 200,
      'student can obtain a server-signed LiveKit token: ' + studentRtc.text);
    check(studentRtc.body.identity === 'student-usr_student_001',
      'student identity comes from the verified JWT');
    check(studentRtc.body.peerIdentity === 'trainer-usr_trainer_001',
      'peer identity comes from the session record');
    const mismatchedRoom = await request('POST', '/api/get-token', {
      sessionId: 'ses_math_001',
      roomName: 'mathify-other-session'
    }, trainer);
    check(mismatchedRoom.status === 403 && mismatchedRoom.body.error === 'ROOM_MISMATCH',
      'a browser cannot rename the verified LiveKit room');

    /* Session events are scrubbed again, even for an allowed event name. */
    await realtime.publish('ses_math_001', 'page.changed', {
      page: 2,
      answerKey: 'B',
      correctOptionId: 'b',
      trainerNotes: 'keep this hidden',
      hints: ['never send this']
    });
    const events = await request('GET', '/api/sessions/ses_math_001/events?limit=200', undefined, student);
    check(events.status === 200, 'student can read browser-safe session events');
    const scrubbed = events.body.events.filter(function (event) { return event.event === 'page.changed'; }).pop();
    check(Boolean(scrubbed), 'page event is present');
    check(scrubbed.payload.page === 2, 'safe event fields survive scrubbing');
    ['answerKey', 'correctOptionId', 'trainerNotes', 'hints'].forEach(function (key) {
      check(scrubbed.payload[key] === undefined && events.text.indexOf(key) === -1,
        key + ' never reaches the student event stream');
    });

    /* Chat uses the JWT identity and stays inside the session boundary. */
    const chat = await request('POST', '/api/sessions/ses_math_001/chat', {
      text: '  Try  the bar model  first.  ', trainerInstructions: 'secret'
    }, trainer);
    check(chat.status === 201, 'session chat accepts a trainer message');
    check(chat.body.message.from === 'trainer', 'chat sender role comes from the JWT');
    check(chat.body.message.text === 'Try the bar model first.', 'chat text is normalised');
    check(chat.body.message.trainerInstructions === undefined, 'chat payload carries no trainer notes');
    const otherSessionChat = await request('POST', '/api/sessions/ses_other/chat', {
      text: 'hello'
    }, student);
    check(otherSessionChat.status === 404, 'student cannot chat into another session');

    /* Board share is a state-only notification. */
    const boardShare = await request('POST', '/api/sessions/ses_math_001/board/share', {
      shared: true, strokes: 'private-data'
    }, trainer);
    check(boardShare.status === 200 && boardShare.body.shared === true, 'trainer can announce board sharing');
    const boardShareAsStudent = await request('POST', '/api/sessions/ses_math_001/board/share', {
      shared: true
    }, student);
    check(boardShareAsStudent.status === 403, 'student cannot publish trainer board controls');

    /* Parent recap handoff reports delivery honestly. */
    const parentNote = await request('POST', '/api/sessions/ses_math_001/notify-parent', {
      note: 'Worked on equivalent ratios today.'
    }, trainer);
    check(parentNote.status === 200 && parentNote.body.ok === true, 'parent recap endpoint responds');
    check(parentNote.body.delivery.slack.sent === false,
      'unconfigured Slack is reported as not sent, not as delivered');

    /* Razorpay credits only the order the server created. */
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
    const orderId = 'order_live_readiness_' + Date.now();
    const paymentId = 'pay_live_readiness_' + Date.now();
    db.saveRazorpayOrder({
      id: orderId,
      studentId: 'usr_student_001',
      packId: 'monthly_12',
      sessions: 12,
      amount: 54000,
      currency: 'SAR',
      receipt: 'receipt_live_readiness',
      status: 'created',
      createdAt: new Date().toISOString()
    });
    const capturedEvent = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 54000,
            currency: 'SAR',
            status: 'captured',
            notes: { studentId: 'usr_trainer_001', sessions: '999' }
          }
        }
      }
    };
    const rawBody = JSON.stringify(capturedEvent);
    const signature = crypto.createHmac('sha256', 'test-webhook-secret').update(rawBody).digest('hex');
    const credited = await request('POST', '/api/razorpay/webhook', capturedEvent, null, {
      'x-razorpay-signature': signature,
      'content-type': 'application/json'
    });
    check(credited.status === 200 && credited.body.credited === true, 'captured payment credits the saved order');
    check(credited.body.studentId === 'usr_student_001', 'payment notes cannot redirect the credit');
    check(credited.body.sessionsAdded === 12, 'payment notes cannot change the session count');
    const replay = await request('POST', '/api/razorpay/webhook', capturedEvent, null, {
      'x-razorpay-signature': signature
    });
    check(replay.body.reason === 'ALREADY_CREDITED', 'webhook replay is ignored');
    const unsigned = await request('POST', '/api/razorpay/webhook', capturedEvent);
    check(unsigned.status === 401, 'unsigned Razorpay webhook is rejected');

    /* Score overrides are bounded and audited. */
    const badScore = await request('POST', '/api/sessions/ses_math_001/end', {
      currentQuizScore: 150, force: true
    }, trainer);
    check(badScore.status === 400 && badScore.body.error === 'INVALID_SCORE',
      'out-of-range score override is rejected');
    const stringScore = await request('POST', '/api/sessions/ses_math_001/end', {
      currentQuizScore: '80', force: true
    }, trainer);
    check(stringScore.status === 400, 'string score override is rejected');

    /* Contact form has a real, validated API route behind it. */
    const contactOk = await request('POST', '/api/contact', {
      name: 'Test Parent', email: 'parent@example.com', phone: '+1 555 0100', message: 'Book a demo.'
    });
    check(contactOk.status === 201 && contactOk.body.ok === true, 'booking request is accepted');
    check(typeof contactOk.body.reference === 'string', 'booking request returns a reference');
    const contactBad = await request('POST', '/api/contact', {
      name: 'Test Parent', email: 'not-an-email', message: 'Book a demo.'
    });
    check(contactBad.status === 400, 'invalid booking email is rejected');

    /* Reviewed static surfaces only; no source, migrations, env or git. */
    const contactPage = await request('GET', '/contact.html');
    check(contactPage.status === 200 && contactPage.text.indexOf('id="bookingForm"') !== -1,
      'booking form is served from the same origin');
    const sharedScript = await request('GET', '/shared/contact-form.js');
    check(sharedScript.status === 200, 'contact form client is served');
    for (const blocked of ['/server/config.js', '/server/.env', '/.git/config', '/server/migrations/0001_baseline.sql']) {
      const result = await request('GET', blocked);
      check(result.status === 404, blocked + ' is not exposed');
    }

    /* Migration SQL is wrapped in one transaction with checksum drift guards. */
    const migrations = migrate.discover();
    check(migrations.length >= 2, 'reviewed migrations are discovered');
    migrations.forEach(function (migration) {
      check(migration.sql.indexOf('$mathify$') === -1, migration.name + ' does not collide with the wrapper tag');
      check(/^\d{4}_[a-z0-9_]+\.sql$/i.test(migration.name), migration.name + ' follows the naming contract');
    });
    const sql = migrate.buildSql(migrations);
    check(sql.indexOf('\\set ON_ERROR_STOP on') !== -1, 'migration SQL stops on the first error');
    check(sql.indexOf('begin;') === 0 + sql.indexOf('begin;'), 'transaction starts');
    check(sql.indexOf('commit;') !== -1, 'transaction commits');
    check((sql.match(/do \$mathify\$ begin/g) || []).length === migrations.length,
      'each migration is wrapped in a checked block');
    check((sql.match(/Migration checksum changed/g) || []).length === migrations.length,
      'each migration has a checksum drift guard');
    check(sql.indexOf('do $$') !== -1, 'nested baseline SQL blocks remain intact');
  } finally {
    restoreEnv();
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('liveReadiness: ' + assertions + ' assertions passed');
}

main().catch(function (error) {
  console.error('liveReadiness: FAILED');
  console.error(error);
  process.exitCode = 1;
});
