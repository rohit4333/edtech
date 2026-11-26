/* Founder-editable workspace settings.
 *
 * Defaults stay file-backed in config/policy.json. Founder edits are a runtime
 * draft: they are validated against an explicit allowlist, never written to
 * disk, and money fields remain read-only. This keeps the "never get emotional
 * about money transactions" rule enforceable in code rather than relying on UI
 * discipline alone. */

const basePolicy = require('../config/policy.json');

const SECTIONS = {
  policy: {
    label: 'Class policy',
    note: 'Lesson pacing and scoring bands. Network floors and payouts are locked.',
    fields: [
      { key: 'quiz.unlockThreshold', label: 'Quiz unlock threshold', type: 'number', min: 50, max: 100, step: 1 },
      { key: 'quiz.scoringBands.easy.max', label: 'Easy band upper bound', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'quiz.scoringBands.medium.min', label: 'Medium band lower bound', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'quiz.scoringBands.medium.max', label: 'Medium band upper bound', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'quiz.scoringBands.hard.min', label: 'Hard band lower bound', type: 'number', min: 0, max: 100, step: 1 }
    ]
  },
  mastery: {
    label: 'Mastery',
    note: 'Progression stays on one topic until the learner clears the gate.',
    fields: [
      { key: 'masteryGating.unlockThreshold', label: 'Mastery unlock threshold', type: 'number', min: 50, max: 100, step: 1 },
      { key: 'masteryGating.keepSameTopicBelowThreshold', label: 'Keep topic below threshold', type: 'boolean' },
      { key: 'masteryGating.reteachBeforeNewCheck', label: 'Reteach before a new check', type: 'boolean' },
      { key: 'teachingScore.scaleMax', label: 'Teaching score scale max', type: 'nullableNumber', min: 1, max: 1000, step: 1 },
      { key: 'teachingScore.target', label: 'Teaching score target', type: 'nullableNumber', min: 1, max: 1000, step: 1 }
    ]
  },
  trainerPolicy: {
    label: 'Trainer policy',
    note: 'Presence and planning windows. Pay percentages, rates and fines are locked.',
    fields: [
      { key: 'presence.heartbeatSeconds', label: 'Presence heartbeat (seconds)', type: 'number', min: 5, max: 120, step: 1 },
      { key: 'presence.idleSeconds', label: 'Idle window (seconds)', type: 'number', min: 15, max: 600, step: 1 },
      { key: 'presence.learningEventWindowSeconds', label: 'Learning event window (seconds)', type: 'number', min: 30, max: 600, step: 1 },
      { key: 'presence.graceMinutes', label: 'Join grace (minutes)', type: 'number', min: 0, max: 30, step: 1 },
      { key: 'presence.trainerMinPresentMinutes', label: 'Trainer minimum presence (minutes)', type: 'number', min: 1, max: 60, step: 1 },
      { key: 'presence.studentMinPresentMinutes', label: 'Student minimum presence (minutes)', type: 'number', min: 1, max: 60, step: 1 },
      { key: 'presence.learningEventsForPresent', label: 'Learning events for present', type: 'number', min: 1, max: 20, step: 1 },
      { key: 'trainerSlots.maxHoursPerSlot', label: 'Maximum hours per declared slot', type: 'number', min: 1, max: 24, step: 1 }
    ]
  }
};

/* Every entry here is surfaced as locked output, never as an editable control. */
const READ_ONLY_MONEY = [
  { key: 'payout.rateRange', label: 'Trainer session rate range', format: 'currencyRange' },
  { key: 'payout.bonusRules.perfectAttendanceBonus', label: 'Perfect attendance bonus', format: 'currency' },
  { key: 'payout.bonusRules.incrementPerConsecutiveMonth', label: 'Monthly increment', format: 'currency' },
  { key: 'payout.fineRules.penalty', label: 'Late cancellation penalty', format: 'text' },
  { key: 'payout.noShow.payout', label: 'No-show payout', format: 'currency' },
  { key: 'payout.mvtAwards', label: 'MVT awards', format: 'currencyList' },
  { key: 'trainerSlots.committedClassPayPercent', label: 'Committed class pay', format: 'percent' },
  { key: 'trainerSlots.unutilisedPayPercent', label: 'Unutilised slot pay', format: 'percent' },
  { key: 'leaveBalances.trainer.perMonth', label: 'Trainer leave balance', format: 'number' },
  { key: 'leaveBalances.student.packPenalty', label: 'Student pack penalty', format: 'boolean' },
  { key: 'packs.expiryDays', label: 'Pack expiry (days)', format: 'number' },
  { key: 'packs.refundable', label: 'Pack refundable', format: 'boolean' }
];

