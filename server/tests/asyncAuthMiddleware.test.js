/* Live-mode middleware regression: Supabase adapter reads return Promises.
   Identity and session middleware must await them before authorizing. */

const assert = require('assert');
const db = require('../db');
const token = require('../auth/token');
const auth = require('../middleware/auth');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

function response() {
  const capture = { status: 200, body: null, nextCalled: false };
  const res = {
    status(code) { capture.status = code; return this; },
    json(body) { capture.body = body; return this; }
  };
  const next = function () { capture.nextCalled = true; };
  return { res: res, next: next, capture: capture };
}

async function main() {
  const originalFindUser = db.findUserById;
  const originalFindSession = db.findSession;
  const user = { id: 'usr_trainer_async', name: 'Async Trainer', role: 'trainer', status: 'active' };
  const session = { id: 'ses_async', trainerId: user.id, studentId: 'stu_async', status: 'active' };

  try {
    db.findUserById = async function (id) { return id === user.id ? user : null; };
    db.findSession = async function (id) { return id === session.id ? session : null; };

    let call = response();
    await auth.requireAuth({ headers: { authorization: 'Bearer ' + token.sign(user) } }, call.res, call.next);
    ok(call.capture.nextCalled === true, 'async user lookup reaches the next middleware');
    ok(call.capture.status === 200 && Boolean(call.capture.body) === false,
      'async user lookup does not emit an error response');

    call = response();
    await auth.loadSession({ params: { sessionId: session.id }, user: auth.sessionUser(user) }, call.res, call.next);
    ok(call.capture.nextCalled === true, 'async session lookup reaches the next middleware');
    ok(Boolean(call.capture.body) === false, 'async session lookup does not treat a Promise as a session');

    call = response();
    await auth.loadSession({ params: { sessionId: 'ses_missing' }, user: auth.sessionUser(user) }, call.res, call.next);
    ok(call.capture.status === 404 && call.capture.body && call.capture.body.error === 'SESSION_NOT_FOUND',
      'a missing session still fails closed after awaiting the adapter');

    db.findSession = async function () { throw new Error('supabase offline'); };
    call = response();
    await auth.loadSession({ params: { sessionId: session.id }, user: auth.sessionUser(user) }, call.res, call.next);
    ok(call.capture.status === 500 && call.capture.body && call.capture.body.error === 'SESSION_DB_ERROR',
      'live adapter errors become explicit 500 responses instead of unhandled rejections');

    console.log('asyncAuthMiddleware: ' + checks + ' assertions passed');
  } finally {
    db.findUserById = originalFindUser;
    db.findSession = originalFindSession;
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
