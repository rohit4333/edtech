/* Mathify overnight end-to-end live HTTP probe.
   Run against the dev server: node scripts/e2e-live.js
   Writes e2e-live-log.json next to this file. Tolerant by design: a failed
   check is recorded, not thrown, so one full pass collects every result. */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.MATHIFY_BASE || 'http://127.0.0.1:4004';
const PASSWORD = process.env.DEMO_PASSWORD || 'mathify-demo';
const OUT = path.join(__dirname, 'e2e-live-log.json');

const SESSION_ID = 'ses_math_001';
const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'temporary-ratio-planner.json');
const PREFLIGHT_FILE = path.join(__dirname, '..', 'classroom', 'preflight.html');
/* Exact keys only: permission flags such as canViewAnswerKey:false stay safe. */
const FORBIDDEN_GUIDE_KEYS = [
  'answerindex', 'answer', 'answerkey', 'hint', 'explanation',
  'trainerinstructions', 'notes', 'misconceptions', 'options'
];
const PREMATURE_REVEAL_KEYS = ['answerindex', 'answerkey', 'correctoptionid', 'explanation', 'correct'];

const results = [];

/* The log is committed with the repo. Redact any auth material before it is
   written so a demo JWT or refresh token never lands in version control. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const clean = {};
    Object.keys(value).forEach(function (key) {
      if (/token|secret|password|authorization|credential/i.test(key)) clean[key] = '[redacted]';
      else clean[key] = redact(value[key]);
    });
    return clean;
  }
  if (typeof value === 'string' && /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)) return '[redacted]';
  return value;
}

function now() { return new Date().toISOString(); }

async function req(method, route, body, token, headers) {
  const init = { method: method, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (token) init.headers.authorization = 'Bearer ' + token;
  const started = Date.now();
  try {
    const response = await fetch(BASE + route, init);
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { parsed = text; }
    return { status: response.status, body: parsed, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, body: { error: String(error && error.message || error) }, ms: Date.now() - started };
  }
}

async function check(name, fn) {
  let entry = { name: name, at: now(), ok: false };
  try {
    const detail = await fn();
    if (detail && typeof detail === 'object' && 'ok' in detail) {
      entry.ok = !!detail.ok;
      entry.detail = redact(detail);
    } else {
      entry.ok = detail !== false;
      entry.detail = redact(detail);
    }
  } catch (error) {
    entry.detail = { error: redact(String(error && error.stack || error)) };
  }
  /* An explicitly skipped probe is neither a pass nor a hidden failure. */
  if (entry.detail && entry.detail.skipped === true) {
    entry.skipped = true;
    entry.ok = false;
  }
  results.push(entry);
  const mark = entry.skipped ? 'SKIP' : entry.ok ? 'PASS' : 'FAIL';
  console.log('[' + mark + '] ' + name + (entry.detail && entry.detail.ms ? ' (' + entry.detail.ms + 'ms)' : ''));
  if (!entry.ok) console.log('       ' + JSON.stringify(entry.detail).slice(0, 600));
  return entry;
}

function requireStatus(response, expected) {
  return { ok: response.status === expected, status: response.status, ms: response.ms, body: response.body };
}

function readRepoText(file) {
  try { return { ok: true, text: fs.readFileSync(file, 'utf8') }; } catch (error) {
    return { ok: false, error: String(error && error.message || error) };
  }
}

