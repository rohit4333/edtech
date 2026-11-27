/* Read-only views of a stored weekly planner.
 *
 * Nothing in this module generates, edits, archives or moves a planner. The only
 * write-like operation is JSON cloning so a caller cannot mutate the shared
 * in-memory record. Trainer and compact-quiz surfaces must use this service:
 * if a founder has not generated a planner yet, the honest answer is "none".
 */

const db = require('../db');
const planner = require('./weeklyPlannerService');

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value, max) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max || 500);
}

function identifier(item) {
  if (!item || typeof item !== 'object') return null;
  return text(item.questionId || item.question_id || item.id || item.qid || item.ref, 120) || null;
}

function guidanceItems(value, kind) {
  const source = Array.isArray(value) ? value : [];
  const items = [];
  source.forEach(function (entry) {
    if (typeof entry === 'string' || typeof entry === 'number') {
      const label = text(entry, 500);
      if (label) items.push({ text: label });
      return;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const label = text(entry.text || entry[kind] || entry.label || entry.note, 500);
    if (!label) return;
    const item = { text: label };
    const id = identifier(entry);
    if (id) item.questionId = id;
    items.push(item);
  });
  return items;
}

/* Suggested edits and hint additions are not authored here. These names are the
   only fields read from an already-stored planner, and missing fields stay empty. */
function guidanceFrom(record) {
  const source = record && record.planner && typeof record.planner === 'object'
    ? record.planner
    : {};
  const suggestedEdits = guidanceItems(
    source.suggestedEdits === undefined ? source.suggested_edits : source.suggestedEdits,
    'edit'
  );
  const hintAdditions = guidanceItems(
    source.hintAdditions === undefined ? source.hint_additions : source.hintAdditions,
    'hint'
  );
  const hasGuidance = suggestedEdits.length > 0 || hintAdditions.length > 0;
  return {
    suggestedEdits: suggestedEdits,
    hintAdditions: hintAdditions,
    hasGuidance: hasGuidance,
    message: hasGuidance
      ? ''
      : 'No planner-provided suggested edits or hint additions are available yet.'
  };
}

async function readActive(input) {
  const selection = planner.resolveSelection(input);
  const ownership = await planner.activeRecord(selection);
  if (!ownership || !ownership.cacheKey) return null;
  const record = await db.findWeeklyPlannerCache(ownership.cacheKey);
  if (!record || !record.planner) return null;
  return {
    selection: selection,
    planner: copy(record.planner),
    guidance: guidanceFrom(record),
    cache: {
      topic: record.topic || null,
      subject: record.subject || 'math',
      cacheKey: record.cacheKey,
      version: record.version,
      promptVersion: record.promptVersion,
      generatedAt: record.generatedAt,
      provider: record.provider,
      temperature: record.temperature,
      seed: record.seed,
      createdByRole: record.createdByRole || (record.editedBy ? 'founder' : 'system'),
      createdBy: record.createdBy || record.editedBy || null,
      hit: true,
      source: 'stored'
    }
  };
}

module.exports = {
  guidanceFrom: guidanceFrom,
  readActive: readActive
};
