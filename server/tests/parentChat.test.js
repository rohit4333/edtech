/* Private parent↔trainer human chat contract.
   Boots the real Express app and exercises role scoping, per-recipient unread
   state, DLP blocking, founder-only flags and realtime silence. No AI, no
   external network and no database migration are involved. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app');
const db = require('../db');
const dlp = require('../services/parentChatDlp');
const service = require('../services/parentChatService');

const password = process.env.DEMO_PASSWORD || 'mathify-demo';
const CHILD = 'usr_student_001';
const FOREIGN_CHILD = 'usr_student_002';
const FORBIDDEN_KEYS = [
  'raw', 'rawBody', 'rawText', 'blockedText', 'original', 'originalText',
  'passwordHash', 'password', 'email', 'phone', 'parentPhone',
  'answerKey', 'correctAnswer', 'trainerNotes', 'trainerInstructions',
  'hint', 'explanation', 'groupId', 'batchPause', 'participants'
];

let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function deepEqual(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label);
  checks += 1;
}
function absentKeys(payload, label) {
  const text = JSON.stringify(payload);
  FORBIDDEN_KEYS.forEach(function (key) {
    equal(text.indexOf('"' + key + '"'), -1, label + ' has no ' + key);
  });
}

function ids(messages) {
  return messages.map(function (message) { return message.id; });
}

async function main() {
  /* DLP regex contract: every required category is detected, safe text is not. */
  const samples = [
    ['EMAIL_ADDRESS', 'Please write to me at priya.sharma@example.com'],
    ['URL_LINK', 'Open www.example.com/notes for the worksheet'],
    ['PHONE_NUMBER', 'Call +91 98765 43210 after class'],
    ['PHONE_NUMBER', 'My number is 9876543210'],
    ['SOCIAL_HANDLE', 'Follow @priya_study_7 there'],
    ['SOCIAL_PLATFORM', 'Message me on WhatsApp instead'],
    ['CONTACT_SCHEME', 'Use mailto:study-notes instead']
  ];
  samples.forEach(function (entry) {
    const decision = dlp.inspect(entry[1]);
    equal(decision.blocked, true, 'DLP blocks ' + entry[0] + ': ' + entry[1]);
    equal(decision.reason, entry[0], 'DLP reason is ' + entry[0]);
    ok(dlp.REGEXES[entry[0]].some(function (regex) { return regex.test(entry[1]); }),
      'a stateless regex detects ' + entry[0]);
  });
  equal(dlp.inspect('Could we go over ratios once more?').blocked, false,
    'an ordinary school message passes DLP');
  ok(dlp.maskPhone('+91 98765 43210').indexOf('9876543210') === -1,
    'phone masking never reveals the full number');
  ok(dlp.maskPreview('EMAIL_ADDRESS', 'priya.sharma@example.com').indexOf('example.com') === -1,
    'email masking never reveals the domain');
  ok(dlp.maskPreview('SOCIAL_HANDLE', '@priya_study_7').indexOf('priya_study_7') === -1,
    'handle masking never reveals the handle');

  /* No new SQL migration: all three collections use the service-only store. */
  ['listParentChatMessages', 'insertParentChatMessage', 'listParentChatFlags',
    'insertParentChatFlag', 'findParentChatRead', 'saveParentChatRead'].forEach(function (name) {
    equal(typeof db[name], 'function', 'db facade exposes ' + name);
  });
  equal(service.NEUTRAL_BLOCK_MESSAGE, dlp.NEUTRAL_BLOCK_MESSAGE,
    'the service returns the neutral block message');
  equal(fs.readdirSync(path.join(__dirname, '..', 'migrations'))
    .filter(function (name) { return /^0005/.test(name); }).length, 0,
  'no parent-chat SQL migration was added');
  const persistenceSql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '0003_live_persistence.sql'), 'utf8');
  ok(/revoke all on public\.mathify_records from public, anon, authenticated/i.test(persistenceSql),
    'browser Data API roles have no access to mathify_records');
  ok(/grant all on public\.mathify_records to service_role/i.test(persistenceSql),
    'only the service role writes mathify_records');

  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function call(route, options) {
    const response = await fetch(base + route, options);
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch (error) { body = text; }
    return { status: response.status, body: body, text: text };
  }

  function request(method, route, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return call(route, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  try {
    async function login(email) {
      const response = await request('POST', '/api/auth/login', {
        email: email, password: password
      });
      equal(response.status, 200, 'demo login succeeds for ' + email);
      return response.body.token;
    }
    const parent = await login('parent@mathify.app');
    const trainer = await login('trainer@mathify.app');
    const student = await login('student@mathify.app');
    const founder = await login('founder@mathify.app');

    const parentMe = await request('GET', '/api/auth/me', undefined, parent);
    deepEqual(Object.keys(parentMe.body.user).sort(), ['id', 'name', 'role'],
      'parent identity is name/id/role only');
    equal(parentMe.body.user.role, 'parent', 'the demo parent role is active');
    equal(parentMe.body.user.childId, undefined, 'parent identity hides the child link');
    equal(parentMe.body.user.email, undefined, 'parent identity hides email');
    const demoRoles = await call('/api/auth/demo');
    ok(demoRoles.body.accounts.some(function (account) { return account.role === 'parent'; }),
      'demo account discovery advertises the parent role');

    /* Role scoping: only the linked parent and assigned trainer may use a
       thread; the founder audits but cannot write; students have no access. */
    const anonymousThread = await call('/api/parent-chat/thread/' + CHILD);
    equal(anonymousThread.status, 401, 'anonymous thread read is rejected');
    const studentThread = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, student);
    equal(studentThread.status, 403, 'a student cannot open a parent thread');
    const foreignParent = await request('GET', '/api/parent-chat/thread/' + FOREIGN_CHILD, undefined, parent);
    equal(foreignParent.status, 403, 'a parent cannot read another child thread');
    const foreignTrainer = await request('GET', '/api/parent-chat/thread/' + FOREIGN_CHILD, undefined, trainer);
    equal(foreignTrainer.status, 403, 'a trainer cannot read an unassigned thread');
    const foreignSend = await request('POST', '/api/parent-chat/messages', {
      studentId: FOREIGN_CHILD, body: 'Hello there'
    }, parent);
    equal(foreignSend.status, 403, 'a parent cannot send into another child thread');
    const foreignTrainerSend = await request('POST', '/api/parent-chat/messages', {
      studentId: FOREIGN_CHILD, body: 'Hello there'
    }, trainer);
    equal(foreignTrainerSend.status, 403, 'a trainer cannot send into an unassigned thread');
    const founderSend = await request('POST', '/api/parent-chat/thread/' + CHILD + '/messages', {
      body: 'Audit note'
    }, founder);
    equal(founderSend.status, 403, 'founder access to the thread is read-only');

    const parentBefore = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, parent);
    const trainerBefore = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, trainer);
    const founderBefore = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, founder);
    equal(parentBefore.status, 200, 'parent can read the linked child thread');
    equal(trainerBefore.status, 200, 'assigned trainer can read the thread');
    equal(founderBefore.status, 200, 'founder can audit the thread');
    equal(parentBefore.body.threadId, CHILD, 'thread id is the linked child');
    equal(parentBefore.body.studentId, CHILD, 'thread student id is the linked child');
    const baselineMessages = parentBefore.body.messages.length;
    const parentUnreadBefore = parentBefore.body.unreadCount;
    const trainerUnreadBefore = trainerBefore.body.unreadCount;
    absentKeys(parentBefore.body, 'parent thread');

    /* Safe human messages reach both inboxes and increment only the recipient. */
    const first = await request('POST', '/api/parent-chat/thread/' + CHILD + '/messages', {
      body: 'Could we go over ratios once more?'
    }, parent);
    equal(first.status, 200, 'a safe parent message is delivered');
    deepEqual(Object.keys(first.body.message).sort(),
      ['body', 'createdAt', 'id', 'senderId', 'senderRole', 'studentId', 'threadId'],
    'delivered message keys are an explicit allowlist');
    equal(first.body.message.senderRole, 'parent', 'the sender role is recorded');
    equal(first.body.message.body, 'Could we go over ratios once more?', 'safe body is preserved');
    absentKeys(first.body, 'delivered message');
    const parentMid = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, parent);
    const trainerMid = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, trainer);
    equal(parentMid.body.messages.length, baselineMessages + 1, 'parent inbox has the new message');
    equal(trainerMid.body.messages.length, baselineMessages + 1, 'trainer inbox has the new message');
    ok(ids(trainerMid.body.messages).indexOf(first.body.message.id) !== -1,
      'the same message id is visible to the trainer');
    equal(trainerMid.body.unreadCount, trainerUnreadBefore + 1, 'trainer unread count increments');
    equal(parentMid.body.unreadCount, parentUnreadBefore, 'sender unread count does not increment');
    const trainerUnread = await request('GET', '/api/parent-chat/unread', undefined, trainer);
    ok(trainerUnread.body.threads.some(function (thread) {
      return thread.studentId === CHILD && thread.unreadCount === trainerUnreadBefore + 1;
    }), 'trainer dashboard summary carries the unread thread');

    const reply = await request('POST', '/api/parent-chat/threads/' + CHILD + '/messages', {
      text: 'Yes — let us start with the bar model.'
    }, trainer);
    equal(reply.status, 200, 'a safe trainer reply is delivered');
    equal(reply.body.message.senderRole, 'trainer', 'the reply sender role is recorded');
    const parentAfterReply = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, parent);
    const trainerAfterReply = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, trainer);
    equal(parentAfterReply.body.unreadCount, parentUnreadBefore + 1, 'parent unread count increments');
    equal(trainerAfterReply.body.unreadCount, trainerUnreadBefore + 1, 'own unread count stays unchanged');
    ok(ids(parentAfterReply.body.messages).indexOf(reply.body.message.id) !== -1,
      'the reply reaches the parent inbox');

    /* Mark-read is per recipient and clears only the caller's own counter. */
    const parentRead = await request('POST', '/api/parent-chat/thread/' + CHILD + '/read', {}, parent);
    equal(parentRead.body.unreadCount, 0, 'parent mark-read clears the parent counter');
    const parentAfterRead = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, parent);
    const trainerAfterParentRead = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, trainer);
    equal(parentAfterRead.body.unreadCount, 0, 'parent thread shows zero unread after read');
    equal(trainerAfterParentRead.body.unreadCount, trainerUnreadBefore + 1,
      'parent mark-read does not clear trainer unread');
    const trainerRead = await request('POST', '/api/parent-chat/threads/' + CHILD + '/mark-read', {}, trainer);
    equal(trainerRead.body.unreadCount, 0, 'trainer mark-read clears the trainer counter');
    const trainerAfterRead = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, trainer);
    equal(trainerAfterRead.body.unreadCount, 0, 'trainer thread shows zero unread after read');

    /* Blocked sends: phone, email and social handle. Nothing is delivered,
       echoed, stored or published; only a masked founder flag is written. */
    const blockedSamples = [
      ['PHONE_NUMBER', 'Please call +91 98765 43210 about the lesson.', '9876543210', parent],
      ['EMAIL_ADDRESS', 'Write to priya.sharma@example.com instead.', 'priya.sharma@example.com', trainer],
      ['SOCIAL_HANDLE', 'Continue at @priya_study_7.', '@priya_study_7', parent]
    ];
    for (let index = 0; index < blockedSamples.length; index += 1) {
      const entry = blockedSamples[index];
      const reasonCode = entry[0];
      const raw = entry[1];
      const secret = entry[2];
      const token = entry[3];
      const flagsBefore = await request('GET', '/api/parent-chat/flags', undefined, founder);
      const inboxBefore = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, parent);
      const peerInboxBefore = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, trainer);
      const realtimeBefore = await request('GET', '/api/realtime/log?limit=50', undefined, founder);

      const blocked = await request('POST', '/api/parent-chat/thread/' + CHILD + '/messages', {
        body: raw
      }, token);
      equal(blocked.status, 422, reasonCode + ' message is refused with 422');
      equal(blocked.body.error, 'CONTENT_BLOCKED', reasonCode + ' uses CONTENT_BLOCKED');
      equal(blocked.body.message, dlp.NEUTRAL_BLOCK_MESSAGE,
        reasonCode + ' response uses the neutral block message');
      equal(blocked.text.indexOf(secret), -1, reasonCode + ' is not echoed to the sender');
      equal(blocked.text.indexOf(raw), -1, reasonCode + ' raw text is not echoed at all');
      absentKeys(blocked.body, 'blocked response');

      const inboxAfter = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, parent);
      const peerInboxAfter = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, trainer);
      deepEqual(ids(inboxAfter.body.messages), ids(inboxBefore.body.messages),
        reasonCode + ' is absent from the parent inbox');
      deepEqual(ids(peerInboxAfter.body.messages), ids(peerInboxBefore.body.messages),
        reasonCode + ' is absent from the trainer inbox');
      equal(inboxAfter.body.unreadCount, inboxBefore.body.unreadCount,
        reasonCode + ' does not change parent unread count');
      equal(peerInboxAfter.body.unreadCount, peerInboxBefore.body.unreadCount,
        reasonCode + ' does not change trainer unread count');
      const realtimeAfter = await request('GET', '/api/realtime/log?limit=50', undefined, founder);
      deepEqual(realtimeAfter.body.events, realtimeBefore.body.events,
        reasonCode + ' publishes nothing to realtime');

      const flagsAfter = await request('GET', '/api/parent-chat/flags', undefined, founder);
      equal(flagsAfter.status, 200, 'founder can read ' + reasonCode + ' flags');
      equal(flagsAfter.body.flags.length, flagsBefore.body.flags.length + 1,
        reasonCode + ' writes exactly one founder flag');
      const flag = flagsAfter.body.flags[0];
      deepEqual(Object.keys(flag).sort(),
        ['actorId', 'actorRole', 'createdAt', 'id', 'maskedPreview', 'reason',
          'reasonCode', 'reasonLabel', 'reasons', 'studentId', 'threadId'],
      reasonCode + ' flag keys are an explicit allowlist');
      equal(flag.actorId, token === parent ? 'usr_parent_001' : 'usr_trainer_001',
        reasonCode + ' flag records the acting id');
      equal(flag.actorRole, token === parent ? 'parent' : 'trainer',
        reasonCode + ' flag records the acting role');
      equal(flag.reasonCode, reasonCode, reasonCode + ' flag carries the reason code');
      equal(flag.threadId, CHILD, reasonCode + ' flag is scoped to the child thread');
      equal(typeof flag.createdAt, 'string', reasonCode + ' flag has a timestamp');
      ok(flag.maskedPreview.length > 0, reasonCode + ' flag has a masked preview');
      equal(flag.maskedPreview.indexOf(secret), -1, reasonCode + ' preview hides the raw detail');
      equal(flag.maskedPreview.indexOf(raw), -1, reasonCode + ' preview hides the raw message');
      absentKeys(flag, reasonCode + ' flag');

      const parentFlags = await request('GET', '/api/parent-chat/flags', undefined, parent);
      const trainerFlags = await request('GET', '/api/parent-chat/privacy-flags', undefined, trainer);
      equal(parentFlags.status, 403, 'parent cannot read DLP flags');
      equal(trainerFlags.status, 403, 'trainer cannot read DLP flags');
    }

    /* A final delivery after the blocked runs confirms the thread is still
       usable and no blocked payload leaked into any response. */
    const finalMessage = await request('POST', '/api/parent-chat/messages', {
      studentId: CHILD, message: 'Thank you — see you in class.'
    }, parent);
    equal(finalMessage.status, 200, 'a safe message still delivers after blocks');
    const finalThread = await request('GET', '/api/parent-chat/thread/' + CHILD, undefined, founder);
    equal(finalThread.status, 200, 'founder can audit the final thread');
    absentKeys(finalThread.body, 'final founder thread');
    equal(finalThread.text.indexOf('CONTENT_BLOCKED'), -1, 'founder thread has no blocked payload');
    const finalFlags = await request('GET', '/api/parent-chat/flags?limit=10', undefined, founder);
    blockedSamples.forEach(function (entry) {
      equal(finalFlags.text.indexOf(entry[2]), -1, 'no flag leaks ' + entry[0] + ' detail');
    });

    console.log('parentChat: ' + checks + ' assertions passed');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
