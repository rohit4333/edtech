/* Full-screen teaching whiteboard contract. The planner stays private; only
   the trainer may place ink or pasted screenshots on the shared board. Every
   stroke and image is session-scoped and carries no answer key or trainer note. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

    const shape = await request('POST', '/api/sessions/' + SESSION + '/board/ink', {
      type: 'stroke', page: 1,
      ink: { tool: 'circle', shape: 'circle', color: 'blue', points: [[0.2, 0.2], [0.8, 0.8]], note: 'hidden answer' }
    }, trainer);
    ok(shape.status === 200, 'maths shapes are accepted on the shared board');

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
    ok(ink.length >= 4, 'each board action appears as a session-scoped event');

    const shaped = ink.find(function (event) {
      return event.payload && event.payload.ink && event.payload.ink.tool === 'circle';
    });
    ok(shaped && shaped.payload.ink.shape === 'circle' && shaped.payload.ink.color === 'blue',
      'the maths shape and fifth colour reach the student');
    ok(shaped && !/note|answer|hint/i.test(JSON.stringify(shaped.payload.ink)),
      'shape ink drops hidden note fields');

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

    /* The visible pointer is a live cue, not durable ink. It is staff-written,
       readable by the child, bounded to normalised coordinates, and separated
       from the event stream so it cannot evict the class warning. */
    const cursorPath = '/api/sessions/' + SESSION + '/cursor';
    const cursorDenied = await request('POST', cursorPath,
      { surface: 'board', x: 0.4, y: 0.4 }, student);
    ok(cursorDenied.status === 403, 'a student cannot publish a trainer pointer');

    const badSurface = await request('POST', cursorPath,
      { surface: 'planner-notes', x: 0.4, y: 0.4 }, trainer);
    ok(badSurface.status === 422 && badSurface.body.error === 'INVALID_CURSOR',
      'only allowlisted teaching surfaces publish a pointer');

    const moved = await request('POST', cursorPath,
      { surface: 'board', x: 0.42, y: 0.31, active: true }, trainer);
    ok(moved.status === 200 && Number(moved.body.cursor.seq) > 0,
      'the trainer pointer publishes a monotonic position');

    const childView = await request('GET', cursorPath + '?since=0', undefined, student);
    ok(childView.status === 200 && childView.body.cursor &&
      childView.body.cursor.surface === 'board' &&
      childView.body.cursor.x === 0.42 && childView.body.cursor.y === 0.31,
    'the child sees the trainer pointer on the shared board');

    const hidden = await request('POST', cursorPath,
      { surface: 'sketch', x: 0.2, y: 0.7, active: false }, trainer);
    ok(hidden.status === 200 && Number(hidden.body.cursor.seq) > moved.body.cursor.seq,
      'leaving a surface publishes a newer hide cue');

    const concealed = await request('GET',
      cursorPath + '?since=' + moved.body.cursor.seq, undefined, student);
    ok(concealed.body.cursor && concealed.body.cursor.active === false &&
      concealed.body.cursor.surface === 'sketch',
    'the child hides the pointer when the trainer leaves the sketch');

    const stale = await request('GET',
      cursorPath + '?since=' + concealed.body.cursor.seq, undefined, student);
    ok(stale.status === 200 && stale.body.cursor === null,
      'an unchanged pointer is not replayed to the child');

    const cursorKeys = Object.keys(concealed.body.cursor);
    ok(cursorKeys.every(function (key) {
      return !/answer|correct|hint|explain|trainer|note|instruction/i.test(key);
    }), 'the pointer payload carries no hidden teaching fields');

    const eventsAfterCursor = await request('GET',
      '/api/sessions/' + SESSION + '/events?since=' + since, undefined, student);
    ok((eventsAfterCursor.body.events || []).every(function (event) {
      return event.event !== 'cursor.moved';
    }), 'pointer moves never enter the durable session event stream');

    const root = path.resolve(__dirname, '..', '..');
    const readAsset = function (relative) {
      return fs.readFileSync(path.join(root, relative), 'utf8');
    };
    const tokens = readAsset('shared/tokens.css');
    const room = readAsset('classroom/room.css');
    const fullBoardCss = readAsset('shared/fullBoard.css');
    const classroom = readAsset('classroom/index.html');
    ok(tokens.indexOf('--ink-cross:') !== -1 &&
      room.indexOf('cursor:var(--ink-cross,crosshair)') !== -1 &&
      room.indexOf('cursor:none') === -1 &&
      fullBoardCss.indexOf('cursor:var(--ink-cross,crosshair)') !== -1,
    'every board surface keeps a black cross pointer, including eraser mode');
    ok(classroom.indexOf('shared/cursorRelay.js') !== -1 &&
      classroom.indexOf('shared/cursorSetup.js') !== -1,
    'the pointer relay is loaded on the verified classroom page');

    const fullBoardJs = readAsset('shared/fullBoard.js');
    ok(/\.full-board-tools\{[^}]*left:16px[^}]*flex-direction:column/.test(fullBoardCss) &&
      /\.full-board \.full-board-canvas-wrap\{[^}]*inset:0/.test(fullBoardCss),
    'the canvas fills the viewport while the tools dock vertically on the left');
    ok(fullBoardCss.indexOf('body.board-open .top{') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .brand') !== -1 &&
      fullBoardCss.indexOf('body.board-open .call-pip') !== -1 &&
      fullBoardCss.indexOf('body.board-open .engagement-bar') !== -1,
    'session links, camera and reactions float above the board for both roles');
    const topStart = classroom.indexOf('<header class="top">');
    const topEnd = classroom.indexOf('</header>', topStart);
    const upperDeck = classroom.slice(topStart, topEnd);
    ok(classroom.indexOf('id="fullBoardToolHandle"') !== -1 &&
      upperDeck.indexOf('id="fullBoardShare"') !== -1 &&
      upperDeck.indexOf('id="fullBoardFullscreen"') !== -1 &&
      upperDeck.indexOf('aria-label="Close whiteboard"') !== -1,
    'share and close are icon-only controls in the upper deck');
    ok(fullBoardCss.indexOf('body.board-open .top .back') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .full-board-toggle') !== -1,
    'the redundant back and board-toggle links are hidden on the board');
    ['line', 'arrow', 'rectangle', 'circle', 'triangle'].forEach(function (shape) {
      ok(classroom.indexOf('data-board-tool="' + shape + '"') !== -1,
        'the maths board offers a ' + shape + ' tool');
    });
    ['ink', 'coral', 'teal', 'amber', 'blue'].forEach(function (color) {
      ok(classroom.indexOf('data-board-color="' + color + '"') !== -1,
        'the maths board offers the ' + color + ' ink');
    });
    ok(classroom.indexOf('id="fullBoardRedo"') !== -1 &&
      fullBoardJs.indexOf('redoStack') !== -1,
    'undo and redo are icon-only board controls');
    ok(fullBoardJs.indexOf("overlay.querySelector('.full-board-tools')") !== -1 &&
      fullBoardJs.indexOf('paletteDrag') !== -1 &&
      fullBoardJs.indexOf("classList.add('is-dragging')") !== -1,
    'the trainer can drag the floating tool palette');
    ok(fullBoardJs.indexOf("document.body.classList.add('board-open')") !== -1 &&
      fullBoardJs.indexOf("document.body.classList.remove('board-open')") !== -1,
    'opening and closing the board toggles the clean session layout');
    ok(fullBoardJs.indexOf("if (!document.fullscreenElement && !overlay.hidden) close();") !== -1,
    'native full-screen exit closes the board for trainer and student');
    ok(fullBoardJs.indexOf("classList.toggle('docked'") === -1 &&
      fullBoardJs.indexOf('teach-mode') === -1,
    'the board never falls back to a docked dashboard panel');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('fullBoard: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
