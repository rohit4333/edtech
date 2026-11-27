/* Planner Agent desk contract.
 *
 * Founder rule: agent authoring is paused. The agent can read the catalogue
 * and any already-generated planner, but every mutation route is founder-only
 * and the service itself refuses a direct propose call. No child scope, founder
 * decision or planner write is available to the agent credential.
 */

const assert = require('assert');
const app = require('../app');
const db = require('../db');
const mock = require('../db/mock');
const planner = require('../services/weeklyPlannerService');
const plannerAgent = require('../services/plannerAgentService');
const ai = require('../services/cloudflareAiService');

const originalGenerate = ai.generateAIResponse;
let checks = 0;
let generationCalls = 0;

function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function resetPlannerState() {
  mock.weeklyPlannerCache.length = 0;
  mock.weeklyPlannerArchive.length = 0;
  mock.weeklyPlannerPointers.length = 0;
  generationCalls = 0;
  ai.generateAIResponse = async function () {
    generationCalls += 1;
    const chosen = planner.resolveSelection({
      subject: 'coding', curriculum: 'cbse', grade: 'class-7', topic: 'Loops'
    });
    return planner.buildFallback(chosen, planner.allowedStandards(chosen));
  };
}

async function main() {
  resetPlannerState();
  const server = await new Promise(function (resolve) {
    const instance = app.listen(0, '127.0.0.1', function () { resolve(instance); });
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  function request(method, path, body, token) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(async function (response) {
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch (error) { payload = text; }
      return { status: response.status, body: payload, text: text };
    });
  }

  function login(email, role) {
    return request('POST', '/api/auth/login', {
      email: email,
      password: process.env.DEMO_PASSWORD || 'mathify-demo',
      role: role || undefined
    });
  }

  try {
    const agentLogin = await login('planner@mathify.app', 'planner_agent');
    equal(agentLogin.status, 200, 'planner agent has its own working credential');
    equal(agentLogin.body.user.role, 'planner_agent', 'the token carries the agent role');
    const agent = agentLogin.body.token;
    const founder = (await login('founder@mathify.app')).body.token;
    const trainer = (await login('trainer@mathify.app')).body.token;

    const catalog = await request('GET', '/api/lms/curriculum-catalog', undefined, agent);
    equal(catalog.status, 200, 'the agent can open the LMS catalogue');
    equal(catalog.body.subjectCount, 3, 'the agent sees every field');
    ok(catalog.body.count >= 60, 'the catalogue count comes from the server');

    const selectionInput = {
      subject: 'coding', curriculum: 'cbse', grade: 'class-7', topic: 'Loops'
    };
    const query = '?subject=coding&curriculum=cbse&grade=class-7&topic=Loops';

    /* The desk is academic only. A child id must never travel through it. */
    const scoped = await request('GET',
      '/api/lms/planner?studentId=usr_student_001&subject=coding&curriculum=cbse&grade=class-7',
      undefined, agent);
    equal(scoped.status, 403, 'the agent cannot pass a student id');
    equal(scoped.body.error, 'FORBIDDEN_STUDENT_SCOPE', 'the scope refusal is explicit');

    const missingAgent = await request('GET', '/api/lms/planner' + query, undefined, agent);
    equal(missingAgent.status, 409, 'the agent does not generate a planner on a cache miss');
    equal(missingAgent.body.error, 'PLANNER_NOT_GENERATED', 'the miss is honest');
    const missingTrainer = await request('GET',
      '/api/lms/planner?studentId=usr_student_001&subject=math', undefined, trainer);
    equal(missingTrainer.status, 409, 'a trainer does not generate a planner on a cache miss');
    equal(generationCalls, 0, 'no non-founder read called the generation provider');

    const founderRead = await request('GET', '/api/lms/planner' + query, undefined, founder);
    equal(founderRead.status, 200, 'only the founder can generate a planner');
    equal(founderRead.body.cache.createdByRole, 'founder', 'founder generation is attributed to the founder');
    equal(founderRead.body.cache.source, 'ai', 'the founder call used the provider');
    equal(founderRead.body.cache.version, 1, 'the first planner is version 1');

    const agentRead = await request('GET', '/api/lms/planner' + query, undefined, agent);
    equal(agentRead.status, 200, 'the agent can now read the stored planner');
    equal(agentRead.body.cache.hit, true, 'the agent read is a stored cache hit');
    equal(agentRead.body.cache.version, 1, 'the agent read did not write a version');
    equal(generationCalls, 1, 'the agent read never called the provider');

    const selection = planner.resolveSelection(selectionInput);
    const valid = planner.buildFallback(selection, planner.allowedStandards(selection));

    const agentEdit = await request('PATCH', '/api/lms/planner',
      Object.assign({}, selectionInput, { planner: valid }), agent);
    equal(agentEdit.status, 403, 'the agent cannot edit a planner');
    const agentRegen = await request('POST', '/api/lms/planner/regenerate', selectionInput, agent);
    equal(agentRegen.status, 403, 'the agent cannot regenerate a planner');
    const trainerEdit = await request('PATCH', '/api/lms/planner',
      Object.assign({}, selectionInput, { planner: valid }), trainer);
    equal(trainerEdit.status, 403, 'a trainer cannot edit a planner');
    const trainerRegen = await request('POST', '/api/lms/planner/regenerate', selectionInput, trainer);
    equal(trainerRegen.status, 403, 'a trainer cannot regenerate a planner');

    const idea = await request('POST', '/api/lms/planner-suggestion',
      Object.assign({}, selectionInput, {
        planner: valid, note: 'Try shorter daily practice blocks.'
      }), agent);
    equal(idea.status, 403, 'the agent cannot file a new idea while mutation is paused');
    equal(idea.body.error, 'PLANNER_AGENT_MUTATIONS_DISABLED', 'the refusal is explicit');

    const direct = await plannerAgent.propose(
      Object.assign({}, selectionInput, { planner: valid, note: 'Direct call' }),
      { id: 'usr_planner_001', role: 'planner_agent' }
    ).then(function () { return null; }, function (error) { return error; });
    equal(direct && direct.code, 'PLANNER_AGENT_MUTATIONS_DISABLED',
      'the service refuses a direct agent mutation too');
    ok(!(await db.listRecords(plannerAgent.COLLECTION)).some(function (row) {
      return row && row.note === 'Direct call';
    }), 'a refused idea never reaches the record store');

    const queue = await request('GET', '/api/lms/planner-suggestions?subject=coding',
      undefined, founder);
    equal(queue.status, 200, 'the founder can review the idea queue');
    equal(queue.body.count, 0, 'no agent-authored idea was created');
    const decision = await request('POST', '/api/lms/planner-suggestion/sug_missing/decide',
      { decision: 'reject' }, agent);
    equal(decision.status, 403, 'the agent cannot review an idea');
    const founderDecision = await request('POST', '/api/lms/planner-suggestion/sug_missing/decide',
      { decision: 'reject' }, founder);
    equal(founderDecision.status, 404, 'only the founder reaches the decision service');

    const founderEdit = await request('PATCH', '/api/lms/planner',
      Object.assign({}, selectionInput, { planner: valid }), founder);
    equal(founderEdit.status, 200, 'the founder can edit a planner');
    equal(founderEdit.body.cache.createdByRole, 'founder', 'founder authorship is recorded');
    equal(founderEdit.body.cache.version, 2, 'the edit is an immutable new version');

    const founderRegen = await request('POST', '/api/lms/planner/regenerate', selectionInput, founder);
    equal(founderRegen.status, 200, 'the founder can regenerate a planner');
    equal(founderRegen.body.cache.version, 3, 'regeneration moves to the next version');

    const after = await request('GET', '/api/lms/planner' + query, undefined, agent);
    equal(after.body.cache.version, 3, 'the active plan reflects founder-only authoring');
    equal(after.body.cache.createdByRole, 'founder', 'the agent never becomes an author');

    const admin = await request('GET', '/api/admin/users', undefined, agent);
    ok(admin.status === 403 || admin.status === 404, 'the agent has no founder admin powers');
    const rmDesk = await request('GET', '/api/rm/dashboard', undefined, agent);
    ok(rmDesk.status === 403 || rmDesk.status === 404, 'the agent has no relationship-manager powers');

    const rm = (await login('rm@mathify.app')).body.token;
    const rmQueue = await request('GET', '/api/lms/planner-suggestions', undefined, rm);
    equal(rmQueue.status, 403, 'the relationship manager is refused at the idea queue');
    const rmCatalog = await request('GET', '/api/lms/curriculum-catalog', undefined, rm);
    equal(rmCatalog.status, 403, 'the relationship manager is refused at the LMS gate');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    resetPlannerState();
    ai.generateAIResponse = originalGenerate;
  }

  console.log('plannerAgent: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error('plannerAgent: FAILED');
  console.error(error);
  process.exitCode = 1;
});
