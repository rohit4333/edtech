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
const timezoneService = require('./timezoneService');
const demoService = require('./demoService');
const batchNaming = require('./batchNamingService');
const notifications = require('./notificationService');
const subjectCatalog = require('./subjectCatalog');
const subjectService = require('./subjectService');

const DEFAULT_DURATION_MINUTES = 50;
const DEMO_DURATION_MINUTES = 45;
const CLOSED_STATUSES = ['cancelled', 'canceled', 'ended', 'leave', 'no_show', 'noshow', 'no-show'];
const PER_SESSION_KEY = 'batch_student_';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function code() {
  return 'TB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function isDemoRequest(request) {
  const status = request && String(request.status || '');
  return Boolean(status && ['booked', 'prepared', 'assigned'].indexOf(status) !== -1);
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

/* Every session in a renamed batch carries the human-facing code, so later
   reminders and dashboards do not show the old opaque demo code. */
function renameSessions(batchId, code) {
  return Promise.resolve(db.listAllSessions()).then(function (sessions) {
    const rows = Array.isArray(sessions) ? sessions.filter(function (session) {
      return session && session.batchId === batchId;
    }) : [];
    return rows.reduce(function (chain, session) {
      return chain.then(function () {
        return Promise.resolve(db.updateSession(session.id, function (current) {
          return current ? Object.assign({}, current, { batchCode: code }) : current;
        }));
      });
    }, Promise.resolve());
  });
}

function renameRequest(studentId, batchId, code) {
  return Promise.resolve(db.findContactRequestForStudent(studentId)).then(function (request) {
    if (!request) return null;
    return Promise.resolve(db.updateContactRequest(request.id, {
      batchId: batchId,
      batchCode: code
    }));
  });
}

/* Called when a credited pack moves the child into regular classes. The name is
   derived from server-held registration data and is assigned once, so a retry
   or a later allotment never renames an established batch. */
function nameForRegularClasses(studentId) {
  return serialize(function () {
    return Promise.resolve(db.findBatchForStudent(studentId)).then(function (batch) {
      if (!batch) return null;
      if (batch.regularClassCode) {
        return { code: batch.regularClassCode, batch: batch, reused: true };
      }
      return Promise.all([
        Promise.resolve(db.findUserById(studentId)),
        Promise.resolve(db.findContactRequestForStudent(studentId))
      ]).then(function (rows) {
        const student = rows[0] || {};
        const request = rows[1] || {};
        return batchNaming.buildCode({
          batchId: batch.id,
          studentId: studentId,
          country: request.country || student.country,
          region: request.region || student.region,
          timezone: request.timezone || student.timezone || batch.studentTimezone,
          curriculum: request.curriculum || request.curriculumLabel || student.curriculum
        }).then(function (code) {
          const previousCode = batch.code;
          const namedAt = new Date().toISOString();
          const stored = Object.assign({}, batch, {
            code: code,
            previousCode: previousCode,
            regularClassCode: code,
            regularClassNamedAt: namedAt
          });
          return Promise.resolve(db.saveBatch(stored)).then(function () {
            return renameSessions(batch.id, code);
          }).then(function () {
            return renameRequest(studentId, batch.id, code);
          }).then(function () {
            return Promise.resolve(db.appendSessionEvent(batch.id, 'batch.named', {
              actorRole: 'system',
              at: namedAt,
              reason: 'regular_classes',
              batchCode: code,
              previousCode: previousCode
            }));
          }).then(function () {
            return { code: code, batch: stored, reused: false };
          });
        });
      });
    });
  });
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
    subject: subjectCatalog.publicView(record.subject),
    studentName: text(student.name),
    trainerName: text(trainer.name),
    createdAt: record.createdAt
  };
  /* The demo ID and its safe desk link travel with an allotted batch so the
     trainer can open the child's demo without receiving contact details. */
  const demo = {
    demoId: record.demoId || null,
    demoLink: role === 'trainer' && record.demoId
      ? '/trainer/students?demoId=' + encodeURIComponent(record.demoId)
      : null
  };
  if (role === 'student') return Object.assign({
    id: base.id, code: base.code, trainerName: base.trainerName
  }, demo);
  if (role === 'trainer') return Object.assign({}, base, demo);
  return Object.assign({}, base, demo, { studentId: record.studentId });
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
          subject: subjectCatalog.normalize(student.subject),
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

          return Promise.all([
            openIntervals(trainerId, batch.studentId),
            Promise.resolve(db.findContactRequestForStudent(batch.studentId))
          ]).then(function (lists) {
            const booked = lists[0];
            const demoRequest = lists[1];
            const demo = isDemoRequest(demoRequest);
            /* Validate every slot before writing any of them. A conflict in the
               last slot must never leave earlier sessions half-booked. */
            const subjectSlug = subjectCatalog.normalize(batch.subject);
            const subjectWord = subjectSlug === 'math'
              ? 'maths' : subjectSlug === 'coding' ? 'coding' : 'English';
            const candidates = list.map(function (slot) {
              const startsAt = text(slot.startsAt || slot.startedAt || slot.scheduledAt);
              const start = Date.parse(startsAt);
              if (!startsAt || !Number.isFinite(start)) {
                throw fail('BATCH_SLOT_INVALID', 'Each slot needs a valid startsAt timestamp.', 422);
              }
              const minutes = Number(slot.durationMinutes);
              const durationMinutes = demo
                ? DEMO_DURATION_MINUTES
                : (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DURATION_MINUTES);
              return {
                startsAt: startsAt,
                title: text(slot.title) || 'Batch ' + batch.code + ' · 1-on-1 ' + subjectWord,
                durationMinutes: durationMinutes,
                classType: demo ? 'demo' : 'regular',
                demoId: demo && demoRequest ? demoRequest.id : null,
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
              return finish(batch, trainer, trainerId, [], booked, false, demo);
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
            return finish(batch, trainer, trainerId, candidates, booked, true, demo);
          });
        });
      });
    });
  });
}

