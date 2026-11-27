/* Read-only planner projection used by trainer and compact-quiz surfaces.
 *
 * It never generates, edits or archives a planner. Suggested edits and hint
 * additions are only copied from a stored record; missing fields stay empty and
 * carry an honest message instead of invented guidance.
 */

const assert = require('assert');
const db = require('../db');
const mock = require('../db/mock');
const planner = require('../services/weeklyPlannerService');
const plannerRead = require('../services/plannerReadService');
const ai = require('../services/cloudflareAiService');

const originalGenerate = ai.generateAIResponse;
let checks = 0;
let calls = 0;

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function reset() {
  mock.weeklyPlannerCache.length = 0;
  mock.weeklyPlannerArchive.length = 0;
  mock.weeklyPlannerPointers.length = 0;
  calls = 0;
  ai.generateAIResponse = async function () {
    calls += 1;
    const chosen = planner.resolveSelection({ curriculum: 'cbse', grade: 'class-7', topic: 'Ratios' });
    return planner.buildFallback(chosen, planner.allowedStandards(chosen));
  };
}

async function main() {
  reset();
  try {
    const empty = plannerRead.guidanceFrom({ planner: {} });
    equal(empty.suggestedEdits.length, 0, 'no suggested edits are invented');
    equal(empty.hintAdditions.length, 0, 'no hint additions are invented');
    equal(empty.hasGuidance, false, 'empty guidance is reported as absent');
    ok(/No planner-provided/.test(empty.message), 'the empty state names the real source');

    const source = {
      planner: {
        suggestedEdits: [
          { questionId: 'q_1', text: 'Use a shorter stem.' },
          'Split the final step.',
          { label: '' }
        ],
        hint_additions: [
          { id: 'q_2', hint: 'Offer a number line first.' }
        ]
      }
    };
    const parsed = plannerRead.guidanceFrom(source);
    equal(parsed.suggestedEdits.length, 2, 'camel-case suggested edits are read');
    equal(parsed.suggestedEdits[0].questionId, 'q_1', 'a real question id is preserved');
    equal(parsed.suggestedEdits[1].text, 'Split the final step.', 'plain-text edits are accepted');
    equal(parsed.hintAdditions[0].questionId, 'q_2', 'snake-case hint additions are read');
    equal(parsed.hasGuidance, true, 'real planner guidance is available');
    equal(parsed.message, '', 'a populated payload has no empty-state message');
    ok(!source.planner.suggestedEdits[0].extra, 'the reader does not write back to the source');

    const chosen = planner.resolveSelection({
      curriculum: 'cbse', grade: 'class-7', topic: 'Ratios'
    });
    await planner.getOrCreate(chosen);
    equal(calls, 1, 'the writer stub generated the stored planner');

    const record = mock.weeklyPlannerCache[0];
    record.planner.suggestedEdits = [{ questionId: 'q_1', text: 'Founder edit note.' }];
    record.planner.hintAdditions = [{ questionId: 'q_2', text: 'Founder hint note.' }];

    const beforeCache = mock.weeklyPlannerCache.length;
    const beforeArchive = mock.weeklyPlannerArchive.length;
    const beforePointers = mock.weeklyPlannerPointers.length;

    const read = await plannerRead.readActive(chosen);
    ok(read, 'an active stored planner is returned');
    equal(read.cache.hit, true, 'the projection reports a stored hit');
    equal(read.cache.source, 'stored', 'the projection never claims generation');
    equal(read.guidance && read.guidance.suggestedEdits[0].text, 'Founder edit note.',
      'a real suggested edit is exposed');
    equal(read.guidance && read.guidance.hintAdditions[0].text, 'Founder hint note.',
      'a real hint addition is exposed');

    const other = await plannerRead.readActive(planner.resolveSelection({
      curriculum: 'cbse', grade: 'class-8'
    }));
    equal(other, null, 'a missing planner is not created by the reader');
    equal(calls, 1, 'the read path called no provider');
    equal(mock.weeklyPlannerCache.length, beforeCache, 'the cache did not grow');
    equal(mock.weeklyPlannerArchive.length, beforeArchive, 'no version was archived');
    equal(mock.weeklyPlannerPointers.length, beforePointers, 'no pointer moved');

    const copy = await plannerRead.readActive(chosen);
    copy.planner.meta.title = 'Changed in the caller';
    const again = await db.findWeeklyPlannerCache(read.cache.cacheKey);
    ok(again && again.planner.meta.title !== 'Changed in the caller',
      'the returned planner is a defensive copy');

    console.log('plannerRead: ' + checks + ' assertions passed');
  } finally {
    reset();
    ai.generateAIResponse = originalGenerate;
  }
}

main().catch(function (error) {
  console.error('plannerRead: FAILED');
  console.error(error);
  process.exitCode = 1;
});
