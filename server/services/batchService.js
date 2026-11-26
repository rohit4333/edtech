/* Enrollment batches. One student, one trainer, one batch. Allotting a batch
   books the trainer calendar; the student keeps the batch ID and the trainer
   sees name + batch ID only.

   Founder allotment is rare but must be atomic. A process-wide serial queue
   closes the local read/write race, deterministic record keys make retries
   idempotent across instances, and an overlap check prevents the same trainer
   or student from being booked into two sessions at the same time. */
const crypto = require('crypto');
const db = require('../db');
const trainerAccess = require('./trainerAccessService');

const DEFAULT_DURATION_MINUTES = 50;
const CLOSED_STATUSES = ['cancelled', 'canceled', 'ended', 'leave', 'no_show', 'noshow', 'no-show'];
const PER_SESSION_KEY = 'batch_student_';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function code() {
  return 'TB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

/* One tail promise for all batch writes. A rejected allotment must not jam the
   queue, so the tail always settles successfully. */
let queue = Promise.resolve();
function serialize(task) {
  const result = queue.then(task, task);
  queue = result.then(function () {}, function () {});
  return result;
}

function fail(codeValue, message, status) {
  const error = new Error(message);
  error.code = codeValue;
  error.status = status;
  return error;
}

function publicView(record, role) {
  if (!record) return null;
  const student = record.student || {};
  const trainer = record.trainer || {};
  const base = {
    id: record.id,
    code: record.code,
    status: record.status || 'allotted',
    trainerId: record.trainerId,
    studentName: text(student.name),
    trainerName: text(trainer.name),
    createdAt: record.createdAt
  };
  if (role === 'student') return { id: base.id, code: base.code, trainerName: base.trainerName };
  if (role === 'trainer') return base;
  return Object.assign({}, base, { studentId: record.studentId });
}

function ensureForStudent(studentId) {
  return serialize(function () {
    return Promise.resolve(db.findBatchForStudent(studentId)).then(function (existing) {
      if (existing) return publicView(existing, 'founder');
      return Promise.resolve(db.findUserById(studentId)).then(function (student) {
        if (!student || student.role !== 'student') {
          throw fail('BATCH_STUDENT_NOT_FOUND', 'Student not found.', 404);
        }
        /* Stable key: two login requests from the same student cannot create
           two batches, even on different API instances. */
        const record = {
          id: PER_SESSION_KEY + studentId,
          code: code(),
          studentId: studentId,
          student: { id: studentId, name: student.name },
          trainerId: null,
          trainer: null,
          status: 'unallotted',
          createdAt: new Date().toISOString()
        };
        return Promise.resolve(db.saveBatch(record)).then(function () {
          return publicView(record, 'founder');
        });
      });
    });
  });
}

function durationOf(session) {
  const minutes = Number(session && session.durationMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DURATION_MINUTES;
}

function intervalOf(session) {
  const raw = session && (session.scheduledAt || session.startsAt || session.startedAt || session.date);
  const start = Date.parse(raw);
  if (!Number.isFinite(start)) return null;
  return {
    id: session.id,
    key: session.batchSlotKey || null,
    start: start,
    end: start + durationOf(session) * 60000
  };
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function openIntervals(trainerId, studentId) {
  return Promise.all([
    db.listSessionsForUser({ id: trainerId, role: 'trainer' }),
    db.listSessionsForUser({ id: studentId, role: 'student' })
  ]).then(function (lists) {
    const rows = (lists[0] || []).concat(lists[1] || []);
    return rows.filter(function (session) {
      return CLOSED_STATUSES.indexOf(String((session && session.status) || '').toLowerCase()) === -1;
    }).map(intervalOf).filter(Boolean);
  });
}

function allot(batchRef, trainerId, slots) {
  return serialize(function () {
    return Promise.resolve(db.findBatch(batchRef)).then(function (batch) {
      if (!batch) throw fail('BATCH_NOT_FOUND', 'Batch not found.', 404);
      if (batch.trainerId && batch.trainerId !== trainerId) {
        throw fail('BATCH_ALREADY_ALLOTTED', 'Batch is already allotted to another trainer.', 409);
      }
      return Promise.resolve(db.findUserById(trainerId)).then(function (trainer) {
        if (!trainer || trainer.role !== 'trainer') {
          throw fail('BATCH_TRAINER_NOT_FOUND', 'Trainer not found.', 404);
        }
        /* Only a founder-approved trainer may receive an enrolled class. This
           keeps batch names, student identities and session slots hidden until
           KYC review and the founder's access grant are complete. */
        return Promise.resolve(trainerAccess.evaluate(trainer)).then(function (access) {
          if (!access.granted) {
            throw fail('TRAINER_ACCESS_PENDING', access.reason, 403);
          }
          const list = Array.isArray(slots) ? slots : [];
          if (!list.length) {
            throw fail('BATCH_SLOT_REQUIRED', 'At least one scheduled slot is required to allot a batch.', 422);
          }

          return openIntervals(trainerId, batch.studentId).then(function (booked) {
            /* Validate every slot before writing any of them. A conflict in the
               last slot must never leave earlier sessions half-booked. */
            const candidates = list.map(function (slot) {
              const startsAt = text(slot.startsAt || slot.startedAt || slot.scheduledAt);
              const start = Date.parse(startsAt);
              if (!startsAt || !Number.isFinite(start)) {
                throw fail('BATCH_SLOT_INVALID', 'Each slot needs a valid startsAt timestamp.', 422);
              }
              const minutes = Number(slot.durationMinutes);
              const durationMinutes = Number.isFinite(minutes) && minutes > 0
                ? minutes : DEFAULT_DURATION_MINUTES;
              return {
                startsAt: startsAt,
                title: text(slot.title) || 'Batch ' + batch.code + ' · 1-on-1 maths',
                durationMinutes: durationMinutes,
                key: batch.id + '|' + startsAt,
                start: start,
                end: start + durationMinutes * 60000
              };
            });

            const repeated = candidates.find(function (candidate) {
              return booked.some(function (row) { return row.key === candidate.key; });
            });
            if (repeated) {
              /* A retried founder request returns the original booking instead of
                 creating a second identical session. */
              return finish(batch, trainer, trainerId, [], booked, false);
            }

            const conflict = candidates.find(function (candidate) {
              return booked.some(function (row) { return overlaps(row, candidate); });
            });
            if (conflict) {
              throw fail(
                'BATCH_SLOT_CONFLICT',
                'The trainer or student already has a session at ' + conflict.startsAt + '.',
                409
              );
            }
            return finish(batch, trainer, trainerId, candidates, booked, true);
          });
        });
      });
    });
  });
}

function writeSlots(batch, trainerId, candidates) {
  return candidates.reduce(function (chain, candidate) {
    return chain.then(function (bookings) {
      const id = 'ses_batch_' + crypto.randomUUID();
      const session = {
        id: id,
        trainerId: trainerId,
        studentId: batch.studentId,
        batchId: batch.id,
        batchCode: batch.code,
        batchSlotKey: candidate.key,
        title: candidate.title,
        status: 'scheduled',
        startedAt: candidate.startsAt,
        scheduledAt: candidate.startsAt,
        durationMinutes: candidate.durationMinutes,
        /* Server-derived and unique per session: parallel rooms can never
           share an Agora channel or a webhook attribution. */
        rtc: { provider: 'agora', channel: 'mathify_' + id },
        createdAt: new Date().toISOString()
      };
      return Promise.resolve(db.insertSession(session)).then(function () {
        bookings.push({ id: id, startsAt: candidate.startsAt, title: candidate.title });
        return bookings;
      });
    });
  }, Promise.resolve([]));
}

function finish(batch, trainer, trainerId, candidates, booked, create) {
  const task = create ? writeSlots(batch, trainerId, candidates) : Promise.resolve([]);
  return task.then(function (bookings) {
    const slots = bookings.length ? bookings : (batch.slots || []);
    const stored = Object.assign({}, batch, {
      trainerId: trainerId,
      trainer: { id: trainerId, name: trainer.name },
      status: 'allotted',
      allottedAt: batch.allottedAt || new Date().toISOString(),
      slots: slots
    });
    return Promise.resolve(db.saveBatch(stored)).then(function () {
      return Promise.resolve(db.appendSessionEvent(batch.id, 'batch.allotted', {
        actorRole: 'founder',
        targetId: trainerId,
        at: stored.allottedAt,
        batchCode: stored.code,
        slots: slots.length
      })).then(function () { return publicView(stored, 'founder'); });
    });
  });
}

function forTrainer(trainerId) {
  return Promise.resolve(db.listBatches()).then(function (rows) {
    return rows
      .filter(function (row) { return row.trainerId === trainerId; })
      .map(function (row) { return publicView(row, 'trainer'); });
  });
}

function forStudent(studentId) {
  return Promise.resolve(db.findBatchForStudent(studentId)).then(function (row) {
    return publicView(row, 'student');
  });
}

module.exports = {
  ensureForStudent: ensureForStudent,
  allot: allot,
  forTrainer: forTrainer,
  forStudent: forStudent,
  publicView: publicView,
  overlaps: overlaps,
  intervalOf: intervalOf
};
