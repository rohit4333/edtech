/* Trainer onboarding, batch allotment, weekly timetable and 50-minute link
   rollover regression suite. No live database or external calls are used. */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const serializers = require('../serializers');
const slotService = require('../services/slotService');
const onboarding = require('../services/trainerOnboardingService');
const documents = require('../services/trainerDocumentService');
const batches = require('../services/batchService');

const password = process.env.DEMO_PASSWORD || 'mathify-demo';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

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
  date.setUTCHours(hour || 10, 0, 0, 0);
  return date.toISOString();
}

async function main() {
  equal(onboarding.LOCKED_FIELDS.indexOf('aadhaar') !== -1, true, 'Aadhaar is a locked KYC field');
  equal(onboarding.LOCKED_FIELDS.indexOf('pan') !== -1, true, 'PAN is a locked KYC field');
  equal(onboarding.LOCKED_FIELDS.indexOf('dateOfBirth') !== -1, true, 'date of birth is locked');
  equal(onboarding.EDITABLE_FIELDS.indexOf('personal') !== -1, true, 'personal details are editable');
  equal(onboarding.EDITABLE_FIELDS.indexOf('bank') !== -1, true, 'bank details are editable');

  await rejects(documents.upload('trainer-onboarding-unit', { kind: 'aadhaar', mimeType: 'text/plain', data: PNG }),
    'KYC_DOCUMENT_MIME');
  const image = await documents.upload('trainer-onboarding-unit', {
    kind: 'aadhaar',
    fileName: 'aadhaar.png',
    mimeType: 'image/png',
    data: 'data:image/png;base64,' + PNG
  });
  equal(image.mimeType, 'image/png', 'image metadata keeps the validated MIME type');
  equal(image.bytes, undefined, 'image metadata never exposes raw bytes');
  const storedFile = await documents.read('trainer-onboarding-unit', image.id);
  ok(storedFile.buffer.length > 0, 'private document bytes remain retrievable server-side');

  const trainerId = 'usr_trainer_001';
  const input = {
    identity: { fullName: 'Ananya Rao', dateOfBirth: '1994-06-12' },
    personal: {
      contactNumber: '9876543210',
      alternateContactNumber: '9876543211',
      emailId: 'trainer@mathify.app',
      fatherName: 'Father Name',
      motherName: 'Mother Name',
      spouseName: 'Spouse Name',
      address: 'Bengaluru'
    },
    bank: {
      accountHolderName: 'Ananya Rao',
      accountNumber: '1234567890',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC',
      branch: 'Indiranagar'
    },
    documents: {
      aadhaar: { number: '123456789012', image: image },
      pan: { number: 'ABCDE1234F', image: image },
      signature: { image: image },
      bankProof: { image: image },
      additionalDocuments: [{ label: 'Address proof', number: 'ADR-991', image: image }]
    }
  };

  const created = await onboarding.submit(trainerId, input);
  equal(created.status, 'submitted', 'KYC submission is recorded');
  equal(created.documents.aadhaar.number, '123456789012', 'trainer sees their full Aadhaar number');
  equal(created.documents.pan.number, 'ABCDE1234F', 'trainer sees their full PAN number');
  equal(created.masked, false, 'trainer view is not masked');
  await rejects(onboarding.submit(trainerId, input), 'KYC_LOCKED');

  const founderView = await onboarding.viewFor(trainerId, 'founder');
  equal(founderView.masked, true, 'founder view is masked by default');
  equal(founderView.documents.aadhaar.number, '••••9012', 'founder sees only the last four Aadhaar digits');
  equal(founderView.documents.pan.number, '••••234F', 'founder sees only the last four PAN characters');
  const revealed = await onboarding.viewFor(trainerId, 'founder', { reveal: true });
  equal(revealed.documents.aadhaar.number, '123456789012', 'explicit founder reveal exposes the full number');

  const personal = await onboarding.updatePersonal(trainerId, {
    personal: { contactNumber: '9000000001' },
    bank: { accountNumber: '9999999999' }
  });
  equal(personal.personal.contactNumber, '9000000001', 'trainer can edit contact number');
  equal(personal.bank.accountNumber, '9999999999', 'trainer can edit bank details');
  equal(personal.documents.aadhaar.number, '123456789012', 'editing personal details cannot change locked Aadhaar');
  equal(personal.identity.fullName, 'Ananya Rao', 'editing personal details cannot change legal name');

  const corrected = await onboarding.correct(trainerId, { identity: { fullName: 'Ananya R.' } }, 'usr_founder_001');
  equal(corrected.record.identity.fullName, 'Ananya R.', 'founder can correct a locked name');
  equal(corrected.correction.after.fullName, 'Ananya R.', 'correction audit records the new value');
  const history = await onboarding.history(trainerId);
  equal(history.length, 1, 'each founder correction appends an audit row');
  equal(history[0].fields[0], 'fullName', 'audit records which locked field changed');

  const studentId = 'usr_student_001';
  const batch = await batches.ensureForStudent(studentId);
  ok(/^TB-[0-9A-F]{6}$/.test(batch.code), 'enrollment creates a shareable batch ID');
  const start = iso(1, 11);
  /* Mock mode deliberately refuses real session creation. The test injects the
     in-memory insert used by the service so calendar booking can be asserted
     without weakening the production guard. */
  const mockStore = require('../db/mock');
  const originalInsertSession = db.insertSession;
  db.insertSession = function (record) {
    const stored = Object.assign({}, record);
    mockStore.sessions.push(stored);
    return stored;
  };
  let allotted;
  try {
    allotted = await batches.allot(batch.id, trainerId, [{ startsAt: start, title: 'Batch ratios' }]);
  } finally {
    db.insertSession = originalInsertSession;
  }
  equal(allotted.trainerId, trainerId, 'allotment assigns exactly one trainer');
  const sessions = db.listSessionsForUser({ id: trainerId, role: 'trainer' });
  const booked = sessions.find(function (session) { return session.batchId === batch.id; });
  ok(Boolean(booked), 'allotment books the trainer calendar');
  equal(booked.studentId, studentId, 'booked session keeps the 1-on-1 student link');
  const trainerBatch = (await batches.forTrainer(trainerId))[0];
  equal(trainerBatch.studentName, 'Ishaan Verma', 'trainer roster shows the student name');
  equal(trainerBatch.code, batch.code, 'trainer roster shows the batch ID');
  equal(trainerBatch.studentId, undefined, 'trainer roster payload withholds the student id');
  equal(JSON.stringify(trainerBatch).indexOf('@'), -1, 'trainer roster carries no contact details');

  const week = slotService.weekView({ id: trainerId, role: 'trainer' }, iso(1, 10).slice(0, 10), [booked]);
  equal(week.days.length, 7, 'week timetable returns exactly seven days');
  equal(new Date(week.start + 'T00:00:00.000Z').getUTCDay(), 1, 'the seven-day window starts on Monday');
  ok(week.days.some(function (day) { return day.classes.some(function (item) { return item.batchCode === batch.code; }); }),
    'allotted batch appears in the weekly calendar');

  function todayInstant(offsetMs) {
    const candidate = new Date(Date.now() + offsetMs);
    const today = new Date().toISOString().slice(0, 10);
    if (candidate.toISOString().slice(0, 10) === today) return candidate.toISOString();
    return today + 'T23:59:00.000Z';
  }
  /* Both sessions stay inside the dashboard's today window. The live one has
     passed 50 minutes so its link must roll to the next scheduled session. */
  const liveStart = todayInstant(-51 * 60000);
  const nextStart = todayInstant(30 * 60000);
  const dashboard = serializers.toTrainerDashboard(
    { id: trainerId, role: 'trainer', name: 'Ananya Rao' },
    [
      { id: 'ses_active_50', status: 'live', startedAt: liveStart, studentId: studentId, code: 'LIVE' },
      { id: 'ses_next', status: 'scheduled', startedAt: nextStart, studentId: studentId, code: 'NEXT', planner: [] }
    ],
    []
  );
  equal(dashboard.summary.sessionsTaken, 1, 'a session past 50 minutes counts as taken');
  equal(dashboard.summary.sessionsRemaining, 1, 'the remaining counter excludes the taken session');
  equal(dashboard.nextSession.id, 'ses_next', 'the next session link is promoted after exactly 50 minutes');
  equal(dashboard.nextSession.activeThroughMinutes, 50, 'dashboard advertises the 50-minute link window');

  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  function request(method, route, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return fetch(base + route, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (response) {
      return response.text().then(function (text) {
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (error) {}
        return { status: response.status, body: data };
      });
    });
  }

  try {
    const login = await request('POST', '/api/auth/login', {
      email: 'trainer@mathify.app', password: password
    });
    equal(login.status, 200, 'trainer credential login succeeds');
    const trainerToken = login.body.token;
    const weekResponse = await request('GET', '/api/trainer/schedule/week?start=' + iso(2, 9).slice(0, 10),
      undefined, trainerToken);
    equal(weekResponse.status, 200, 'week schedule endpoint is reachable for trainers');
    equal(weekResponse.body.schedule.days.length, 7, 'API returns a seven-day timetable');
    const studentLogin = await request('POST', '/api/auth/login', {
      email: 'student@mathify.app', password: password
    });
    const denied = await request('GET', '/api/trainer/schedule/week', undefined, studentLogin.body.token);
    equal(denied.status, 403, 'students cannot read the trainer timetable');
    const batchResponse = await request('GET', '/api/trainer/batches', undefined, trainerToken);
    equal(batchResponse.status, 200, 'trainer can read alloted batches');
    equal(batchResponse.body.batches[0].code, batch.code, 'trainer API exposes name and batch ID');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }

  console.log('trainerOnboarding: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