const LOCKED_CONTRACT_FIELDS = [
  'networkCheck.minDownloadMbps',
  'networkCheck.minUploadMbps',
  'networkCheck.maxLatencyMs',
  'networkCheck.maxAgeMinutes',
  'badges'
];

let overrides = {};
let updatedAt = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPath(object, key) {
  return String(key).split('.').reduce(function (value, part) {
    if (value === null || value === undefined) return undefined;
    return value[part];
  }, object);
}

function setPath(object, key, value) {
  const parts = String(key).split('.');
  let cursor = object;
  parts.slice(0, -1).forEach(function (part) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
}

function snapshot() {
  const result = clone(basePolicy);
  Object.keys(overrides).forEach(function (key) {
    setPath(result, key, clone(overrides[key]));
  });
  return result;
}

function fieldValue(field, policy) {
  return getPath(policy, field.key);
}

function sections() {
  const policy = snapshot();
  return Object.keys(SECTIONS).map(function (id) {
    const section = SECTIONS[id];
    return {
      id: id,
      label: section.label,
      note: section.note,
      fields: section.fields.map(function (field) {
        const copy = clone(field);
        copy.value = fieldValue(field, policy);
        copy.readOnly = false;
        return copy;
      })
    };
  });
}

function readOnlyMoney() {
  const policy = snapshot();
  return READ_ONLY_MONEY.map(function (item) {
    const copy = clone(item);
    copy.value = getPath(policy, item.key);
    copy.readOnly = true;
    return copy;
  });
}

function view() {
  return {
    storage: 'runtime',
    persistence: 'draft',
    note: 'Founder edits are runtime drafts. The file-backed policy remains authoritative until a reviewed deployment.',
    updatedAt: updatedAt,
    policy: snapshot(),
    sections: sections(),
    readOnlyMoney: readOnlyMoney(),
    lockedContractFields: LOCKED_CONTRACT_FIELDS.slice()
  };
}

function problem(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function normalize(field, raw) {
  if (field.type === 'boolean') return Boolean(raw);

  if (field.type === 'nullableNumber') {
    if (raw === null || raw === '' || raw === undefined) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw problem(field.label + ' must be a number.', 'INVALID_SETTING');
    const bounded = Math.min(field.max, Math.max(field.min, parsed));
    return Math.round(bounded);
  }

  if (field.type === 'number') {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw problem(field.label + ' must be a number.', 'INVALID_SETTING');
    const bounded = Math.min(field.max, Math.max(field.min, parsed));
    return Math.round(bounded);
  }

  throw problem(field.label + ' cannot be edited.', 'FIELD_READ_ONLY');
}

function patch(sectionId, values) {
  const section = SECTIONS[sectionId];
  if (!section) throw problem('Unknown settings section.', 'INVALID_SECTION');
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw problem('Provide a values object.', 'INVALID_SETTING');
  }

  const next = {};
  Object.keys(values).forEach(function (key) {
    if (LOCKED_CONTRACT_FIELDS.indexOf(key) !== -1) {
      throw problem(key + ' is a locked product contract.', 'FIELD_READ_ONLY');
    }
    const field = section.fields.find(function (item) { return item.key === key; });
    if (!field) throw problem(key + ' is read-only in this section.', 'FIELD_READ_ONLY');
    next[key] = normalize(field, values[key]);
  });

  Object.keys(next).forEach(function (key) { overrides[key] = next[key]; });
  updatedAt = new Date().toISOString();
  return view();
}

function reset() {
  overrides = {};
  updatedAt = null;
  return view();
}

module.exports = {
  view: view,
  snapshot: snapshot,
  patch: patch,
  reset: reset,
  sectionIds: function () { return Object.keys(SECTIONS); }
};
