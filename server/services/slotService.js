/* ==========================================================================
   MATHIFY — committed trainer slots and unutilised-hour pay.

   A slot the trainer declares (for example 12:00–16:00 UTC) is committed to
   that trainer. Every class scheduled inside it is paid at the normal 100%
   session rate. Any hour of that slot with no class is paid at 30% of the
   trainer's session rate. Times are stored in UTC because scope is ANY
   TIMEZONE; the UI converts to the viewer's local time.
   ========================================================================== */

const db = require('../db');
const appPolicy = require('../config/policy.json');

function rules() {
  const configured = appPolicy.trainerSlots || {};
  return {
    committedPayPercent: Number(configured.committedClassPayPercent) || 100,
    unutilisedPayPercent: Number.isFinite(Number(configured.unutilisedPayPercent))
      ? Number(configured.unutilisedPayPercent) : 30,
    currency: configured.currency || 'INR',
    maxHoursPerSlot: Number(configured.maxHoursPerSlot) || 12
  };
}

function fail(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  throw error;
}

function rateFor(user) {
  const config = (appPolicy.payout && appPolicy.payout.rateRange) || [300, 400];
  const minimum = Number(config[0]) || 300;
  const maximum = Number(config[1]) || 400;
  const configured = Number(user && user.payPerSession);
  const rate = Number.isFinite(configured) && configured > 0 ? configured : 350;
  return Math.min(maximum, Math.max(minimum, rate));
}

function pad(value) { return String(value).padStart(2, '0'); }

function minuteLabel(minute) {
  const value = Number(minute) || 0;
  return pad(Math.floor(value / 60) % 24) + ':' + pad(value % 60);
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function periodDays(period, asOf) {
  const parts = String(period).split('-').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[1] < 1 || parts[1] > 12) return [];
  const last = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  const today = asOf ? new Date(asOf) : new Date();
  const end = today.getUTCFullYear() === parts[0] && today.getUTCMonth() + 1 === parts[1]
    ? Math.min(last, today.getUTCDate()) : last;

  const days = [];
  for (let day = 1; day <= end; day += 1) {
    days.push(new Date(Date.UTC(parts[0], parts[1] - 1, day)));
  }
  return days;
}

function slotsForDate(slots, date) {
  const key = ymd(date);
  return slots.filter(function (slot) {
    if (slot.date) return slot.date === key;
    return slot.dayOfWeek === date.getUTCDay();
  });
}

function sessionStart(session) {
  const value = new Date(session.scheduledAt || session.startsAt || session.startedAt);
  return Number.isNaN(value.getTime()) ? null : value;
}

function sessionMinutes(session) {
  if (Number.isFinite(Number(session.durationMinutes)) && Number(session.durationMinutes) > 0) {
    return Number(session.durationMinutes);
  }
  if (Number.isFinite(Number(session.durationHours)) && Number(session.durationHours) > 0) {
    return Number(session.durationHours) * 60;
  }
  if (Number.isFinite(Number(session.elapsedSeconds)) && Number(session.elapsedSeconds) > 0) {
    return Number(session.elapsedSeconds) / 60;
  }
  return 60;
}

function overlapMinutes(session, slot, date) {
  const start = sessionStart(session);
  if (!start || ymd(start) !== ymd(date)) return 0;

  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const slotStart = dayStart + Number(slot.startMinuteUtc) * 60000;
  const slotEnd = dayStart + Number(slot.endMinuteUtc) * 60000;
  const classStart = Math.max(start.getTime(), slotStart);
  const classEnd = Math.min(start.getTime() + sessionMinutes(session) * 60000, slotEnd);
  return Math.max(0, (classEnd - classStart) / 60000);
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function daySummary(user, date, slots, sessions, config) {
  const activeSlots = slotsForDate(slots, date);
  const rate = rateFor(user);
  let slotMinutes = 0;
  let committedMinutes = 0;

  activeSlots.forEach(function (slot) {
    const minutes = Math.max(0, Number(slot.endMinuteUtc) - Number(slot.startMinuteUtc));
    slotMinutes += minutes;
    sessions.forEach(function (session) {
      committedMinutes += overlapMinutes(session, slot, date);
    });
  });

  committedMinutes = Math.min(committedMinutes, slotMinutes);
  const unutilisedMinutes = Math.max(0, slotMinutes - committedMinutes);
  const committedHours = round2(committedMinutes / 60);
  const unutilisedHours = round2(unutilisedMinutes / 60);

  return {
    date: ymd(date),
    dayOfWeek: date.getUTCDay(),
    slots: activeSlots.map(function (slot) {
      return {
        id: slot.id,
        label: slot.label || 'Committed slot',
        start: minuteLabel(slot.startMinuteUtc),
        end: minuteLabel(slot.endMinuteUtc),
        startMinuteUtc: Number(slot.startMinuteUtc),
        endMinuteUtc: Number(slot.endMinuteUtc)
      };
    }),
    committedHours: committedHours,
    unutilisedHours: unutilisedHours,
    committedPay: round2(committedHours * rate * config.committedPayPercent / 100),
    unutilisedPay: round2(unutilisedHours * rate * config.unutilisedPayPercent / 100),
    currency: config.currency,
    ratePerHour: rate
  };
}

function classLines(date, sessions) {
  return sessions.filter(function (session) {
    const start = sessionStart(session);
    return start && ymd(start) === date;
  }).map(function (session) {
    const start = sessionStart(session);
    return {
      id: session.id,
      time: start.toISOString().slice(11, 16),
      startsAt: start.toISOString(),
      title: session.title || '1-on-1 maths session',
      status: session.status,
      durationMinutes: sessionMinutes(session),
      studentId: session.studentId,
      batchCode: session.batchCode || null
    };
  }).sort(function (a, b) { return a.time.localeCompare(b.time); });
}

function parseDay(value) {
  const input = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    fail('INVALID_DATE', 'start must use YYYY-MM-DD.');
  }
  const date = new Date(input + 'T00:00:00.000Z');
  if (isNaN(date.getTime()) || ymd(date) !== input) {
    fail('INVALID_DATE', 'start must be a real calendar date.');
  }
  return date;
}