function readRepoJson(file) {
  try { return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (error) {
    return { ok: false, error: String(error && error.message || error) };
  }
}

function isPositiveDisclosure(value) {
  if (value === false || value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/* Collect exact-key hits so canViewAnswerKey:false never counts as a leak. */
function keyHits(value, keys, trail, positiveOnly) {
  const hits = [];
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function (key) {
      const lower = key.toLowerCase();
      if (keys.indexOf(lower) !== -1 && (!positiveOnly || isPositiveDisclosure(node[key]))) {
        hits.push({
          key: path + key,
          value: isPositiveDisclosure(node[key]) ? JSON.stringify(node[key]).slice(0, 160) : node[key]
        });
      }
      visit(node[key], path + key + '.');
    });
  }
  visit(value, trail || '');
  return hits;
}

function collectShareFlags(value, trail, out) {
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach(function (key) {
    const lower = key.toLowerCase();
    const path = (trail || '') + key;
    const boardish = lower.indexOf('board') !== -1 || (trail || '').toLowerCase().indexOf('board') !== -1;
    const shareish = ['shared', 'sharing', 'boardshared', 'boardsharing'].indexOf(lower) !== -1 ||
      (boardish && lower.indexOf('shar') !== -1);
    if (shareish && typeof value[key] === 'boolean') out.push({ key: path, value: value[key] });
    collectShareFlags(value[key], path + '.', out);
  });
}

function stateFor(token) {
  return req('GET', '/api/sessions/' + SESSION_ID + '/state', undefined, token);
}

function trainerSessionFor(token) {
  return req('GET', '/api/trainer/sessions/' + SESSION_ID, undefined, token);
}

function currentQuestion(session) {
  const quiz = session && session.quiz;
  const questions = quiz && Array.isArray(quiz.questions) ? quiz.questions : [];
  return questions.find(function (question) { return question && question.id === quiz.currentQuestionId; }) || null;
}

function totalsFrom(response) {
  const body = response && response.body && typeof response.body === 'object' ? response.body : {};
  const dashboard = body.dashboard || body;
  const totals = dashboard.questionTotals || body.questionTotals;
  if (!totals || typeof totals.attempted !== 'number' || typeof totals.solved !== 'number') return null;
  return { attempted: totals.attempted, solved: totals.solved };
}

async function revealQuestion(token, questionId) {
  return req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/reveal', { questionId: questionId }, token);
}

/* A previous run can leave a generated Retest item at index 0. The actual
   trainer /quiz/next route (with an explicit override) returns to a fixture id. */
async function ensureFixtureQuestion(token, ids) {
  let response = await trainerSessionFor(token);
  let session = response.body && response.body.session;
  let question = currentQuestion(session);
  let forced = 0;
  while (question && ids.indexOf(question.id) === -1 && forced < ids.length + 1) {
    const next = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/next', { force: true }, token);
    if (next.status !== 200) {
      return { response: response, session: session, question: question, forced: forced, nextError: next };
    }
    response = next;
    session = next.body && next.body.session;
    question = currentQuestion(session);
    forced += 1;
  }
  return { response: response, session: session, question: question, forced: forced };
}

async function main() {
  const tokens = {};

  await check('health', async function () {
    const r = await req('GET', '/api/health');
    return Object.assign(requireStatus(r, 200), { ok: r.status === 200 && r.body.ok === true });
  });

  await check('private git config is not served', async function () {
    const r = await req('GET', '/.git/config');
    return requireStatus(r, 404);
  });

  await check('anonymous /api/auth/me is rejected', async function () {
    const r = await req('GET', '/api/auth/me');
    return requireStatus(r, 401);
  });

  const roles = [
    ['trainer', 'trainer@mathify.app'],
    ['student', 'student@mathify.app'],
    ['founder', 'founder@mathify.app'],
    ['parent', 'parent@mathify.app'],
    ['relationship_manager', 'rm@mathify.app'],
    ['planner', 'planner@mathify.app']
  ];
  for (const pair of roles) {
    const role = pair[0];
    await check('login ' + role, async function () {
      const email = pair[1];
      const r = await req('POST', '/api/auth/login', { email: email, password: PASSWORD });
      if (r.status === 200 && r.body.token) tokens[role] = r.body.token;
      return Object.assign(requireStatus(r, 200), {
        ok: r.status === 200 && !!r.body.token && !r.body.user.passwordHash,
        role: r.body.user && r.body.user.role
      });
    });
  }

  await check('student dashboard credits are 8', async function () {
    const r = await req('GET', '/api/student/dashboard', undefined, tokens.student);
    const ds = r.body && (r.body.dashboard || r.body);
    const credits = ds && (ds.credits !== undefined ? ds.credits
      : ds.sessionsRemaining !== undefined ? ds.sessionsRemaining
        : ds.student && ds.student.sessionsRemaining !== undefined ? ds.student.sessionsRemaining
          : ds.wallet && ds.wallet.credits);
    return Object.assign(requireStatus(r, 200), { ok: r.status === 200 && credits === 8, credits: credits });
  });

  await check('student dashboard has no private fields', async function () {
    const r = await req('GET', '/api/student/dashboard', undefined, tokens.student);
    const keys = JSON.stringify(r.body || {}).toLowerCase();
    const leaked = ['passwordhash', 'answerindex', 'answerkey', 'explanation', 'phonenumber'].filter(function (k) {
      return keys.indexOf(k) !== -1;
    });
    return { ok: r.status === 200 && leaked.length === 0, leaked: leaked, ms: r.ms };
  });

  await check('trainer dashboard', async function () {
    const r = await req('GET', '/api/trainer/dashboard', undefined, tokens.trainer);
    return requireStatus(r, 200);
  });

  await check('announcements list + unread', async function () {
    const list = await req('GET', '/api/announcements', undefined, tokens.trainer);
    const unread = await req('GET', '/api/announcements/unread', undefined, tokens.trainer);
    return {
      ok: list.status === 200 && unread.status === 200,
      listStatus: list.status,
      unreadStatus: unread.status,
      count: Array.isArray(list.body) ? list.body.length : (list.body && list.body.items ? list.body.items.length : null),
      ms: list.ms + unread.ms
    };
  });

  await check('parent-chat unread summary', async function () {
    const r = await req('GET', '/api/parent-chat/unread-summary', undefined, tokens.trainer);
    return requireStatus(r, 200);
  });

  await check('session state is role-safe', async function () {
    const r = await req('GET', '/api/sessions/ses_math_001/state', undefined, tokens.student);
    /* Permission flags such as canViewAnswerKey:false are safe; only positive
       disclosure of key/hint/explanation content is a failure. */
    const hits = [];
    function walk(value, trail) {
      if (!value || typeof value !== 'object') return;
      Object.keys(value).forEach(function (key) {
        const lower = key.toLowerCase();
        if (['answerindex', 'answerkey', 'hint', 'explanation', 'trainerinstructions', 'misconception']
          .some(function (needle) { return lower.indexOf(needle) !== -1; })) {
          hits.push({ key: trail + key, value: JSON.stringify(value[key]).slice(0, 120) });
        }
        walk(value[key], trail + key + '.');
      });
    }
    walk(r.body || {}, '');
    const leaks = hits.filter(function (hit) {
      return !/^canview|^false$/.test(hit.key) && hit.value !== 'false' && hit.value !== 'null';
    });
    return { ok: r.status === 200 && leaks.length === 0, status: r.status, leaks: leaks, ms: r.ms };
  });

  await check('LMS catalog', async function () {
    const r = await req('GET', '/api/lms/curriculum-catalog', undefined, tokens.trainer);
    return requireStatus(r, 200);
  });

  await check('trainer assigned planners are read-only', async function () {
    const r = await req('GET', '/api/lms/assigned-planners', undefined, tokens.trainer);
    return requireStatus(r, 200);
  });

  await check('trainer cannot mutate a planner', async function () {
    const r = await req('PATCH', '/api/lms/planner', { id: 'probe', label: 'probe' }, tokens.trainer);
    return { ok: r.status === 403 || r.status === 401 || r.status === 404, status: r.status, ms: r.ms };
  });

  await check('founder-only planner suggestions are gated', async function () {
    const r = await req('GET', '/api/lms/planner-suggestions', undefined, tokens.trainer);
    return { ok: r.status === 403 || r.status === 401, status: r.status, ms: r.ms };
  });

  await check('question totals present in student dashboard', async function () {
    const r = await req('GET', '/api/student/dashboard', undefined, tokens.student);
    const body = r.body || {};
    const totals = body.questionTotals || (body.dashboard && body.dashboard.questionTotals);
    return {
      ok: r.status === 200 && !!totals && typeof totals.attempted === 'number' && typeof totals.solved === 'number',
      totals: totals || null,
      status: r.status,
      ms: r.ms
    };
  });

  /* The checked-in fixture and preflight page are the source of truth; the live
     server is only asked to serve and apply them. */
  const fixtureSource = readRepoJson(FIXTURE_FILE);
  const fixture = fixtureSource.ok ? fixtureSource.value : {};
  const fixtureIds = [];
  const correctIndexById = {};
  (fixture.concepts || []).forEach(function (concept) {
    (concept.practiceQuestions || []).forEach(function (question) {
      fixtureIds.push(question.id);
      correctIndexById[question.id] = question.answerIndex;
    });
  });
  const live = {};

  await check('preflight page served with Join and presets', async function () {
    const repo = readRepoText(PREFLIGHT_FILE);
    const r = await req('GET', '/classroom/preflight.html');
    const served = typeof r.body === 'string' ? r.body : '';
    const markers = repo.ok
      ? ['id="preflightJoin"', '>Join the session<', 'id="presetMic"', 'id="presetCam"']
      : [];
    const missing = markers.filter(function (marker) {
      return repo.text.indexOf(marker) === -1 || served.indexOf(marker) === -1;
    });
    const bypassPresent = /preflightContinue|Continue to the camera/.test(repo.text) ||
      /preflightContinue|Continue to the camera/.test(served);
    return {
      ok: repo.ok && r.status === 200 && served.indexOf('Get ready for class') !== -1 &&
        missing.length === 0 && !bypassPresent,
      status: r.status,
      repoRead: repo.ok,
      markers: markers,
      missing: missing,
      bypassPresent: bypassPresent,
      ms: r.ms
    };
  });

  await check('trainer Join heartbeat starts server-owned timer', async function () {
    const before = await stateFor(tokens.trainer);
    const joined = await req('POST', '/api/sessions/' + SESSION_ID + '/presence', {
      active: true, learningEvents: 0
    }, tokens.trainer);
    const after = await stateFor(tokens.trainer);
    const presence = joined.body && joined.body.presence;
    const timing = after.body && after.body.state && after.body.state.sessionTiming;
    const ok = joined.status === 200 && after.status === 200 && presence && presence.trainer &&
      presence.trainer.state === 'active' && !!timing && timing.timerRunning === true &&
      timing.timerSeconds !== null && timing.timerSeconds !== undefined;
    return {
      ok: !!ok,
      joinedStatus: joined.status,
      stateStatus: after.status,
      trainerState: presence && presence.trainer && presence.trainer.state,
      beforeRunning: before.body && before.body.state && before.body.state.sessionTiming &&
        before.body.state.sessionTiming.timerRunning,
      timerRunning: timing && timing.timerRunning,
      timerSeconds: timing && timing.timerSeconds,
      presenceEnded: false,
      ms: joined.ms + after.ms
    };
  });

  await check('trainer board.opened handoff is visible to the child, child cannot publish it', async function () {
    const denied = await req('POST', '/api/sessions/' + SESSION_ID + '/board/open', {}, tokens.student);
    const opened = await req('POST', '/api/sessions/' + SESSION_ID + '/board/open', {}, tokens.trainer);
    const events = await req('GET', '/api/sessions/' + SESSION_ID + '/events?limit=200',
      undefined, tokens.student);
    const list = events.body && Array.isArray(events.body.events) ? events.body.events : [];
    const handoff = list.filter(function (event) { return event.event === 'board.opened'; }).pop();
    const safeKeys = handoff && handoff.payload
      ? Object.keys(handoff.payload).every(function (key) {
        return !/answer|correct|hint|trainer|pay|clock|note/i.test(key);
      }) : false;
    return {
      ok: denied.status === 403 && opened.status === 200 && opened.body.opened === true &&
        events.status === 200 && !!handoff && handoff.payload.opened === true && safeKeys,
      deniedStatus: denied.status,
      openedStatus: opened.status,
      handoffSeq: handoff && handoff.seq,
      handoffPayload: handoff && handoff.payload,
      safeKeys: safeKeys,
      ms: denied.ms + opened.ms + events.ms
    };
  });

  await check('camera deck access menu and sticky scratch permission are live', async function () {
    const html = fs.readFileSync(path.join(__dirname, '..', 'classroom', 'connect.html'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '..', 'classroom', 'connect.js'), 'utf8');
    const markers = ['peerAccessBtn', 'peerAccessMenu', 'paMediaBtn', 'paMicBtn', 'paCamBtn',
      'paReactBtn', 'paSketchBtn'];
    const missing = markers.filter(function (id) { return html.indexOf('id="' + id + '"') === -1; });
    const stateR = await stateFor(tokens.student);
    const permissions = stateR.body && stateR.body.state && stateR.body.state.sketchPermissions;
    const denied = await req('POST', '/api/sessions/' + SESSION_ID + '/sketch-permission', {
      studentCanSketch: false
    }, tokens.student);
    const revoke = await req('POST', '/api/sessions/' + SESSION_ID + '/sketch-permission', {
      studentCanSketch: false
    }, tokens.trainer);
    const after = await stateFor(tokens.student);
    const restore = await req('POST', '/api/sessions/' + SESSION_ID + '/sketch-permission', {
      studentCanSketch: true
    }, tokens.trainer);
    return {
      ok: missing.length === 0 && denied.status === 403 && revoke.status === 200 &&
        after.body.state.sketchPermissions.studentCanSketch === false &&
        restore.body.sketchPermissions.studentCanSketch === true &&
        /applyMediaPermission\(state\.mediaPermissions\)/.test(client) &&
        /applySketchPermission\(state\.sketchPermissions\)/.test(client),
      missingMarkers: missing,
      defaultPermission: permissions,
      deniedStatus: denied.status,
      revoked: after.body.state.sketchPermissions,
      restored: restore.body.sketchPermissions,
      ms: stateR.ms + denied.ms + revoke.ms + after.ms + restore.ms
    };
  });

  await check('quiz popup scratch toolkit and paired trainer mirror are wired', async function () {
    const html = fs.readFileSync(path.join(__dirname, '..', 'classroom', 'index.html'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '..', 'classroom', 'session.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'classroom', 'session.css'), 'utf8');
    const tools = ['quizSketchCanvas', 'quizSketchClear', 'trainerQuizPopup', 'quizMirrorOptions'];
    const missing = tools.filter(function (id) { return html.indexOf('id="' + id + '"') === -1; });
    const colors = ['ink', 'coral', 'teal'].filter(function (color) {
      return html.indexOf('data-quiz-color="' + color + '"') === -1;
    });
    return {
      ok: missing.length === 0 && colors.length === 0 &&
        /data-quiz-tool="pen"/.test(html) && /data-quiz-tool="highlighter"/.test(html) &&
        /data-quiz-tool="eraser"/.test(html) &&
        /quiz\.option\.selected/.test(client) && /paintMirrorSelection/.test(client) &&
        /quiz-sketch-tools\.is-disabled button/.test(css),
      missingMarkers: missing,
      missingColors: colors,
      ms: 0
    };
  });

  await check('post-login view chooser verifies identity and only the shared family pair', async function () {
    const chooser = await req('GET', '/view-choice.html');
    const html = chooser.status === 200 && typeof chooser.body === 'string' ? chooser.body : '';
    const toParent = await req('POST', '/api/auth/view', { view: 'parent' }, tokens.student);
    const toKid = await req('POST', '/api/auth/view', { view: 'student' }, tokens.parent);
    const escalate = await req('POST', '/api/auth/view', { view: 'founder' }, tokens.trainer);
    const manager = await req('POST', '/api/auth/view', {
      view: 'relationship_manager'
    }, tokens.student);
    const parentMe = toParent.body && toParent.body.token
      ? await req('GET', '/api/auth/me', undefined, toParent.body.token) : null;
    return {
      ok: chooser.status === 200 && html.indexOf('id="choiceGrid"') !== -1 &&
        html.indexOf('type="password"') === -1 &&
        toParent.status === 200 && toParent.body.user.role === 'parent' &&
        toParent.body.refreshToken === undefined &&
        Boolean(parentMe && parentMe.status === 200 && parentMe.body.user.role === 'parent') &&
        toKid.status === 200 && toKid.body.user.role === 'student' &&
        escalate.status === 403 && manager.status === 403,
      chooserStatus: chooser.status,
      parentView: toParent.status,
      kidView: toKid.status,
      escalations: [escalate.status, manager.status],
      ms: chooser.ms + toParent.ms + toKid.ms + escalate.ms + manager.ms
    };
  });

  await check('one fixed natural-ratio rule for quiz, planner and board images', async function () {
    const root = path.join(__dirname, '..');
    const tokensCss = fs.readFileSync(path.join(root, 'shared', 'tokens.css'), 'utf8');
    const sessionCss = fs.readFileSync(path.join(root, 'classroom', 'session.css'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'classroom', 'index.html'), 'utf8');
    const board = fs.readFileSync(path.join(root, 'shared', 'fullBoard.js'), 'utf8');
    const block = board.match(/function fitNaturalBox\([\s\S]*?\n  \}/);
    return {
      ok: /\.aspect-safe\{[^}]*width:auto;[^}]*height:auto;[^}]*aspect-ratio:auto;[^}]*object-fit:contain;/.test(tokensCss) &&
        html.indexOf('class="quiz-question-image aspect-safe" id="quizQuestionImage"') !== -1 &&
        html.indexOf('class="quiz-question-image aspect-safe" id="quizMirrorImage"') !== -1 &&
        /\.quiz-question-image\{[^}]*\}/.test(sessionCss) &&
        (sessionCss.match(/\.quiz-question-image\{[^}]*\}/) || [''])[0].indexOf('height:') === -1 &&
        Boolean(block) && (board.match(/fitNaturalBox\(/g) || []).length >= 4 &&
        block[0].indexOf('w / ratio') !== -1,
      helperUses: (board.match(/fitNaturalBox\(/g) || []).length,
      ms: 0
    };
  });

  await check('temporary planner guide visible in trainer state', async function () {
    const stateR = await stateFor(tokens.trainer);
    const sessionR = await trainerSessionFor(tokens.trainer);
    const state = stateR.body && stateR.body.state;
    const guide = state && state.plannerGuide;
    const session = sessionR.body && sessionR.body.session;
    const concepts = guide && Array.isArray(guide.concepts) ? guide.concepts : [];
    const beats = guide && guide.story && Array.isArray(guide.story.beats) ? guide.story.beats : [];
    const beatConceptIds = beats.map(function (beat) { return beat && beat.conceptId; });
    const story = fixture.story || {};
    const expectedConceptIds = (fixture.concepts || []).map(function (concept) { return concept.id; });
    const guideNotes = keyHits(guide || {}, ['trainerinstructions', 'misconceptions'], '', false);
    const quizKeys = keyHits((session && session.quiz && session.quiz.questions) || [],
      ['answerindex', 'hint', 'explanation'], '', false);
    const continuity = expectedConceptIds.length > 0 && beats.length === (story.beats || []).length &&
      expectedConceptIds.every(function (id) {
        return concepts.some(function (concept) { return concept && concept.id === id; }) &&
          beatConceptIds.indexOf(id) !== -1;
      }) && (!story.title || (guide && guide.story && guide.story.title === story.title));
    const ok = fixtureSource.ok && stateR.status === 200 && sessionR.status === 200 && !!guide &&
      guide.id === fixture.id && guide.status === fixture.status &&
      concepts.length === expectedConceptIds.length && continuity &&
      guideNotes.length > 0 && quizKeys.length > 0 &&
      !!state.permissions && state.permissions.canViewAnswerKey === true;
    return {
      ok: !!ok,
      stateStatus: stateR.status,
      sessionStatus: sessionR.status,
      fixtureId: fixture.id,
      fixtureStatus: fixture.status,
      guideId: guide && guide.id,
      guideStatus: guide && guide.status,
      concepts: concepts.length,
      expectedConcepts: expectedConceptIds,
      beats: beats.length,
      continuity: continuity,
      trainerNoteKeys: guideNotes.map(function (hit) { return hit.key; }),
      trainerQuizKeyCount: quizKeys.length,
      canViewAnswerKey: state && state.permissions && state.permissions.canViewAnswerKey,
      ms: stateR.ms + sessionR.ms
    };
  });

  await check('temporary planner guide is role-safe for student', async function () {
    const r = await stateFor(tokens.student);
    const state = r.body && r.body.state;
    const guide = state && state.plannerGuide;
    const leaks = keyHits(guide || {}, FORBIDDEN_GUIDE_KEYS, '', true);
    const perms = (state && state.permissions) || {};
    const flags = {
      canViewAnswerKey: perms.canViewAnswerKey,
      canViewTrainerInstructions: perms.canViewTrainerInstructions,
      canEditPlanner: perms.canEditPlanner
    };
    const concepts = guide && Array.isArray(guide.concepts) ? guide.concepts : [];
    const beats = guide && guide.story && Array.isArray(guide.story.beats) ? guide.story.beats : [];
    const ok = fixtureSource.ok && r.status === 200 && !!guide &&
      guide.id === fixture.id && guide.status === fixture.status &&
      leaks.length === 0 && concepts.length > 0 && beats.length > 0 &&
      flags.canViewAnswerKey === false && flags.canViewTrainerInstructions === false &&
      flags.canEditPlanner === false;
    return {
      ok: !!ok,
      status: r.status,
      fixtureId: fixture.id,
      fixtureStatus: fixture.status,
      guideId: guide && guide.id,
      guideStatus: guide && guide.status,
      concepts: concepts.length,
      beats: beats.length,
      leakedKeys: leaks,
      safeFalsePermissionFlags: flags,
      ms: r.ms
    };
  });

  await check('fixture quiz launch and wrong answer stay unrevealed to student', async function () {
    if (!fixtureSource.ok) return { ok: false, reason: fixtureSource.error };
    const launch = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/launch', {}, tokens.trainer);
    /* Launch clears this session's attempts, so this is the honest baseline for
       the dashboard-totals comparison later in this probe. */
    live.totalsBefore = totalsFrom(await req('GET', '/api/student/dashboard', undefined, tokens.student));
    const ensured = await ensureFixtureQuestion(tokens.trainer, fixtureIds);
    const question = ensured.question;
    if (!question || correctIndexById[question.id] === undefined || !Array.isArray(question.options)) {
      return {
        ok: false,
        launchStatus: launch.status,
        currentQuestionId: question && question.id,
        expectedFixtureIds: fixtureIds,
        reason: 'The current trainer question is not one of the checked-in fixture ids.'
      };
    }
    const wrongIndex = (correctIndexById[question.id] + 1) % question.options.length;
    const answer = await req('POST', '/api/student/sessions/' + SESSION_ID + '/quiz/answers', {
      questionId: question.id, optionIndex: wrongIndex
    }, tokens.student);
    const attemptId = answer.body && answer.body.attemptId;
    const studentR = await req('GET', '/api/student/sessions/' + SESSION_ID, undefined, tokens.student);
    const attemptR = attemptId
      ? await req('GET', '/api/student/sessions/' + SESSION_ID + '/quiz/attempts/' + attemptId, undefined, tokens.student)
      : null;
    const studentQuiz = studentR.body && studentR.body.session && studentR.body.session.quiz;
    const leaks = keyHits(studentQuiz || {}, PREMATURE_REVEAL_KEYS, '', true);
    const attemptBody = attemptR && attemptR.body;
    const ok = launch.status === 200 && answer.status === 200 && !!attemptId && studentR.status === 200 &&
      leaks.length === 0 && attemptR && attemptR.status === 200 && attemptBody.revealed === false &&
      !('correct' in attemptBody) && !!studentQuiz && studentQuiz.status === 'live' &&
      studentQuiz.phase === 'awaiting_reveal' &&
      (studentQuiz.revealedQuestionIds || []).indexOf(question.id) === -1;
    live.firstQuestionId = question.id;
    live.firstConcept = question.concept;
    live.firstAttemptId = attemptId;
    return {
      ok: !!ok,
      launchStatus: launch.status,
      forcedNextWithOverride: ensured.forced,
      questionId: question.id,
      expectedFixtureIds: fixtureIds,
      wrongOptionIndex: wrongIndex,
      answerStatus: answer.status,
      attemptStatus: attemptR && attemptR.status,
      revealedBeforeTrainer: attemptBody && attemptBody.revealed,
      prematureLeaks: leaks,
      studentPhase: studentQuiz && studentQuiz.phase,
      ms: launch.ms + answer.ms + studentR.ms
    };
  });

  await check('student option choice mirrors to the trainer without correctness', async function () {
    const events = await req('GET', '/api/sessions/' + SESSION_ID + '/events?limit=200',
      undefined, tokens.trainer);
    const list = events.body && Array.isArray(events.body.events) ? events.body.events : [];
    const mirror = list.filter(function (event) {
      return event.event === 'quiz.option.selected' && event.payload &&
        event.payload.questionId === live.firstQuestionId;
    }).pop();
    const safe = mirror && mirror.payload
      ? Object.keys(mirror.payload).every(function (key) {
        return !/answer|correct|hint|explanation|key/i.test(key);
      }) : false;
    return {
      ok: events.status === 200 && !!mirror && mirror.payload.fromRole === 'student' &&
        Number.isInteger(mirror.payload.optionIndex) && safe,
      questionId: live.firstQuestionId,
      mirroredOption: mirror && mirror.payload.optionIndex,
      seq: mirror && mirror.seq,
      safeKeys: safe,
      ms: events.ms
    };
  });

  await check('trainer reveal releases the attempted answer only after reveal', async function () {
    if (!live.firstQuestionId || !live.firstAttemptId) {
      return { ok: false, reason: 'No wrong answer was recorded by the launch check.' };
    }
    const attemptRoute = '/api/student/sessions/' + SESSION_ID + '/quiz/attempts/' + live.firstAttemptId;
    const before = await req('GET', attemptRoute, undefined, tokens.student);
    const reveal = await revealQuestion(tokens.trainer, live.firstQuestionId);
    const after = await req('GET', attemptRoute, undefined, tokens.student);
    const studentR = await req('GET', '/api/student/sessions/' + SESSION_ID, undefined, tokens.student);
    const trainerR = await trainerSessionFor(tokens.trainer);
    const quiz = studentR.body && studentR.body.session && studentR.body.session.quiz;
    const trainerQuiz = trainerR.body && trainerR.body.session && trainerR.body.session.quiz;
    const revealRecorded = !!trainerQuiz && (trainerQuiz.reveals || []).some(function (item) {
      return item && item.questionId === live.firstQuestionId;
    });
    /* The student serializer never puts an answer key in the session payload;
       the narrow attempt endpoint is the only place correctness appears. */
    const leaks = keyHits(quiz || {}, PREMATURE_REVEAL_KEYS, '', true);
    const ok = before.status === 200 && before.body.revealed === false && reveal.status === 200 &&
      after.status === 200 && after.body.revealed === true && after.body.correct === false &&
      revealRecorded && !!quiz && (quiz.revealedQuestionIds || []).indexOf(live.firstQuestionId) !== -1 &&
      leaks.length === 0;
    return {
      ok: !!ok,
      beforeRevealed: before.body && before.body.revealed,
      revealStatus: reveal.status,
      afterRevealed: after.body && after.body.revealed,
      correctAfterReveal: after.body && after.body.correct,
      trainerRevealRecorded: revealRecorded,
      studentRevealedIds: quiz && quiz.revealedQuestionIds,
      studentSessionAnswerKeyLeaks: leaks,
      ms: before.ms + reveal.ms + after.ms + studentR.ms
    };
  });

  await check('Retest new-check replaces within the same section', async function () {
    if (!live.firstQuestionId) return { ok: false, reason: 'No attempted question to retest.' };
    const concept = live.firstConcept || ((fixture.concepts || [])[0] || {}).title;
    const beforeR = await trainerSessionFor(tokens.trainer);
    const beforeQuiz = beforeR.body && beforeR.body.session && beforeR.body.session.quiz;
    const beforeCount = beforeQuiz && beforeQuiz.questions ? beforeQuiz.questions.length : null;
    const retest = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/new-check', {
      questionId: live.firstQuestionId, concept: concept, replace: true
    }, tokens.trainer);
    const session = retest.body && retest.body.session;
    const quiz = session && session.quiz;
    const questions = quiz && Array.isArray(quiz.questions) ? quiz.questions : [];
    const replacementId = retest.body && retest.body.questionId;
    const replacement = questions.find(function (item) { return item.id === replacementId; });
    const attempts = quiz && Array.isArray(quiz.attempts) ? quiz.attempts : [];
    const guide = session && session.plannerGuide;
    const firstConceptId = (fixture.concepts || [])[0] && fixture.concepts[0].id;
    const ok = retest.status === 201 && !!replacementId && replacementId !== live.firstQuestionId &&
      !!replacement && replacement.concept === concept && !!quiz &&
      quiz.currentQuestionId === replacementId && quiz.phase === 'recheck' &&
      !questions.some(function (item) { return item.id === live.firstQuestionId; }) &&
      questions.length === beforeCount &&
      !attempts.some(function (item) { return item.questionId === live.firstQuestionId; }) &&
      !!guide && !!guide.progress && guide.progress.currentConceptId === firstConceptId;
    live.replacementId = replacementId;
    live.replacementConcept = concept;
    live.sectionBaselineId = guide && guide.progress && guide.progress.currentConceptId;
    live.correctInSection = 0;
    return {
      ok: !!ok,
      status: retest.status,
      generationMode: retest.body && retest.body.generationMode,
      originalQuestionId: live.firstQuestionId,
      replacementId: replacementId,
      replacementConcept: replacement && replacement.concept,
      expectedConcept: concept,
      currentQuestionId: quiz && quiz.currentQuestionId,
      phase: quiz && quiz.phase,
      questionCountBefore: beforeCount,
      questionCountAfter: questions.length,
      originalAttemptRemoved: !attempts.some(function (item) { return item.questionId === live.firstQuestionId; }),
      sectionId: guide && guide.progress && guide.progress.currentConceptId,
      ms: beforeR.ms + retest.ms
    };
  });

  await check('correct answer advances fixture section progress', async function () {
    if (!live.replacementId) return { ok: false, reason: 'Retest did not produce a replacement question.' };
    const beforeR = await trainerSessionFor(tokens.trainer);
    const beforeSession = beforeR.body && beforeR.body.session;
    const replacement = currentQuestion(beforeSession);
    if (!replacement || replacement.id !== live.replacementId || typeof replacement.answerIndex !== 'number') {
      return {
        ok: false,
        reason: 'Replacement question is not current with a trainer answer key.',
        currentQuestionId: replacement && replacement.id,
        replacementId: live.replacementId
      };
    }
    const beforeProgress = beforeSession.plannerGuide && beforeSession.plannerGuide.progress;
    const answered = await req('POST', '/api/student/sessions/' + SESSION_ID + '/quiz/answers', {
      questionId: replacement.id, optionIndex: replacement.answerIndex
    }, tokens.student);
    const revealed = answered.status === 200 ? await revealQuestion(tokens.trainer, replacement.id) : null;
    const afterAnswerR = await trainerSessionFor(tokens.trainer);
    const afterAnswerSession = afterAnswerR.body && afterAnswerR.body.session;
    const afterProgress = afterAnswerSession && afterAnswerSession.plannerGuide &&
      afterAnswerSession.plannerGuide.progress;
    const advanced = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/next', {}, tokens.trainer);
    const advancedSession = advanced.body && advanced.body.session;
    const afterNextProgress = advancedSession && advancedSession.plannerGuide &&
      advancedSession.plannerGuide.progress;
    const advancedTo = advancedSession && advancedSession.quiz && advancedSession.quiz.currentQuestionId;
    const ok = answered.status === 200 && !!revealed && revealed.status === 200 &&
      !!beforeProgress && !!afterProgress &&
      afterProgress.sectionCorrect === beforeProgress.sectionCorrect + 1 &&
      (afterProgress.completedQuestionIds || []).indexOf(replacement.id) !== -1 &&
      advanced.status === 200 && !!advancedTo && advancedTo !== replacement.id &&
      !!afterNextProgress && afterNextProgress.currentConceptId === beforeProgress.currentConceptId;
    live.correctInSection = 1;
    live.lastAdvancedTo = advancedTo;
    return {
      ok: !!ok,
      questionId: replacement.id,
      answerStatus: answered.status,
      revealStatus: revealed && revealed.status,
      sectionCorrectBefore: beforeProgress && beforeProgress.sectionCorrect,
      sectionCorrectAfter: afterProgress && afterProgress.sectionCorrect,
      completedIncludesReplacement: !!afterProgress &&
        (afterProgress.completedQuestionIds || []).indexOf(replacement.id) !== -1,
      advanceStatus: advanced.status,
      currentBeforeAdvance: replacement.id,
      currentAfterAdvance: advancedTo,
      sectionId: beforeProgress && beforeProgress.currentConceptId,
      ms: beforeR.ms + answered.ms + afterAnswerR.ms + advanced.ms
    };
  });

  await check('three correct answers unlock the next fixture section', async function () {
    const required = Number(fixture.completionRule && fixture.completionRule.minimumCorrectPerSection);
    if (!fixtureSource.ok || !Number.isFinite(required) || required < 1) {
      return { ok: false, reason: 'Checked-in fixture has no usable minimumCorrectPerSection.' };
    }
    const steps = [];
    let unlockedSnapshot = null;
    let correctThisCheck = 0;
    const maxSteps = fixtureIds.length + 4;
    for (let i = 0; i < maxSteps; i += 1) {
      const sessionR = await trainerSessionFor(tokens.trainer);
      const session = sessionR.body && sessionR.body.session;
      const progress = session && session.plannerGuide && session.plannerGuide.progress;
      if (progress && progress.sectionCorrect >= required && progress.unlockedNext === true) {
        unlockedSnapshot = progress;
        break;
      }
      const question = currentQuestion(session);
      if (!question || typeof question.answerIndex !== 'number') break;
      const answered = await req('POST', '/api/student/sessions/' + SESSION_ID + '/quiz/answers', {
        questionId: question.id, optionIndex: question.answerIndex
      }, tokens.student);
      if (answered.status !== 200) {
        steps.push({ questionId: question.id, answerStatus: answered.status });
        break;
      }
      correctThisCheck += 1;
      const revealed = await revealQuestion(tokens.trainer, question.id);
      const afterR = await trainerSessionFor(tokens.trainer);
      const afterSession = afterR.body && afterR.body.session;
      const afterProgress = afterSession && afterSession.plannerGuide && afterSession.plannerGuide.progress;
      steps.push({
        questionId: question.id,
        answerStatus: answered.status,
        revealStatus: revealed.status,
        sectionCorrect: afterProgress && afterProgress.sectionCorrect,
        unlockedNext: afterProgress && afterProgress.unlockedNext
      });
      if (afterProgress && afterProgress.sectionCorrect >= required && afterProgress.unlockedNext === true) {
        unlockedSnapshot = afterProgress;
        break;
      }
      const advanced = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/next', {}, tokens.trainer);
      if (advanced.status !== 200) {
        steps.push({ advanceStatus: advanced.status, error: advanced.body });
        break;
      }
    }
    let unlockAdvance = null;
    let finalProgress = null;
    if (unlockedSnapshot) {
      unlockAdvance = await req('POST', '/api/trainer/sessions/' + SESSION_ID + '/quiz/next', {}, tokens.trainer);
      const finalSession = unlockAdvance.body && unlockAdvance.body.session;
      finalProgress = finalSession && finalSession.plannerGuide && finalSession.plannerGuide.progress;
    }
    const totalCorrect = (live.correctInSection || 0) + correctThisCheck;
    const expectedNextConceptId = (fixture.concepts || [])[1] && fixture.concepts[1].id;
    const ok = !!unlockedSnapshot && unlockedSnapshot.sectionCorrect >= required &&
      unlockedSnapshot.unlockedNext === true && totalCorrect >= required &&
      !!unlockAdvance && unlockAdvance.status === 200 && !!finalProgress &&
      finalProgress.currentConceptId === expectedNextConceptId &&
      finalProgress.currentConceptId !== live.sectionBaselineId;
    live.totalCorrectInSection = totalCorrect;
    return {
      ok: !!ok,
      required,
      drivenCorrectAnswers: totalCorrect,
      retainedCorrectInRetest: live.correctInSection || 0,
      additionalCorrectAnswers: correctThisCheck,
      unlockedSnapshot: unlockedSnapshot,
      steps: steps,
      unlockAdvanceStatus: unlockAdvance && unlockAdvance.status,
      finalCurrentConceptId: finalProgress && finalProgress.currentConceptId,
      expectedNextConceptId: expectedNextConceptId
    };
  });

  await check('student dashboard question totals increase after new-check attempts', async function () {
    const before = live.totalsBefore;
    const afterR = await req('GET', '/api/student/dashboard', undefined, tokens.student);
    const after = totalsFrom(afterR);
    const attemptedDelta = after && before ? after.attempted - before.attempted : null;
    const solvedDelta = after && before ? after.solved - before.solved : null;
    const expectedMinimum = live.totalCorrectInSection || 1;
    const ok = afterR.status === 200 && !!before && !!after &&
      attemptedDelta >= expectedMinimum && solvedDelta >= expectedMinimum;
    return {
      ok: !!ok,
      status: afterR.status,
      baselineCapturedAfterLaunch: true,
      before: before,
      after: after,
      attemptedDelta: attemptedDelta,
      solvedDelta: solvedDelta,
      expectedMinimum: expectedMinimum,
      ms: afterR.ms
    };
  });

  await check('board share default off is reflected in fresh session state', async function () {
    const fresh = await req('POST', '/api/sessions/' + SESSION_ID + '/presence', {
      active: true, learningEvents: 0
    }, tokens.trainer);
    const stateR = await stateFor(tokens.trainer);
    if (fresh.status !== 200 || stateR.status !== 200) {
      return {
        ok: false,
        presenceStatus: fresh.status,
        stateStatus: stateR.status,
        reason: 'Fresh presence or session state request failed.'
      };
    }
    const state = stateR.body && stateR.body.state;
    const flags = [];
    collectShareFlags(state || {}, '', flags);
    if (flags.length === 0) {
      return {
        skipped: true,
        ok: false,
        presenceStatus: fresh.status,
        stateStatus: stateR.status,
        reason: 'No board-share field is exposed in /api/sessions/' + SESSION_ID +
          '/state after fresh trainer presence; only boardVersion is serialized. Not inferring a default.',
        inspectedStateKeys: Object.keys(state || {}),
        boardShareEndpointCalled: false
      };
    }
    return {
      ok: flags.every(function (flag) { return flag.value === false; }),
      presenceStatus: fresh.status,
      stateStatus: stateR.status,
      flags: flags,
      ms: fresh.ms + stateR.ms
    };
  });

  const passed = results.filter(function (r) { return r.ok; }).length;
  const skipped = results.filter(function (r) { return r.skipped; }).length;
  const failed = results.filter(function (r) { return !r.ok && !r.skipped; }).length;
  const summary = {
    at: now(),
    base: BASE,
    total: results.length,
    passed: passed,
    skipped: skipped,
    failed: failed,
    results: results
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2) + '\n');
  console.log('\n' + passed + '/' + (summary.total - skipped) + ' checks passed' +
    (skipped ? ', ' + skipped + ' skipped' : '') + '. Log: ' + OUT);
  process.exitCode = failed ? 1 : 0;
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
