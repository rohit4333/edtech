/* Real credential sign-in contract. The browser page stores a server-signed
   token; the API alone decides which desk that token may reach. */

const assert = require('assert');
const app = require('../app');

let checks = 0;
function ok(value, label) {
  assert.ok(value, label);
  checks += 1;
}

async function main() {
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(method, route, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(base + route, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (error) { data = text; }
    return { status: response.status, body: data };
  }

  try {
    const trainer = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'mathify-demo'
    });
    ok(trainer.status === 200, 'valid trainer credentials are accepted');
    ok(Boolean(trainer.body.token), 'a signed token is returned');
    assert.deepStrictEqual(Object.keys(trainer.body.user).sort(), ['id', 'name', 'role']);
    checks += 1;
    ok(trainer.body.user.role === 'trainer', 'the token identity carries the verified role');
    ok(!/mobile|phone|address|aadhaar|pan\b|bank/i.test(JSON.stringify(trainer.body.user)),
      'login identity carries no private profile or KYC fields');

    const me = await request('GET', '/api/auth/me', undefined, trainer.body.token);
    ok(me.status === 200 && me.body.user.role === 'trainer',
      'the signed token is accepted on a protected read');

    const wrong = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'not-the-password'
    });
    ok(wrong.status === 401 && wrong.body.error === 'INVALID_CREDENTIALS',
      'a wrong password is rejected');

    const student = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app', password: 'mathify-demo'
    });
    ok(student.status === 200 && student.body.user.role === 'student',
      'student credentials are accepted in the same endpoint');

    const sharedParent = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app', password: 'mathify-demo', role: 'parent'
    });
    ok(sharedParent.status === 200 && sharedParent.body.user.role === 'parent',
      'the shared family credential opens the parent desk when that app was opened');
    const parentMe = await request('GET', '/api/auth/me', undefined, sharedParent.body.token);
    ok(parentMe.status === 200 && parentMe.body.user.role === 'parent',
      'the issued parent token is verified as parent on a protected read');

    const sharedStudent = await request('POST', '/api/auth/login', {
      email: 'parent@mathify.app', password: 'mathify-demo', role: 'student'
    });
    ok(sharedStudent.status === 200 && sharedStudent.body.user.role === 'student',
      'the parent alias also opens the student desk when that app was opened');

    /* Post-login view switching only honours the verified shared pair. It
       mints an access token, never a refresh token or a stronger role claim. */
    const parentView = await request('POST', '/api/auth/view', {
      view: 'parent'
    }, student.body.token);
    ok(parentView.status === 200 && parentView.body.user.role === 'parent' &&
      Boolean(parentView.body.token) && parentView.body.refreshToken === undefined,
    'the kid view can open the parent view with a short-lived access token');
    const parentViewMe = await request('GET', '/api/auth/me', undefined, parentView.body.token);
    ok(parentViewMe.status === 200 && parentViewMe.body.user.role === 'parent',
      'the minted parent view token is verified on a protected read');
    const kidView = await request('POST', '/api/auth/view', {
      view: 'student'
    }, sharedParent.body.token);
    ok(kidView.status === 200 && kidView.body.user.role === 'student' &&
      Boolean(kidView.body.token),
    'the parent view can open the kid view for the same family credential');
    const viewEscalation = await request('POST', '/api/auth/view', {
      view: 'founder'
    }, trainer.body.token);
    ok(viewEscalation.status === 403 && viewEscalation.body.error === 'ROLE_DENIED',
      'a verified trainer cannot switch to the founder view after login');
    const managerEscalation = await request('POST', '/api/auth/view', {
      view: 'relationship_manager'
    }, student.body.token);
    ok(managerEscalation.status === 403 && managerEscalation.body.error === 'ROLE_DENIED',
      'a family credential cannot switch to the manager view after login');
    assert.deepStrictEqual(Object.keys(parentView.body.user).sort(), ['id', 'name', 'role']);
    checks += 1;

    const roleEscalation = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: 'mathify-demo', role: 'founder'
    });
    ok(roleEscalation.status === 403 && roleEscalation.body.error === 'ROLE_DENIED',
      'a role hint cannot turn another account into a different desk');

    const denied = await request('GET', '/api/trainer/dashboard', undefined, student.body.token);
    ok(denied.status === 403,
      'opening a trainer URL with a student token does not grant trainer access');

    const anonymous = await request('GET', '/api/student/dashboard');
    ok(anonymous.status === 401,
      'a dashboard without a token requires sign-in');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('credentialLogin: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
