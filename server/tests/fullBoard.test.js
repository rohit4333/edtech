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
    const plannerJs = readAsset('lms/planner.js');
    ok(tokens.indexOf('--ink-arrow:') !== -1 &&
      tokens.indexOf("fill='%230E1420' stroke='%23FFFFFF'") !== -1 &&
      tokens.indexOf("width='18' height='18'") !== -1 &&
      tokens.indexOf('3 1, default') !== -1 &&
      room.indexOf('cursor:var(--ink-arrow,default)') !== -1 &&
      room.indexOf('cursor:none') === -1 &&
      fullBoardCss.indexOf('cursor:var(--ink-arrow,default)') !== -1 &&
      fullBoardCss.indexOf('.full-board.tool-select .full-board-canvas-wrap canvas{cursor:var(--ink-arrow,default)}') !== -1,
    'every board surface uses a compact dark arrow pointer with a light outline; non-sketching tools keep it');
    ok(classroom.indexOf('shared/cursorRelay.js') !== -1 &&
      classroom.indexOf('shared/cursorSetup.js') !== -1,
    'the pointer relay is loaded on the verified classroom page');

    const fullBoardJs = readAsset('shared/fullBoard.js');
    ok(tokens.indexOf('--board-cursor-pen:') !== -1 &&
      tokens.indexOf('--board-cursor-highlighter:') !== -1 &&
      tokens.indexOf('--board-cursor-eraser:') !== -1 &&
      tokens.indexOf('--board-cursor-laser:') !== -1 &&
      fullBoardCss.indexOf('.full-board.tool-pen .full-board-canvas-wrap canvas{cursor:var(--board-cursor-pen,var(--ink-arrow,default))}') !== -1 &&
      fullBoardCss.indexOf('.full-board.tool-highlighter .full-board-canvas-wrap canvas,') !== -1 &&
      fullBoardCss.indexOf('.full-board.tool-marker .full-board-canvas-wrap canvas{cursor:var(--board-cursor-highlighter,var(--ink-arrow,default))}') !== -1 &&
      fullBoardCss.indexOf('.full-board.tool-eraser .full-board-canvas-wrap canvas{cursor:var(--board-cursor-eraser,var(--ink-arrow,default))}') !== -1 &&
      fullBoardCss.indexOf('.full-board.tool-laser .full-board-canvas-wrap canvas{cursor:var(--board-cursor-laser,var(--ink-arrow,default))}') !== -1 &&
      fullBoardJs.indexOf("['select', 'hand', 'pen', 'highlighter', 'marker', 'eraser', 'laser']") !== -1,
    'sketching tools use their own compact icon cursor while hand pan keeps grab/grabbing');
    ok(fullBoardJs.indexOf("var tool = 'select'") !== -1 &&
      classroom.indexOf('data-board-tool="select" aria-pressed="true"') !== -1 &&
      classroom.indexOf('data-board-tool="pen" aria-pressed="false"') !== -1,
    'the trainer whiteboard opens in select mode, never already sketching');
    ok(fullBoardCss.indexOf('body.board-open .top .full-board-tools') !== -1 &&
      /\.full-board \.full-board-canvas-wrap\{[^}]*inset:0/.test(fullBoardCss) &&
      fullBoardCss.indexOf('dock-left') === -1 &&
      fullBoardCss.indexOf('board-dock-left') === -1,
    'the canvas fills the viewport while the tools live in their own floating deck');
    ok(fullBoardCss.indexOf('body.board-open .top{') !== -1 &&
      fullBoardCss.indexOf('background:transparent;box-shadow:none;backdrop-filter:none;pointer-events:none') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-rec-deck,\nbody.board-open .top .full-board-tools,\nbody.board-open .top .board-session-deck{') !== -1 &&
      fullBoardCss.indexOf('position:fixed;top:12px;right:12px;bottom:auto;left:12px;z-index:215;') !== -1 &&
      fullBoardCss.indexOf('justify-content:space-between') !== -1 &&
      fullBoardCss.indexOf('position:relative;z-index:1;flex:none;min-width:0;') !== -1 &&
      fullBoardCss.indexOf('height:48px;padding:0 12px;') !== -1 &&
      fullBoardCss.indexOf('border:1px solid var(--line);border-radius:14px;') !== -1 &&
      fullBoardCss.indexOf('box-shadow:0 16px 38px -14px rgba(14,20,32,.5)') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-rec-deck{order:1}') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .full-board-tools{order:2;overflow:visible}') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-session-deck{order:3}') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .rec{') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .net-meter{width:24px;height:32px;border-right:0}') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top-r .full-board-tools button{\n  height:32px;min-width:32px;padding:4px;box-shadow:none') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .brand') !== -1 &&
      fullBoardCss.indexOf('body.board-open .call-pip') !== -1 &&
      fullBoardCss.indexOf('body.board-open .engagement-bar') !== -1,
    'REC, whiteboard controls and session controls are three separate 48px floating decks');
    ok(classroom.indexOf('class="board-warning-deck trainer-only" id="boardWarningDeck" hidden') !== -1 &&
      fullBoardCss.indexOf('position:fixed;right:12px;bottom:12px;z-index:226;') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-warning-deck[hidden]{display:none}') !== -1 &&
      fullBoardCss.indexOf('@keyframes boardWarnGlow') !== -1 &&
      classroomApp.indexOf("var warningDeck = $('#boardWarningDeck')") !== -1 &&
      classroomApp.indexOf('if (warningDeck) warningDeck.hidden = false;') !== -1 &&
      classroomApp.indexOf('if (warningDeck) warningDeck.hidden = true;') !== -1,
    'the five-minute cue lives in a hidden bottom-right alert deck that appears only when cued');
    const topStart = classroom.indexOf('<header class="top">');
    const topEnd = classroom.indexOf('</header>', topStart);
    const upperDeck = classroom.slice(topStart, topEnd);
    ok(classroom.indexOf('id="fullBoardToolHandle"') === -1 &&
      classroom.indexOf('id="fullBoardDockToggle"') === -1 &&
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
    ok(fullBoardCss.indexOf('.full-board-tools button[aria-pressed="true"]{\n  background:var(--coral);color:var(--ink);border-color:var(--coral)') !== -1 &&
      fullBoardCss.indexOf('color:var(--ink);font:500 11px/1 var(--mono)') !== -1 &&
      fullBoardCss.indexOf('border-color:var(--coral);background:var(--coral-soft);color:var(--coral-deep)') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top #fullBoardFullscreen{color:var(--ink)}') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top #peopleBtn .av{background:var(--ink)}') !== -1 &&
      fullBoardCss.indexOf('--tool:') === -1,
    'board icons follow the Paper & Ink theme with coral reserved for hover and active states');
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
      fullBoardCss.indexOf('background:transparent;box-shadow:none;backdrop-filter:none;pointer-events:none') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-rec-deck{') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .full-board-tools{') !== -1 &&
      fullBoardCss.indexOf('body.board-open .top .board-session-deck{') !== -1 &&
      fullBoardCss.indexOf('dock-left') === -1 &&
      fullBoardCss.indexOf('dock-right') === -1 &&
      fullBoardCss.indexOf('dock-bottom') === -1 &&
      fullBoardCss.indexOf('board-dock-left') === -1 &&
      fullBoardCss.indexOf('bottom:76px;z-index:225') !== -1 &&
      fullBoardJs.indexOf('function setDockEdge') === -1 &&
      fullBoardJs.indexOf('function mountPalette') !== -1 &&
      fullBoardJs.indexOf('topRow.insertBefore(toolPalette, sessionDeck || shareBtn || null)') !== -1 &&
      fullBoardJs.indexOf('unmountPalette()') !== -1,
    'REC, tools and session controls are three floating decks with no orientation toggle');
    [
      'ink', 'coral', 'teal', 'amber', 'blue', 'violet',
      'green', 'pink', 'orange', 'slate'
    ].forEach(function (color) {
      ok(classroom.indexOf('data-board-color="' + color + '"') !== -1,
        'the maths board offers the ' + color + ' ink');
    });
    ok(classroom.indexOf('id="fullBoardInkPanel"') !== -1 &&
      classroom.indexOf('ink-panel-head') === -1 &&
      classroom.indexOf('<span>1 Thin</span>') === -1 &&
      classroom.indexOf('<span>2 Normal</span>') === -1 &&
      classroom.indexOf('<span>3 Bold</span>') === -1 &&
      classroom.indexOf('data-board-weight="thin"') !== -1 &&
      classroom.indexOf('data-board-weight="normal"') !== -1 &&
      classroom.indexOf('data-board-weight="bold"') !== -1 &&
      classroom.indexOf('M4 14C7 7 10 19 13 12S19 7 20 11') !== -1 &&
      classroom.indexOf('stroke-width="4.4"') !== -1 &&
      fullBoardCss.indexOf('display:flex;flex-direction:row;align-items:center;gap:12px;') !== -1 &&
      fullBoardCss.indexOf('.ink-widths{\n  display:flex;flex-wrap:nowrap;gap:4px;') !== -1 &&
      classroom.indexOf('data-ink-toggle="pen"') !== -1 &&
      classroom.indexOf('data-ink-toggle="highlighter"') !== -1 &&
      fullBoardJs.indexOf('function openInkPanel') !== -1 &&
      fullBoardJs.indexOf('function closeInkPanel') !== -1 &&
      fullBoardJs.indexOf('inkPanel.hidden') !== -1 &&
      fullBoardJs.indexOf('WEIGHTS[stroke.weight]') !== -1,
    'the ink panel is one wide unlabelled row with ten swatches and curved stroke samples');
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
    ok(classroom.indexOf('id="fullBoardDockToggle"') === -1 &&
      fullBoardJs.indexOf('function setDockEdge') === -1 &&
      fullBoardJs.indexOf("edge !== 'top'") === -1 &&
      fullBoardJs.indexOf('dockEdge') === -1,
    'the board has a single top deck with no alignment toggle');
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
      fullBoardJs.indexOf('paletteDrag') === -1 &&
      fullBoardJs.indexOf("classList.add('is-dragging')") === -1 &&
      fullBoardJs.indexOf('topRow.insertBefore(toolPalette, sessionDeck || shareBtn || null)') !== -1,
    'the tool palette is fixed inside the top deck instead of floating or dragging');
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
    const boardMarks = classroom.match(/class="mathify-board-mark"/g) || [];
    const footMarks = classroom.match(/class="mathify-board-footmark"/g) || [];
    const footBlock = fullBoardCss.slice(fullBoardCss.indexOf('.mathify-board-footmark{'));
    const footStyle = footBlock.slice(0, footBlock.indexOf('}'));
    ok(boardMarks.length === 4 && footMarks.length === 4 &&
      classroom.indexOf('>Mathify<i>.</i><') !== -1 &&
      fullBoardCss.indexOf('.mathify-board-mark{') !== -1 &&
      footStyle.indexOf('font:700 20px/1 var(--sans)') !== -1 &&
      footStyle.indexOf('color:var(--ink);opacity:.9') !== -1 &&
      fullBoardCss.indexOf('.mathify-board-footmark i{font-style:normal;font-weight:700;color:var(--coral-deep)}') !== -1 &&
      fullBoardCss.indexOf('pointer-events:none;user-select:none') !== -1,
    'every board surface carries a light diagonal mark and the original dark bold bottom signature');
    ok(classroom.indexOf('class="sketch-strip"') === -1 &&
      classroom.indexOf('Sketch space') === -1 &&
      classroom.indexOf('class="workspace"') === -1,
    'the lesson deck no longer exposes sketch-space strips');

    ok(fullBoardJs.indexOf('function questionCard(question)') !== -1 &&
      fullBoardJs.indexOf('function questionImageSource(value)') !== -1 &&
      fullBoardJs.indexOf('function clearQuestionZone(box)') !== -1 &&
      fullBoardJs.indexOf("themeToken('--paper', '#FDFAF3')") !== -1 &&
      fullBoardJs.indexOf("themeToken('--ink', '#0E1420')") !== -1 &&
      fullBoardJs.indexOf("themeToken('--coral-deep', '#B83A16')") !== -1 &&
      fullBoardJs.indexOf("themeToken('--line', 'rgba(14,20,32,.14)')") !== -1 &&
      fullBoardJs.indexOf("id: 'question_' + Date.now() + '_' + imageCount") !== -1 &&
      fullBoardJs.indexOf('x: Math.max(0, 0.97 - w)') !== -1 &&
      fullBoardJs.indexOf('y: 0.035') !== -1 &&
      fullBoardJs.indexOf('hasImage') !== -1 &&
      fullBoardJs.indexOf("push('snapshot', Object.assign({ page: 1 }, snapshotPayload()))") !== -1 &&
      fullBoardJs.indexOf('queueQuestionText: function (question)') !== -1 &&
      fullBoardJs.indexOf('{ open: false, silent: true }') !== -1,
    'a themed top-right question card carries its own image and one whole-board snapshot');
    var queueStart = sessionJs.indexOf('function queueQuestionToBoard(item)');
    var queueEnd = sessionJs.indexOf('\n  }', queueStart);
    var queueFn = sessionJs.slice(queueStart, queueEnd);
    ok(queueFn.indexOf('item.q') !== -1 &&
      queueFn.indexOf('item.image') !== -1 &&
      queueFn.indexOf('q: text') !== -1 &&
      queueFn.indexOf('image:') !== -1 &&
      queueFn.indexOf('options') === -1 &&
      queueFn.indexOf('answer') === -1 &&
      queueFn.indexOf('hint') === -1 &&
      sessionJs.indexOf('boardApi.queueQuestionText(question)') !== -1 &&
      sessionJs.indexOf('if (quizLive()) queueQuestionToBoard(item);') !== -1 &&
      sessionJs.indexOf("window.addEventListener('mathify:fullboard-ready', flushPendingBoardQuestion)") !== -1,
    'the trainer pushes only the stem and attached image, even during bootstrap');
    var mapStart = sessionJs.indexOf('function mapQuizQuestion(source, index)');
    var mapFn = sessionJs.slice(mapStart, sessionJs.indexOf('\n  }', mapStart));
    ok(mapFn.indexOf('source.image') !== -1 && mapFn.indexOf('mapped.image') !== -1 &&
      sessionJs.indexOf('quizImageSource(item.image)') !== -1 &&
      sessionJs.indexOf('id="quizQuestionImage"') === -1 &&
      classroom.indexOf('id="quizQuestionImage"') !== -1 &&
      sessionJs.indexOf('consumePlannerQuestion') !== -1 &&
      sessionJs.indexOf('mathify.planner.question') !== -1,
    'a picture question keeps its image in the quiz stage and the planner handoff');
    ok(plannerJs.indexOf("id = 'plannerQuestionToBoard'") !== -1 &&
      plannerJs.indexOf("'Send question to whiteboard'") !== -1 &&
      plannerJs.indexOf("'mathify.planner.question'") !== -1 &&
      plannerJs.indexOf('board=full&plannerQuestion=1') !== -1 &&
      plannerJs.indexOf('draft.quiz_image') !== -1,
    'the trainer planner exposes a direct question-to-whiteboard handoff');
    var boardStart = classroom.indexOf('<section class="full-board"');
    var boardMarkup = classroom.slice(boardStart, classroom.indexOf('</section>', boardStart));
    var markStart = fullBoardCss.indexOf('.mathify-board-mark{');
    var markStyle = fullBoardCss.slice(markStart, fullBoardCss.indexOf('}', markStart));
    var footStart = fullBoardCss.indexOf('.mathify-board-footmark{');
    var footStyleAt = fullBoardCss.slice(footStart, fullBoardCss.indexOf('}', footStart));
    var shiftStart = fullBoardJs.indexOf('function shiftItemsUp(delta)');
    var shiftFn = fullBoardJs.slice(shiftStart, fullBoardJs.indexOf('\n  }', shiftStart));
    ok(boardMarkup.indexOf('id="fullBoardCanvas"') < boardMarkup.indexOf('class="mathify-board-mark"') &&
      boardMarkup.indexOf('class="mathify-board-footmark"') !== -1 &&
      markStyle.indexOf('position:absolute') !== -1 &&
      footStyleAt.indexOf('position:absolute') !== -1 &&
      shiftFn.indexOf('footmark') === -1 &&
      shiftFn.indexOf('board-mark') === -1 &&
      fullBoardJs.indexOf('mathify-board-footmark') === -1,
    'the confidential marks stay pinned to the board frame while ink shifts upward');
    var closeStart = fullBoardJs.indexOf('function close() {');
    var closeFn = fullBoardJs.slice(closeStart, fullBoardJs.indexOf('\n  }', closeStart));
    ok(closeFn.indexOf('items = []') === -1 &&
      closeFn.indexOf('imageCache = {}') === -1 &&
      fullBoardJs.indexOf('items = payload.items.slice(0, 300)') !== -1,
    'closing and reopening the board keeps the same shared written content');
    ok(classroom.indexOf('question goes to the shared whiteboard automatically') !== -1 &&
      classroom.indexOf('options stay here') !== -1,
    'the trainer quiz sheet explains the automatic question-to-board transfer');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('fullBoard: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