function mondayOf(value) {
  const date = parseDay(value);
  const weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - weekday * 86400000);
}

async function weekView(user, startDate, sessions, asOf) {
  const config = rules();
  const slots = await db.listTrainerSlots(user.id);
  const start = mondayOf(startDate);
  const days = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(start.getTime() + offset * 86400000);
    const summary = daySummary(user, date, slots, sessions, config);
    days.push(Object.assign({}, summary, {
      classes: classLines(summary.date, sessions),
      isToday: summary.date === new Date().toISOString().slice(0, 10),
      isPast: asOf ? summary.date < new Date(asOf).toISOString().slice(0, 10) : false
    }));
  }

  const totals = days.reduce(function (sum, day) {
    sum.committedHours = round2(sum.committedHours + day.committedHours);
    sum.unutilisedHours = round2(sum.unutilisedHours + day.unutilisedHours);
    sum.committedPay = round2(sum.committedPay + day.committedPay);
    sum.unutilisedPay = round2(sum.unutilisedPay + day.unutilisedPay);
    return sum;
  }, { committedHours: 0, unutilisedHours: 0, committedPay: 0, unutilisedPay: 0 });

  return {
    trainerId: user.id,
    start: ymd(start),
    end: ymd(new Date(start.getTime() + 6 * 86400000)),
    currency: config.currency,
    ratePerHour: rateFor(user),
    rules: config,
    days: days,
    totals: totals,
    note: 'Committed classes are paid at 100% through session pay. Unutilised slot hours are added at ' +
      config.unutilisedPayPercent + '% of the session rate. Times are shown in UTC.'
  };
}

async function monthView(user, month, sessions, asOf) {
  const config = rules();
  const slots = await db.listTrainerSlots(user.id);
  const parts = String(month).split('-').map(Number);
  const last = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  const days = [];

  for (let day = 1; day <= last; day += 1) {
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, day));
    const summary = daySummary(user, date, slots, sessions, config);
    const classes = classLines(summary.date, sessions);

    days.push(Object.assign({}, summary, {
      classes: classes,
      isPast: asOf ? summary.date < new Date(asOf).toISOString().slice(0, 10) : false
    }));
  }

  const totals = days.reduce(function (sum, day) {
    sum.committedHours = round2(sum.committedHours + day.committedHours);
    sum.unutilisedHours = round2(sum.unutilisedHours + day.unutilisedHours);
    sum.committedPay = round2(sum.committedPay + day.committedPay);
    sum.unutilisedPay = round2(sum.unutilisedPay + day.unutilisedPay);
    return sum;
  }, { committedHours: 0, unutilisedHours: 0, committedPay: 0, unutilisedPay: 0 });

  return {
    trainerId: user.id,
    month: month,
    currency: config.currency,
    ratePerHour: rateFor(user),
    rules: config,
    days: days,
    totals: totals,
    note: 'Committed classes are paid at 100% through session pay. Unutilised slot hours are added at ' +
      config.unutilisedPayPercent + '% of the session rate.'
  };
}

async function unutilisedPayForPeriod(user, sessions, period, asOf) {
  const config = rules();
  const slots = await db.listTrainerSlots(user.id);
  return round2(periodDays(period, asOf).reduce(function (total, date) {
    return total + daySummary(user, date, slots, sessions, config).unutilisedPay;
  }, 0));
}

function validateSlot(user, body) {
  if (!user || user.role !== 'trainer') fail('FORBIDDEN', 'Only trainers can set committed slots.', 403);

  const input = body || {};
  const start = Number(input.startMinuteUtc);
  const end = Number(input.endMinuteUtc);
  const dayOfWeek = Number(input.dayOfWeek);
  const date = input.date ? String(input.date) : null;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start) {
    fail('INVALID_SLOT', 'startMinuteUtc and endMinuteUtc must be valid UTC minutes with end after start.');
  }
  if ((end - start) / 60 > rules().maxHoursPerSlot) fail('INVALID_SLOT', 'A slot cannot exceed 12 hours.');

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('INVALID_SLOT', 'date must use YYYY-MM-DD.');
  } else if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    fail('INVALID_SLOT', 'dayOfWeek must be between 0 and 6.');
  }

  return {
    trainerId: user.id,
    dayOfWeek: date ? null : dayOfWeek,
    date: date,
    startMinuteUtc: start,
    endMinuteUtc: end,
    label: String(input.label || 'Committed slot').trim().slice(0, 80)
  };
}

async function addSlot(user, body) {
  return db.insertTrainerSlot(validateSlot(user, body));
}

async function removeSlot(user, slotId) {
  if (!await db.deleteTrainerSlot(user.id, String(slotId || ''))) {
    fail('SLOT_NOT_FOUND', 'That slot was not found.', 404);
  }
  return { removed: true };
}

module.exports = {
  rules: rules,
  rateFor: rateFor,
  minuteLabel: minuteLabel,
  daySummary: daySummary,
  monthView: monthView,
  weekView: weekView,
  unutilisedPayForPeriod: unutilisedPayForPeriod,
  addSlot: addSlot,
  removeSlot: removeSlot
};
