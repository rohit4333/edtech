const assert = require('assert');
const slotService = require('../services/slotService');

const user = { id: 't1', role: 'trainer', payPerSession: 350 };
const rules = slotService.rules();
const monday = new Date('2026-11-30T00:00:00.000Z');
const slot = { id: 'slot_1', dayOfWeek: 1, startMinuteUtc: 720, endMinuteUtc: 960, label: '12–4 UTC' };
const oneHourClass = {
  id: 'c1',
  scheduledAt: '2026-11-30T12:30:00.000Z',
  durationMinutes: 60,
  status: 'ended'
};

(async function () {
  /* A declared 12:00–16:00 slot with one 60-minute class: 1h at 100%, 3h at 30%. */
  const withClass = slotService.daySummary(user, monday, [slot], [oneHourClass], rules);
  assert.strictEqual(withClass.committedHours, 1);
  assert.strictEqual(withClass.unutilisedHours, 3);
  assert.strictEqual(withClass.committedPay, 350);
  assert.strictEqual(withClass.unutilisedPay, 315);
  assert.strictEqual(withClass.currency, 'INR');

  /* No classes in a committed slot: all four hours earn 30%. */
  const empty = slotService.daySummary(user, monday, [slot], [], rules);
  assert.strictEqual(empty.committedHours, 0);
  assert.strictEqual(empty.unutilisedHours, 4);
  assert.strictEqual(empty.unutilisedPay, 420);

  /* A class outside the declared slot does not consume the commitment. */
  const outside = Object.assign({}, oneHourClass, {
    id: 'c2',
    scheduledAt: '2026-11-30T17:00:00.000Z'
  });
  const outsideSlot = slotService.daySummary(user, monday, [slot], [outside], rules);
  assert.strictEqual(outsideSlot.committedHours, 0);
  assert.strictEqual(outsideSlot.unutilisedHours, 4);

  assert.strictEqual(slotService.minuteLabel(720), '12:00');
  assert.strictEqual(slotService.minuteLabel(960), '16:00');
  assert.strictEqual(slotService.rateFor({ payPerSession: 120 }), 300);
  assert.strictEqual(slotService.rateFor({ payPerSession: 900 }), 400);
  assert.strictEqual(slotService.rateFor({ payPerSession: 350 }), 350);

  await assert.rejects(function () {
    return slotService.addSlot({ id: 'u1', role: 'student' }, {
      dayOfWeek: 1, startMinuteUtc: 720, endMinuteUtc: 960
    });
  }, /Only trainers/);

  await assert.rejects(function () {
    return slotService.addSlot(user, {
      dayOfWeek: 1, startMinuteUtc: 0, endMinuteUtc: 13 * 60
    });
  }, /12 hours/);

  await assert.rejects(function () {
    return slotService.addSlot(user, {
      dayOfWeek: 7, startMinuteUtc: 720, endMinuteUtc: 960
    });
  }, /dayOfWeek/);

  console.log('slotService: 15 assertions passed');
})().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
