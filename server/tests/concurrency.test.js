/* Parallel-room regression suite. Four trainers, four students and four
   simultaneous sessions must stay isolated: no shared event stream, no shared
   presence, no shared RTC channel, no double-booked calendar slot. Local-only;
   the production mock guard on db.insertSession is restored in finally. */

const assert = require('assert');
const db = require('../db');
const store = require('../db/mock');
const batches = require('../services/batchService');
const realtime = require('../realtime');
const presence = require('../services/presenceService');
const media = require('../services/mediaPermissionService');

let checks = 0;
function ok(value, label) { assert.strictEqual(Boolean(value), true, label); checks += 1; }
function equal(actual, expected, label) { assert.strictEqual(actual, expected, label); checks += 1; }

async function rejects(promise, code) {
  try {
    await promise;
    ok(false, 'expected ' + code);
  } catch (error) {
    equal(error.code, code, 'rejects with ' + code);
  }
}

function iso(daysFromNow, hour) {
  const date = new Date(Date.now() + daysFromNow * 86400000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function addUser(id, name, role, extra) {
  store.users.push(Object.assign({
    id: id,
    name: name,
    email: id + '@mathify.test',
    role: role,
    status: 'active',
    createdAt: new Date().toISOString()
  }, extra || {}));
}

async function main() {
  const trainers = [0, 1, 2, 3].map(function (index) { return 'usr_trainer_parallel_' + index; });
  const students = [0, 1, 2, 3].map(function (index) { return 'usr_student_parallel_' + index; });
  /* Batch allotment is founder-only work, so every parallel trainer fixture is
     already KYC-reviewed and granted before the race begins. */
  trainers.forEach(function (id, index) {
    addUser(id, 'Parallel Trainer ' + index, 'trainer', {
      accessGrantedAt: new Date().toISOString(),
      accessGrantedByRole: 'founder'
    });
    store.trainerOnboarding.push({ trainerId: id, status: 'submitted', createdAt: new Date().toISOString() });
  });
  students.forEach(function (id, index) { addUser(id, 'Parallel Student ' + index, 'student'); });

  const originalInsert = db.insertSession;
  const originalLog = console.log;
  console.log = function () {};
  /* In-memory insert mirrors the mock store without changing the production
     DATABASE_MODE guard. Channel assignment is set by batchService itself. */
  db.insertSession = function (record) {
    const stored = Object.assign({}, record);
    store.sessions.push(stored);
    return stored;
  };
  try {
    const duplicate = await Promise.all([
      batches.ensureForStudent(students[0]),
      batches.ensureForStudent(students[0])
    ]);
    equal(duplicate[0].id, duplicate[1].id, 'parallel logins reuse one deterministic batch id');
    equal(store.batches.filter(function (row) { return row.studentId === students[0]; }).length,
      1, 'a student never gets two batches');

    const batchIds = await Promise.all(students.map(function (id) { return batches.ensureForStudent(id); }));
    const starts = [9, 10, 11, 12].map(function (hour) { return iso(2, hour); });
    const allotted = await Promise.all(trainers.map(function (trainerId, index) {
      return batches.allot(batchIds[index].id, trainerId, [
        { startsAt: starts[index], title: 'Parallel room ' + index }
      ]);
    }));
    equal(allotted.length, 4, 'four independent allotments complete in parallel');

    const sessions = trainers.map(function (trainerId) {
      return db.listSessionsForUser({ id: trainerId, role: 'trainer' });
    });
    sessions.forEach(function (rows, index) {
      equal(rows.length, 1, 'trainer ' + index + ' owns exactly one booked session');
      equal(rows[0].studentId, students[index], 'the booked session keeps its own student');
      equal(rows[0].batchId, batchIds[index].id, 'the booked session keeps its own batch');
      ok(rows[0].rtc && rows[0].rtc.roomName === 'mathify-' + rows[0].id,
        'each room has a unique server-derived LiveKit room');
    });
    const rooms = sessions.map(function (rows) { return rows[0].rtc.roomName; });
    equal(new Set(rooms).size, 4, 'no two parallel rooms share a media room');

    /* Retrying the same allotment must not create a second booking. */
    await batches.allot(batchIds[0].id, trainers[0], [{ startsAt: starts[0] }]);
    equal(db.listSessionsForUser({ id: trainers[0], role: 'trainer' }).length, 1,
      'an allotment retry is idempotent');

    /* A different student cannot be booked into an already busy trainer slot. */
    const extraStudent = 'usr_student_parallel_extra';
    addUser(extraStudent, 'Extra Student', 'student');
    const extraBatch = await batches.ensureForStudent(extraStudent);
    await rejects(batches.allot(extraBatch.id, trainers[0], [
      { startsAt: iso(2, 9), durationMinutes: 50 }
    ]), 'BATCH_SLOT_CONFLICT');
    equal(db.listSessionsForUser({ id: trainers[0], role: 'trainer' }).length, 1,
      'a rejected conflict leaves no partial booking');

    /* Two concurrent allotments of one batch: exactly one trainer wins. */
    const contestedStudent = 'usr_student_parallel_contested';
    addUser(contestedStudent, 'Contested Student', 'student');
    const contested = await batches.ensureForStudent(contestedStudent);
    const race = await Promise.allSettled([
      batches.allot(contested.id, trainers[0], [{ startsAt: iso(2, 13) }]),
      batches.allot(contested.id, trainers[1], [{ startsAt: iso(2, 13) }])
    ]);
    equal(race.filter(function (result) { return result.status === 'fulfilled'; }).length, 1,
      'only one trainer wins a contested batch');
    equal(race.filter(function (result) {
      return result.status === 'rejected' && result.reason.code === 'BATCH_ALREADY_ALLOTTED';
    }).length, 1, 'the loser receives BATCH_ALREADY_ALLOTTED');

    /* Event streams are session-scoped even when every room publishes at once. */
    const sessionIds = sessions.map(function (rows) { return rows[0].id; });
    await Promise.all(sessionIds.map(function (sessionId, index) {
      return realtime.publish(sessionId, 'chat.sent', { index: index, text: 'message-' + index });
    }));
    for (let index = 0; index < sessionIds.length; index += 1) {
      const events = realtime.forSession(sessionIds[index], 0, 50);
      equal(events.length, 1, 'room ' + index + ' sees exactly its own event');
      equal(events[0].payload.text, 'message-' + index, 'room ' + index + ' payload is not cross-talk');
    }

    /* A burst in one room must not evict another room's unread events. */
    for (let index = 0; index < 210; index += 1) {
      realtime.publish(sessionIds[0], 'chat.sent', { burst: index });
    }
    equal(realtime.forSession(sessionIds[0], 0, 200).length, 200,
      'a busy room retains its newest 200 events');
    equal(realtime.forSession(sessionIds[1], 0, 50).length, 1,
      'a quiet room keeps its event during the burst');
    ok(realtime.forSession(sessionIds[1], 0, 50)[0].seq > 0, 'global seq stays monotonic');

    /* Presence evidence is replayed per session id. */
    const records = sessionIds.map(function (id) { return db.findSession(id); });
    await Promise.all(records.map(function (session, index) {
      return presence.heartbeat({ id: trainers[index], role: 'trainer' }, session, { active: true });
    }));
    await Promise.all(records.map(function (session, index) {
      return presence.heartbeat({ id: students[index], role: 'student' }, session, { active: true });
    }));
    for (let index = 0; index < records.length; index += 1) {
      const events = await db.listPresenceEvents(records[index].id);
      equal(events.length, 2, 'room ' + index + ' has only its own two presence events');
      const snapshot = await presence.compute(records[index], new Date().toISOString());
      equal(snapshot.sessionId, records[index].id, 'snapshot belongs to the requested room');
      equal(snapshot.participants.trainer.userId, trainers[index], 'trainer identity is isolated');
      equal(snapshot.participants.student.userId, students[index], 'student identity is isolated');
    }

    /* Concurrent permission writes to separate rooms must not overwrite. */
    await Promise.all(records.map(function (session, index) {
      return Promise.resolve(db.updateSession(session.id, function (current) {
        current.mediaPermissions = media.setPermission(current.mediaPermissions, index % 2 === 0);
        return current;
      }));
    }));
    for (let index = 0; index < records.length; index += 1) {
      const fresh = db.findSession(records[index].id);
      equal(fresh.mediaPermissions.studentCanToggleMedia, index % 2 === 0,
        'room ' + index + ' keeps its own media permission');
      equal(fresh.mediaPermissions.version, 1, 'room ' + index + ' has one version increment');
    }

  } finally {
    db.insertSession = originalInsert;
    console.log = originalLog;
  }
  console.log('concurrency: ' + checks + ' checks passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
