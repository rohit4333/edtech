/* Regression for the approved login fix: live identity reads are async, and a
   successful legacy-hash login must persist its rehash before responding. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const password = require('../auth/password');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

async function main() {
  const originalFind = db.findUserByEmail;
  const originalUpdate = db.updateUser;
  const user = {
    id: 'usr_async_login',
    name: 'Async Login',
    email: 'async-login@mathify.app',
    role: 'trainer',
    status: 'active',
    passwordHash: password.legacyHash('mathify-demo')
  };

  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function login(passwordValue, forwardedFor) {
    const response = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': forwardedFor
      },
      body: JSON.stringify({ email: user.email, password: passwordValue })
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch (error) { body = text; }
    return { status: response.status, body: body };
  }

  try {
    let stored = Object.assign({}, user);
    let updateCalls = [];
    let findDelay = 0;

    db.findUserByEmail = async function () {
      if (findDelay) await new Promise(function (resolve) { setTimeout(resolve, findDelay); });
      return Object.assign({}, stored);
    };
    db.updateUser = async function (id, updater) {
      updateCalls.push(id);
      stored = Object.assign({}, updater(Object.assign({}, stored)));
      return Object.assign({}, stored);
    };

    /* A paused async lookup proves the route awaited identity resolution. */
    findDelay = 15;
    const success = await login('mathify-demo', '203.0.113.201');
    findDelay = 0;

    ok(success.status === 200 && Boolean(success.body.token),
      'async identity lookup still signs in a valid user');
    ok(updateCalls.length === 1 && updateCalls[0] === user.id,
      'the awaited adapter rehash is persisted exactly once before the response');
    ok(Boolean(stored.passwordSalt) && stored.passwordHash !== user.passwordHash,
      'the legacy hash was replaced by a salted hash');
    ok(password.verifyPassword('mathify-demo', stored).ok === true &&
      password.verifyPassword('mathify-demo', stored).rehash === false,
    'the persisted hash verifies without another rehash');

    updateCalls = [];
    const wrong = await login('wrong-password', '203.0.113.202');
    ok(wrong.status === 401 && wrong.body.error === 'INVALID_CREDENTIALS',
      'a wrong password is still rejected with async identity lookup');
    ok(updateCalls.length === 0, 'a failed login never rehashes or writes the user');

    console.log('asyncLoginRehash: ' + checks + ' assertions passed');
  } finally {
    db.findUserByEmail = originalFind;
    db.updateUser = originalUpdate;
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
