/* Versioned, deterministic quality gate for MCP-designed weekly planners.
 *
 * This service never writes a planner and never calls an AI provider. It turns
 * the founder-review rules in config/planner-rubric.json into evidence that the
 * designer MCP can feed back into its own regenerate loop. Session rules are
 * verified from the live policy file so a planner cannot be signed off against
 * a stale rule set.
 */

const crypto = require('crypto');
const rubricConfig = require('../config/planner-rubric.json');
const policy = require('../config/policy.json');
const planner = require('./weeklyPlannerService');

function rubric() {
  return JSON.parse(JSON.stringify(rubricConfig));
}

function sentencesOf(text) {
  return String(text || '').split(/[.!?]+/).map(function (part) { return part.trim(); })
    .filter(function (part) { return part.length > 0; });
}

function wordsOf(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function finding(id, ok, evidence, scored) {
  return { id: id, ok: Boolean(ok), evidence: evidence || null, scored: Boolean(scored) };
}

function evaluate(candidate, selectionInput) {
  const config = rubric();
  const selection = planner.resolveSelection(selectionInput || {});
  const allowed = planner.allowedStandards(selection);
  const findings = [];

  const checked = planner.validatePlannerOutput(candidate, selection, allowed);
  findings.push(finding('schema', checked.ok, checked.ok ? 'planner matches the weekly-planner schema' : checked.reason));

  const plannerObject = checked.ok ? checked.planner : null;
  const meta = (plannerObject && plannerObject.meta) || {};

  findings.push(finding('prompt_version',
    Boolean(plannerObject && meta.promptVersion === config.promptVersion),
    meta.promptVersion ? 'promptVersion ' + meta.promptVersion : 'promptVersion missing'));

  const aligned = Boolean(plannerObject && meta.curriculumSlug === selection.curriculumSlug &&
    meta.gradeSlug === selection.gradeSlug && meta.topic === selection.topic);
  findings.push(finding('curriculum_alignment', aligned,
    aligned ? 'selection matches meta' : 'meta does not match the requested board, grade and topic'));

  const days = (plannerObject && plannerObject.week && plannerObject.week.days) || [];
  const narratives = days.map(function (day) { return (day && day.narrative) || ''; });
  const narrativeOk = days.length === 5 && narratives.every(function (text) {
    const sentences = sentencesOf(text);
    return sentences.length >= 2 && sentences.length <= 3 && wordsOf(text).length <= 40 &&
      planner.fleschKincaidGrade(text) <= 2;
  });
  findings.push(finding('narrative_continuity', narrativeOk,
    narrativeOk ? 'five short grade-two narratives' : 'a narrative is missing, too long or above grade two', true));

  const requiredTypes = ['play', 'story', 'making', 'reflection'];
  const practiceOk = days.length === 5 && days.every(function (day) {
    const types = ((day && day.activities) || []).map(function (activity) { return activity && activity.type; });
    return requiredTypes.every(function (type) { return types.indexOf(type) !== -1; });
  });
  findings.push(finding('practice_sequence', practiceOk,
    practiceOk ? 'each day has play, story, making and reflection' : 'a day is missing a practice block', true));

  let differentiated = 0;
  days.forEach(function (day) {
    ((day && day.activities) || []).forEach(function (activity) {
      const diff = (activity && activity.differentiation) || {};
      if (diff.support && diff.core && diff.stretch) differentiated += 1;
    });
  });
  const differentiatedOk = differentiated >= 20;
  findings.push(finding('differentiation', differentiatedOk,
    differentiated + ' blocks carry support, core and stretch', true));

  const topicHits = JSON.stringify(plannerObject || {}).split(String(selection.topic || '')).length - 1;
  const topicOk = Boolean(selection.topic) && topicHits >= 2;
  findings.push(finding('topic_fidelity', topicOk,
    topicOk ? 'topic appears in meta and daily work' : 'topic is not carried into daily work', true));

  const size = plannerObject ? Buffer.byteLength(JSON.stringify(plannerObject), 'utf8') : 0;
  const brevityOk = size > 0 && size <= 20000;
  findings.push(finding('brevity', brevityOk, size + ' UTF-8 bytes', true));

  const thresholds = policy.quiz || {};
  const mapping = thresholds.difficultyMapping || {};
  const levels = [mapping.level1, mapping.level2, mapping.level3]
    .map(function (entry) { return entry && entry.level; });
  const sessionOk = Number(thresholds.unlockThreshold) === 80 &&
    levels.join(',') === '1,2,3' &&
    config.sessionRules.unlockCorrectPerSection === 3;
  findings.push(finding('session_invariants', sessionOk,
    sessionOk ? 'quiz unlock 80, levels 1/2/3, three correct per section' : 'policy and rubric session rules disagree'));

  const hardFailures = findings.filter(function (item) {
    return config.hardGates.indexOf(item.id) !== -1 && !item.ok;
  }).map(function (item) { return item.id; });

  const scored = config.scored.reduce(function (total, rule) {
    const match = findings.find(function (item) { return item.id === rule.id; });
    return total + (match && match.ok ? rule.weight : 0);
  }, 0);
  const maxScore = config.scored.reduce(function (total, rule) { return total + rule.weight; }, 0);
  const score = maxScore ? Math.round((scored / maxScore) * 100) : 0;

  return {
    ok: hardFailures.length === 0 && score >= config.passScore,
    score: score,
    passScore: config.passScore,
    maxAttempts: config.maxAttempts,
    hardGateFailures: hardFailures,
    findings: findings,
    pendingFounderInput: config.pendingFounderInput.slice(),
    sessionRules: config.sessionRules,
    note: 'Draft quality evidence only. A passing draft still needs founder approval to become active.'
  };
}

function hash(selection, candidate, findings) {
  return crypto.createHash('sha256').update(JSON.stringify({
    rubricVersion: rubricConfig.version,
    promptVersion: rubricConfig.promptVersion,
    selection: planner.resolveSelection(selection || {}),
    candidate: candidate,
    findings: findings
  })).digest('hex');
}

function feedbackText(evaluation) {
  const failed = evaluation.findings.filter(function (item) { return !item.ok; });
  if (!failed.length) return 'The draft passes every rubric gate. Keep the structure and wording unchanged.';
  return 'Revise the planner to fix these exact rubric failures: ' + failed.map(function (item) {
    return item.id + ' (' + item.evidence + ')';
  }).join('; ') + '. Return the full corrected planner JSON only.';
}

module.exports = {
  rubric: rubric,
  evaluate: evaluate,
  hash: hash,
  feedbackText: feedbackText
};