function writeSlots(batch, trainerId, candidates, demo) {
  /* The child's registered zone travels with the booking. Reminders and every
     dashboard render the stored UTC instant in each viewer's own zone. */
  return Promise.all([
    Promise.resolve(db.findUserById(batch.studentId)),
    Promise.resolve(subjectService.forBatch(batch))
  ]).then(function (rows) {
    const student = rows[0];
    const subject = rows[1];
    const studentTimezone = timezoneService.forUser(student);
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
          subject: subject.subject,
          status: 'scheduled',
          startedAt: candidate.startsAt,
          scheduledAt: candidate.startsAt,
          timezone: studentTimezone,
          studentTimezone: studentTimezone,
          durationMinutes: candidate.durationMinutes,
          /* Demo and regular sessions share the 50-minute class length, pay
             rate and fine policy. The label stays after the demo closes. */
          classType: candidate.classType || (demo ? 'demo' : 'regular'),
          demoId: candidate.demoId || null,
          /* Server-derived and unique per session: parallel rooms can never
             share a LiveKit room or a webhook attribution. */
          rtc: { provider: 'livekit', roomName: 'mathify-' + id },
          createdAt: new Date().toISOString()
        };
        return Promise.resolve(db.insertSession(session)).then(function () {
          bookings.push({ id: id, startsAt: candidate.startsAt, title: candidate.title });
          return bookings;
        });
      });
    }, Promise.resolve([]));
  });
}

function finish(batch, trainer, trainerId, candidates, booked, create, demo) {
  const task = create ? writeSlots(batch, trainerId, candidates, demo) : Promise.resolve([]);
  return task.then(function (bookings) {
    return Promise.resolve(db.findContactRequestForStudent(batch.studentId)).then(function (demoRequest) {
      const slots = bookings.length ? bookings : (batch.slots || []);
      const stored = Object.assign({}, batch, {
        trainerId: trainerId,
        trainer: { id: trainerId, name: trainer.name },
        status: 'allotted',
        allottedAt: batch.allottedAt || new Date().toISOString(),
        demoId: demoRequest && demoRequest.id || batch.demoId || null,
        slots: slots
      });
      return Promise.resolve(db.saveBatch(stored)).then(function () {
        return Promise.resolve(db.appendSessionEvent(batch.id, 'batch.allotted', {
          actorRole: 'founder',
          targetId: trainerId,
          at: stored.allottedAt,
          batchCode: stored.code,
          slots: slots.length
        })).then(function () {
          /* The trainer is emailed on every allotment — demo session or regular
             class — with the batch ID. Mail is best effort and never rolls back
             a calendar booking that has already been saved. */
          const isDemo = typeof demo === 'boolean' ? demo : isDemoRequest(demoRequest);
          const assignmentKey = 'batch_assignment:' + batch.id + ':' + trainerId;
          return Promise.resolve(db.claimReminder(assignmentKey, {
            kind: 'trainer_assignment_email',
            batchId: batch.id,
            trainerId: trainerId
          })).then(function (claim) {
            if (!claim.claimed) return null;
            return Promise.resolve(notifications.sendTrainerAssignmentEmail({
              trainer: trainer,
              batch: stored,
              studentName: stored.student && stored.student.name,
              isDemo: isDemo,
              slots: slots
            })).then(function (delivery) {
              if (!delivery || !delivery.sent) {
                return Promise.resolve(db.releaseReminderClaim(assignmentKey)).then(function () {
                  return null;
                });
              }
              return delivery;
            }).catch(function (error) {
              console.error('[batch] trainer assignment email failed:', error.message);
              return Promise.resolve(db.releaseReminderClaim(assignmentKey)).then(function () {
                return null;
              });
            });
          });
        }).then(function () {
          /* Parent notices and email are best effort: a mail outage must not roll
             back an already booked trainer calendar. */
          return Promise.resolve(demoService.onAllotted(stored, trainer))
            .catch(function (error) {
              console.error('[demo] assignment notice failed:', error.message);
              return null;
            })
            .then(function () { return publicView(stored, 'founder'); });
        });
      });
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
  nameForRegularClasses: nameForRegularClasses,
  publicView: publicView,
  overlaps: overlaps,
  intervalOf: intervalOf
};
