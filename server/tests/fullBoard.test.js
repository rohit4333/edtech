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
      ink: { tool: 'highlighter', color: 'violet', weight: 'bold', points: [[0.1, 0.2], [0.7, 0.8]] }
    }, trainer);
    ok(stroke.status === 200, 'trainer ink is accepted');

    const shape = await request('POST', '/api/sessions/' + SESSION + '/board/ink', {
      type: 'stroke', page: 1,
      ink: { tool: 'star', color: 'blue', weight: 'thin', points: [[0.2, 0.2], [0.8, 0.8]], note: 'hidden answer' }
    }, trainer);
    ok(shape.status === 200, 'every grouped maths shape is accepted on the shared board');

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

    const thick = ink.find(function (event) {
      return event.payload && event.payload.ink && event.payload.ink.tool === 'highlighter';
    });
    ok(thick && thick.payload.ink.color === 'violet' && thick.payload.ink.weight === 'bold',
      'the expanded colour palette and stroke thickness reach the student');
    const shaped = ink.find(function (event) {
      return event.payload && event.payload.ink && event.payload.ink.tool === 'star';
    });
    ok(shaped && shaped.payload.ink.shape === 'star' && shaped.payload.ink.color === 'blue' &&
      shaped.payload.ink.weight === 'thin',
    'the grouped maths shape, colour and thin weight reach the student');
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
    const callCss = readAsset('classroom/call.css');
    const classroom = readAsset('classroom/index.html');
    const classroomApp = readAsset('classroom/app.js');
    const sessionJs = readAsset('classroom/session.js');
    ok(tokens.indexOf('--ink-cross:') !== -1 &&
      room.indexOf('cursor:var(--ink-cross,crosshair)') !== -1 &&
      room.indexOf('cursor:none') === -1 &&
      fullBoardCss.indexOf('cursor:var(--ink-cross,crosshair)') !== -1,
    'every board surface keeps a black cross pointer, including eraser mode');
    ok(classroom.indexOf('shared/cursorRelay.js') !== -1 &&
      classroom.indexOf('shared/cursorSetup.js') !== -1,
    'the pointer relay is loaded on the verified classroom page');

    const fullBoardJs = readAsset('shared/fullBoard.js');
    ok(/\.full-board-tools\.dock-top\{[^}]*top:16px[^}]*flex-direction:row/.test(fullBoardCss) &&
      /\.full-board-tools\.dock-left\{[^}]*left:16px[^}]*flex-direction:column/.test(fullBoardCss) &&
      /\.full-board \.full-board-canvas-wrap\{[^}]*inset:0/.test(fullBoardCss),
    'the canvas fills the viewport while the tools dock horizontally at the top by default');
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
      upperDeck.indexOf('aria-label="Close whiteboard"') !== -1 &&
      upperDeck.indexOf('class="board-top-rule board-only"') !== -1 &&
      upperDeck.indexOf('class="board-action-label">Share<') !== -1 &&
      upperDeck.indexOf('class="board-action-label">Close<') !== -1 &&
      upperDeck.indexOf('class="board-action-label">End<') !== -1,
    'share, close and end are grouped, clearly labelled desk controls');
    ok(fullBoardCss.indexOf('body.board-open .top #callJoinBtn') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .invite') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top #endBtn') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-top-rule{display:none !important}') !== -1,
    'call, session pack, end and dividers disappear from the full-screen board');
    ok(fullBoardCss.indexOf('.top .btn svg,\n.top .full-board-toggle svg{display:none}') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-action-label') !== -1,
    'the session desk keeps readable labels while the board uses compact labels');
    ok(fullBoardCss.indexOf('body.board-open .top .back') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .full-board-toggle') !== -1,
    'the redundant back and board-toggle links are hidden on the board');
    ok(/function close\(\)[\s\S]{0,360}if \(trainer && sharing\) setSharing\(false, false\)/.test(fullBoardJs),
      'closing the board stops sharing so the student desk returns');
    [
      'line', 'arrow', 'rectangle', 'circle', 'triangle', 'square',
      'diamond', 'pentagon', 'hexagon', 'star', 'parallelogram',
      'double-arrow', 'dashed', 'dotted'
    ].forEach(function (shape) {
      ok(classroom.indexOf('data-board-tool="' + shape + '"') !== -1,
        'the maths board offers a ' + shape + ' tool');
    });
    ok(classroom.indexOf('data-tool-group="shapes"') !== -1 &&
      classroom.indexOf('data-group-menu="shapes"') !== -1 &&
      classroom.indexOf('data-tool-group="lines"') !== -1 &&
      classroom.indexOf('data-group-menu="lines"') !== -1 &&
      fullBoardJs.indexOf('function closeToolGroups') !== -1,
    'shapes and lines live behind two expandable tool icons');
    ok(classroom.indexOf('data-board-tool="highlighter"') !== -1 &&
      classroom.indexOf('data-board-tool="laser"') !== -1 &&
      classroom.indexOf('data-board-tool="marker"') === -1 &&
      fullBoardJs.indexOf('function drawLaser') !== -1 &&
      fullBoardJs.indexOf('var laserItems') !== -1 &&
      fullBoardJs.indexOf("active.tool === 'laser'") !== -1 &&
      fullBoardJs.indexOf('var fadeEdge = 1 - remaining') !== -1 &&
      fullBoardJs.indexOf('(t - fadeEdge)') !== -1 &&
      fullBoardJs.indexOf('for (var i = 0; i < last; i += 1)') !== -1,
    'the marker is replaced by a highlighter and a laser pen that fades from the tail');
    ok(fullBoardCss.indexOf('body.board-open .top{') !== -1 &&
      fullBoardCss.indexOf('bottom:12px;left:auto;z-index:215') !== -1 &&
      fullBoardCss.indexOf('.full-board-tools.dock-top{') !== -1 &&
      fullBoardCss.indexOf('.full-board-tools.dock-left{') !== -1 &&
      fullBoardCss.indexOf('dock-right') === -1 &&
      fullBoardCss.indexOf('dock-bottom') === -1 &&
      fullBoardCss.indexOf('bottom:76px;z-index:225') !== -1,
    'board controls sit lower-right and the palette docks only at top or left');
    [
      'ink', 'coral', 'teal', 'amber', 'blue', 'violet',
      'green', 'pink', 'orange', 'slate'
    ].forEach(function (color) {
      ok(classroom.indexOf('data-board-color="' + color + '"') !== -1,
        'the maths board offers the ' + color + ' ink');
    });
    ok(classroom.indexOf('id="fullBoardInkPanel"') !== -1 &&
      classroom.indexOf('data-board-weight="thin"') !== -1 &&
      classroom.indexOf('data-board-weight="normal"') !== -1 &&
      classroom.indexOf('data-board-weight="bold"') !== -1 &&
      fullBoardJs.indexOf('INK_TOOLS') !== -1 &&
      fullBoardJs.indexOf('inkPanel.hidden') !== -1 &&
      fullBoardJs.indexOf('WEIGHTS[stroke.weight]') !== -1,
    'colours and Thin/Normal/Bold thickness live in a pen-only ink panel');
    ok(classroom.indexOf('id="fullBoardRedo"') !== -1 &&
      fullBoardJs.indexOf('redoStack') !== -1,
    'undo and redo are icon-only board controls');
    ok(classroom.indexOf('data-board-tool="select"') !== -1 &&
      classroom.indexOf('data-board-tool="hand"') !== -1 &&
      classroom.indexOf('id="fullBoardDelete"') === -1 &&
      fullBoardCss.indexOf('.full-board.tool-hand') !== -1,
    'the board has a select tool and a hand pan tool, with no delete icon');
    ok(fullBoardJs.indexOf('function selectAll') !== -1 &&
      fullBoardJs.indexOf('function deleteSelection') !== -1 &&
      fullBoardJs.indexOf("key === 'a'") !== -1 &&
      fullBoardJs.indexOf("key === 'delete'") !== -1 &&
      fullBoardJs.indexOf("key === 'escape'") !== -1,
    'Ctrl+A, Delete/Backspace and Escape drive the board selection');
    ok(fullBoardJs.indexOf('var panDrag') !== -1 &&
      fullBoardJs.indexOf("tool === 'hand'") !== -1 &&
      fullBoardJs.indexOf('ctx.translate(pan.x, pan.y)') !== -1,
    'the hand tool pans the edge-to-edge board by dragging');
    ok(fullBoardCss.indexOf('body.board-open.view-student .top') !== -1 &&
      fullBoardCss.indexOf('body.board-open.view-student .call-pip') !== -1 &&
      fullBoardCss.indexOf('body.board-open.view-student .full-board-tools') !== -1 &&
      fullBoardCss.indexOf('body.board-open.view-student .engagement-bar') !== -1,
    'the student board hides the header, camera deck, tool dock and reactions');
    ok(fullBoardJs.indexOf('function setZoom') !== -1 &&
      fullBoardJs.indexOf("key === '='") !== -1 &&
      fullBoardJs.indexOf("key === '-'") !== -1 &&
      fullBoardJs.indexOf("key === '0'") !== -1 &&
      fullBoardJs.indexOf("overlay.addEventListener('wheel'") !== -1 &&
      fullBoardJs.indexOf("overlay.addEventListener('gesturestart'") !== -1 &&
      classroom.indexOf('id="fullBoardZoomIn"') !== -1 &&
      classroom.indexOf('id="fullBoardZoomOut"') !== -1 &&
      classroom.indexOf('id="fullBoardZoomReset"') !== -1 &&
      fullBoardCss.indexOf('transform-origin:center center') !== -1,
    'board zoom icons, shortcuts and Ctrl+scroll scale only the whiteboard canvas');
    ok(classroomApp.indexOf('function setDeskZoom') !== -1 &&
      classroomApp.indexOf("event.code === 'NumpadAdd'") !== -1 &&
      classroomApp.indexOf("shortcutKey === '0'") !== -1,
    'the desk whiteboard supports the same keyboard zoom controls');
    ok(classroom.indexOf('id="fullBoardDockToggle"') !== -1 &&
      fullBoardJs.indexOf("edge !== 'top' && edge !== 'left'") !== -1 &&
      fullBoardJs.indexOf('function setDockEdge') !== -1 &&
      fullBoardJs.indexOf('full-board-tools dock-top') === -1,
    'the dock toggles only between top and left, defaulting to top');
    ok(fullBoardJs.indexOf('function selectionBounds') !== -1 &&
      fullBoardJs.indexOf('function selectionCorners') !== -1 &&
      fullBoardJs.indexOf('function resizeHandleAt') !== -1 &&
      fullBoardJs.indexOf('function resizeCursor') !== -1 &&
      fullBoardJs.indexOf('function selectionEntries') !== -1 &&
      fullBoardJs.indexOf('resizeDrag.entries.forEach') !== -1 &&
      fullBoardJs.indexOf('entry.points.forEach') !== -1 &&
      fullBoardJs.indexOf('entry.w * scale') !== -1 &&
      fullBoardJs.indexOf('moveDrag.entries.forEach') !== -1 &&
      fullBoardJs.indexOf('Selection resized · Undo restores the board state.') !== -1,
    'every selected stroke, shape, line, image and group resizes from four corner grips');
    ok(fullBoardJs.indexOf("overlay.querySelector('.full-board-tools')") !== -1 &&
      fullBoardJs.indexOf('paletteDrag') !== -1 &&
      fullBoardJs.indexOf("classList.add('is-dragging')") !== -1,
    'the trainer can drag the floating tool palette');
    ok(fullBoardCss.indexOf('body.board-open #fullBoardShare.is-sharing') !== -1 &&
      fullBoardCss.indexOf('background:#15803D') !== -1 &&
      fullBoardCss.indexOf('background:#DC2626') !== -1,
    'the Share control is red while private and green while sharing');
    var topRStart = classroom.indexOf('class="top-r"');
    var topR = classroom.slice(topRStart, classroom.indexOf('</header>', topRStart));
    ok(topR.indexOf('id="recTime"') < topR.indexOf('id="fullBoardShare"') &&
      topR.indexOf('id="fullBoardShare"') < topR.indexOf('id="fullBoardFullscreen"') &&
      topR.indexOf('id="fullBoardFullscreen"') < topR.indexOf('id="peopleBtn"') &&
      topR.indexOf('id="peopleBtn"') < topR.indexOf('id="netMeter"'),
    'the deck keeps REC, Share/Close, session details and network meter in order');
    ok(fullBoardJs.indexOf("document.body.classList.add('board-open')") !== -1 &&
      fullBoardJs.indexOf("document.body.classList.remove('board-open')") !== -1,
    'opening and closing the board toggles the clean session layout');
    ok(fullBoardJs.indexOf("if (!document.fullscreenElement && !overlay.hidden) close();") !== -1,
    'native full-screen exit closes the board for trainer and student');
    ok(fullBoardJs.indexOf("classList.toggle('docked'") === -1 &&
      fullBoardJs.indexOf('teach-mode') === -1,
    'the board never falls back to a docked dashboard panel');

    const pipStart = classroom.indexOf('<section class="call-pip"');
    const pipEnd = classroom.indexOf('</section>', pipStart);
    const pipMarkup = classroom.slice(pipStart, pipEnd);
    ok(pipMarkup.indexOf('data-call-video="local"') !== -1 &&
      pipMarkup.indexOf('data-call-video="remote"') !== -1 &&
      pipMarkup.indexOf('pip-call-bar') === -1 &&
      pipMarkup.indexOf('pip-call-status') === -1 &&
      pipMarkup.indexOf('networkCheckBtn') === -1 &&
      pipMarkup.indexOf('callLeaveBtn') === -1,
    'the camera tile shows only the trainer and student video feeds');
    ok(classroom.indexOf('class="call-runtime" hidden') !== -1 &&
      classroom.indexOf('id="networkCheckBtn"') !== -1 &&
      classroomApp.indexOf('window.mathifyNetworkCheck.run()') !== -1,
    'the speed test runs quietly outside the camera instead of asking for a click');
    ok(classroom.indexOf('id="netMeter"') !== -1 &&
      room.indexOf('.net-meter[data-level="poor"]') !== -1 &&
      room.indexOf('.net-meter[data-level="excellent"]') !== -1 &&
      classroomApp.indexOf('function renderNetworkMeter') !== -1,
    'an always-on colour-graded connection meter replaces the speed-test link');
    ok(callCss.indexOf('.call-pip .pip-head,') !== -1 &&
      callCss.indexOf('.observer-floating,') !== -1 &&
      classroom.indexOf('id="observerNotice"') > pipEnd,
    'camera chrome and observer notices stay outside the two video feeds');
    ok(pipMarkup.indexOf('id="pipResize"') !== -1 &&
      pipMarkup.indexOf('aria-label="Resize video window"') !== -1 &&
      callCss.indexOf('.call-pip .pip-resize{') !== -1 &&
      sessionJs.indexOf('var pipDragTarget = pip || pipHead') !== -1 &&
      sessionJs.indexOf("pipResize.addEventListener('pointerdown'") !== -1,
    'the camera deck is movable from anywhere and resizable from its corner grip');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('fullBoard: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
