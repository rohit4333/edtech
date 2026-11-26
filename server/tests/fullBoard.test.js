/* Full-screen teaching whiteboard contract. The planner stays private; only
   the trainer may place ink or pasted screenshots on the shared board. Every
   stroke and image is session-scoped and carries no answer key or trainer note. */

const assert = require('assert');
const app = require('../app');

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

const SESSION = 'ses_math_001';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9a4AAAAABJRU5ErkJggg==';

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
    return { status: response.status, body: data, text: text };
  }

  async function login(email) {
    const result = await request('POST', '/api/auth/login', {
      email: email, password: 'mathify-demo'
    });
    ok(result.status === 200, email + ' signs in for the board test');
    return result.body.token;
  }

  async function latestSeq(token) {
    const result = await request('GET', '/api/sessions/' + SESSION + '/events?since=0',
      undefined, token);
    ok(result.status === 200, 'session events are readable by a participant');
    return (result.body.events || []).reduce(function (max, event) {
      return Math.max(max, Number(event.seq) || 0);
    }, 0);
  }

  try {
    const trainer = await login('trainer@mathify.app');
    const student = await login('student@mathify.app');
    const since = await latestSeq(trainer);

    const studentWrite = await request('POST', '/api/sessions/' + SESSION + '/board/ink', {
      type: 'clear', page: 1
    }, student);
    ok(studentWrite.status === 403, 'a student cannot write to the teaching board');

    const stroke = await request('POST', '/api/sessions/' + SESSION + '/board/ink', {
      type: 'stroke',
      page: 1,
      ink: { tool: 'marker', color: 'coral', points: [[0.1, 0.2], [0.7, 0.8]] }
    }, trainer);
    ok(stroke.status === 200, 'trainer ink is accepted');

    const badImage = await request('POST', '/api/sessions/' + SESSION + '/board/ink', {
      type: 'image', image: { data: 'data:text/html;base64,PHNjcmlwdD4=' }
    }, trainer);
    ok(badImage.status === 422 && badImage.body.error === 'INVALID_IMAGE',
      'non-raster pasted content is rejected');

    const image = await request('POST', '/api/sessions/' + SESSION + '/board/ink', {
      type: 'image',
      page: 1,
      image: { id: 'planner_question_1', data: PNG, x: 0.2, y: 0.1, w: 0.6, h: 0.5 }
    }, trainer);
    ok(image.status === 200, 'a pasted planner screenshot is accepted');

    const snapshot = await request('POST', '/api/sessions/' + SESSION + '/board/ink', {
      type: 'snapshot',
      page: 1,
      items: [
        { kind: 'stroke', ink: { tool: 'pen', color: 'ink', points: [[0, 0], [1, 1]] } },
        { kind: 'image', image: { id: 'practice_1', data: PNG, x: 0, y: 0, w: 1, h: 1 } }
      ]
    }, trainer);
    ok(snapshot.status === 200, 'a board snapshot keeps strokes and images together');

    const events = await request('GET', '/api/sessions/' + SESSION + '/events?since=' + since,
      undefined, student);
    ok(events.status === 200, 'student reads the scrubbed session event stream');
    const ink = (events.body.events || []).filter(function (event) {
      return event.event === 'board.ink';
    });
    ok(ink.length >= 3, 'each board action appears as a session-scoped event');

    const pasted = ink.find(function (event) {
      return event.payload && event.payload.type === 'image' &&
        event.payload.image && event.payload.image.id === 'planner_question_1';
    });
    ok(pasted && pasted.payload.image.data === PNG,
      'the student receives only the pasted image the trainer chose to share');
    const restored = ink.find(function (event) {
      return event.payload && event.payload.type === 'snapshot';
    });
    ok(restored && restored.payload.items && restored.payload.items.length === 2,
      'a returning student can restore the board from one snapshot');
    ok(restored && restored.payload.items.some(function (item) { return item.kind === 'image'; }),
      'the snapshot keeps pasted screenshots in order with ink');

    const safeKeys = restored.payload.items.every(function (item) {
      const keys = Object.keys(item).concat(Object.keys(item.ink || item.image || {}));
      return keys.every(function (key) {
        return !/answer|correct|hint|explain|trainer|instruction|misconception/i.test(key);
      });
    });
    ok(safeKeys, 'board payload keys never include correctness or hidden trainer fields');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('fullBoard: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
