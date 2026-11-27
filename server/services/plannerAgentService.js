/* Planner Agent review queue.
 *
 * The agent desk can design every LMS planner, but a founder-authored plan is
 * never overwritten or archived by it. Those ideas are stored as suggestions;
 * only the founder can accept (which creates a normal immutable planner
 * version) or reject one. Nothing here touches payments, people or policies.
 */

const crypto = require('crypto');
const db = require('../db');
const subjects = require('./subjectCatalog');
const planner = require('./weeklyPlannerService');

const COLLECTION = 'planner_agent_suggestion';

function fail(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function brief(value, max) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max || 500);
}

function publicView(record) {
  if (!record) return null;
  return {
    id: record.id,
    subject: record.subject || 'math',
    subjectLabel: record.subjectLabel || null,
    curriculumSlug: record.curriculumSlug || null,
    gradeSlug: record.gradeSlug || null,
    topic: record.topic || null,
    planner: record.planner || null,
    note: record.note || '',
    status: record.status || 'pending',
    targetVersion: Number(record.targetVersion) || 0,
    targetAuthoredByRole: record.targetAuthoredByRole || null,
    authorId: record.authorId || null,
    authorRole: record.authorRole || 'planner_agent',
    createdAt: record.createdAt || null,
    decidedAt: record.decidedAt || null,
    decidedBy: record.decidedBy || null
  };
}

async function list(input) {
  const filter = input || {};
  const expectedSubject = filter.subject ? subjects.normalize(filter.subject) : null;
  const records = await db.listRecords(COLLECTION);
  return records.map(publicView).filter(function (item) {
    if (!item) return false;
    if (expectedSubject && item.subject !== expectedSubject) return false;
    if (filter.curriculumSlug && item.curriculumSlug !== filter.curriculumSlug) return false;
    if (filter.gradeSlug && item.gradeSlug !== filter.gradeSlug) return false;
    return true;
  }).sort(function (left, right) {
    return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  });
}

async function propose(input, actor) {
  const body = input || {};
  if (!actor || actor.role !== 'planner_agent') {
    throw fail('Only the planner agent can file an alternate idea.', 'FORBIDDEN_ROLE', 403);
  }
  const selection = planner.resolveSelection(body);
  const allowed = planner.allowedStandards(selection);
  const checked = planner.validatePlannerOutput(body.planner, selection, allowed);
  if (!checked.ok) {
    throw fail('Alternate planner is invalid: ' + checked.reason, 'INVALID_PLANNER', 400);
  }
  const active = await planner.activeRecord(selection);
  const record = {
    id: 'sug_' + crypto.randomUUID(),
    subject: selection.subject,
    subjectLabel: selection.subjectLabel,
    curriculumSlug: selection.curriculumSlug,
    gradeSlug: selection.gradeSlug,
    topic: selection.topic,
    planner: checked.planner,
    note: brief(body.note, 600),
    status: 'pending',
    targetVersion: active.version,
    targetAuthoredByRole: active.authoredByRole,
    authorId: actor.id,
    authorRole: 'planner_agent',
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null
  };
  await db.putRecord(COLLECTION, record.id, record);
  return publicView(record);
}

async function decide(id, decision, actor) {
  if (!actor || actor.role !== 'founder') {
    throw fail('Only the founder can review planner ideas.', 'FORBIDDEN_ROLE', 403);
  }
  if (decision !== 'accept' && decision !== 'reject') {
    throw fail('Unknown review decision.', 'INVALID_DECISION', 400);
  }
  const key = brief(id, 120);
  const current = await db.getRecord(COLLECTION, key);
  if (!current) throw fail('Unknown planner idea.', 'SUGGESTION_NOT_FOUND', 404);
  if (current.status !== 'pending') {
    throw fail('This idea has already been reviewed.', 'SUGGESTION_REVIEWED', 409);
  }

  let applied = null;
  if (decision === 'accept') {
    const selection = planner.resolveSelection(current);
    const allowed = planner.allowedStandards(selection);
    const checked = planner.validatePlannerOutput(current.planner, selection, allowed);
    if (!checked.ok) {
      throw fail('Stored idea is no longer valid: ' + checked.reason, 'INVALID_PLANNER', 400);
    }
    applied = await planner.editPlanner(
      Object.assign({}, selection, { planner: checked.planner }),
      actor.id,
      { createdByRole: 'founder' }
    );
  }

  const updated = Object.assign({}, current, {
    status: decision === 'accept' ? 'accepted' : 'rejected',
    decidedAt: new Date().toISOString(),
    decidedBy: actor.id
  });
  await db.putRecord(COLLECTION, key, updated);
  return { suggestion: publicView(updated), applied: applied };
}

module.exports = {
  COLLECTION: COLLECTION,
  list: list,
  propose: propose,
  decide: decide,
  publicView: publicView
};
