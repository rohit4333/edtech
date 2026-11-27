/* Local LiveKit webhook simulator.
 *
 * Signs a real WebhookEvent-shaped payload with the configured LiveKit API
 * credentials and POSTs it to the local API. No mock bypass: the server must
 * verify the exact JWT + body checksum path used by LiveKit Cloud.
 *
 * Examples:
 *   npm run webhook:test
 *   npm run webhook:test -- --event participant_left
 *   npm run webhook:test -- --tamper
 *   npm run webhook:test -- --unsigned
 *   npm run webhook:test -- --scenario full
 */

require('../config');
const crypto = require('crypto');

function args() {
  const out = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const item = process.argv[index];
    if (!item.startsWith('--')) continue;
    const pair = item.slice(2).split('=');
    out[pair[0]] = pair.length > 1 ? pair.slice(1).join('=') : (process.argv[index + 1] || true);
    if (pair.length === 1) index += 1;
  }
  return out;
}

function apiConfig() {
  const key = String(process.env.LIVEKIT_API_KEY || '').trim();
  const secret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  if (!key || !secret) {
    throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in server/.env');
  }
  return { key: key, secret: secret };
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(body, credentials, tamper) {
  const checksum = crypto.createHash('sha256').update(body).digest('base64');
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: credentials.key,
    sub: 'mathify-webhook-simulator',
    sha256: tamper ? Buffer.from('tampered-checksum').toString('base64') : checksum,
    iat: now,
    nbf: now,
    exp: now + 300
  };
  const unsigned = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode(claims);
  const signature = crypto.createHmac('sha256', credentials.secret)
    .update(unsigned).digest('base64url');
  return unsigned + '.' + signature;
}

function payload(event, sessionId, identity) {
  const base = {
    event: event,
    id: 'evt_sim_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    createdAt: String(Math.floor(Date.now() / 1000)),
    room: { sid: 'RM_sim_' + sessionId, name: 'mathify-' + sessionId }
  };
  if (event.indexOf('participant_') === 0) {
    base.participant = { sid: 'PA_sim_' + identity, identity: identity, name: 'Simulated participant' };
  }
  if (event.indexOf('egress_') === 0) {
    base.egressInfo = { egressId: 'EG_sim_' + sessionId, status: 'EGRESS_STARTED' };
  }
  return base;
}

async function send(options, event, identity, overrides) {
  const credentials = apiConfig();
  const body = JSON.stringify(Object.assign(
    payload(event, options.session, identity),
    overrides || {}
  ));
  const jwt = sign(body, credentials, Boolean(options.tamper));
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!options.unsigned) {
    headers.Authorize = jwt;
    headers.Authorization = jwt;
  }
  const response = await fetch(String(options.base).replace(/\/$/, '') + '/api/webhooks/livekit', {
    method: 'POST',
    headers: headers,
    body: body
  });
  const text = await response.text();
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch (error) { result = { raw: text.slice(0, 80) }; }
  console.log(JSON.stringify({
    event: event,
    identity: identity,
    status: response.status,
    result: result
  }));
  return response.status;
}

async function main() {
  const options = args();
  options.session = options.session || 'ses_math_001';
  options.base = options.base || 'http://127.0.0.1:4000';

  if (options.scenario === 'full') {
    const trainer = options.identity || 'trainer-usr_trainer_001';
    await send(options, 'participant_joined', trainer);
    await send(options, 'participant_joined', trainer);
    await send(options, 'participant_left', trainer);
    await send(Object.assign({}, options, { tamper: true }), 'participant_joined', trainer);
    await send(Object.assign({}, options, { unsigned: true }), 'participant_joined', trainer);
    return;
  }

  const event = options.event || 'participant_joined';
  const identity = options.identity ||
    (event.indexOf('participant_') === 0 ? 'trainer-usr_trainer_001' : 'simulator');
  await send(options, event, identity);
}

main().catch(function (error) {
  console.error('Webhook simulator failed:', error.message);
  process.exitCode = 1;
});
