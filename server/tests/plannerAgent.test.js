/* Planner Agent desk contract.
 *
 * The agent has its own credential and can design every LMS field, but it must
 * never delete or replace founder work. Founder-created planners are immutable
 * to it: the agent files an alternate idea that only the founder may accept or
 * reject. Every idea stays in the service-only record store and no cache write
 * or pointer move happens until the founder decides. */

const assert = require('assert');
const app = require('../app');
const planner = require('../services/weeklyPlannerService');

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

async function main() {
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
      return { status: response.status, body: payload };
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

    const catalog = await request('GET', '/api/lms/curriculum-catalog', undefined, agent);
    equal(catalog.status, 200, 'the agent can open the LMS catalogue');
    equal(catalog.body.subjectCount, 3, 'the agent sees every field');

    const selectionInput = {
      subject: 'coding', curriculum: 'cbse', grade: 'class-7', topic: 'Loops'
    };
    const query = '?subject=coding&curriculum=cbse&grade=class-7&topic=Loops';
    const first = await request('GET', '/api/lms/planner' + query, undefined, agent);
    equal(first.status, 200, 'the agent can open any subject planner');
    equal(first.body.selection.subject, 'coding', 'the selection keeps its subject');
    equal(first.body.cache.subject, 'coding', 'the cache record keeps its subject');

    const selection = planner.resolveSelection(selectionInput);
    const valid = planner.buildFallback(selection, planner.allowedStandards(selection));

    const agentEdit = await request('PATCH', '/api/lms/planner',
      Object.assign({}, selectionInput, { planner: valid }), agent);
    equal(agentEdit.status, 200, 'the agent can edit a non-founder planner');
    equal(agentEdit.body.cache.createdByRole, 'planner_agent', 'agent authorship is recorded');
    equal(agentEdit.body.cache.version, 2, 'the agent edit is an immutable new version');

    const founderEdit = await request('PATCH', '/api/lms/planner',
      Object.assign({}, selectionInput, { planner: valid }), founder);
    equal(founderEdit.status, 200, 'the founder can edit a planner');
    equal(founderEdit.body.cache.createdByRole, 'founder', 'founder authorship is recorded');

    const blockedEdit = await request('PATCH', '/api/lms/planner',
      Object.assign({}, selectionInput, { planner: valid }), agent);
    equal(blockedEdit.status, 409, 'the agent cannot replace founder work');
    equal(blockedEdit.body.error, 'FOUNDER_PLANNER_IMMUTABLE', 'the refusal is explicit');
    const blockedRegen = await request('POST', '/api/lms/planner/regenerate', selectionInput, agent);
    equal(blockedRegen.status, 409, 'the agent cannot regenerate founder work');

    /* The desk is academic only. A child id must never travel through it. */
    const scoped = await request('GET',
      '/api/lms/planner?studentId=usr_student_001&subject=coding&curriculum=cbse&grade=class-7',
      undefined, agent);
    equal(scoped.status, 403, 'the agent cannot pass a student id');
    equal(scoped.body.error, 'FORBIDDEN_STUDENT_SCOPE', 'the scope refusal is explicit');

    const idea = await request('POST', '/api/lms/planner-suggestion',
      Object.assign({}, selectionInput, {
        planner: valid, note: 'Try shorter daily practice blocks.'
      }), agent);
    equal(idea.status, 201, 'the agent can file an alternate idea');
    equal(idea.body.suggestion.status, 'pending', 'the idea waits for the founder');
    equal(idea.body.suggestion.targetAuthoredByRole, 'founder', 'the idea records target authorship');

    const queue = await request('GET', '/api/lms/planner-suggestions?subject=coding',
      undefined, founder);
    equal(queue.status, 200, 'the founder can review the idea queue');
    ok(queue.body.count >= 1, 'the idea is visible to the founder');
    const id = idea.body.suggestion.id;

    const agentDecision = await request('POST', '/api/lms/planner-suggestion/' + id + '/decide',
      { decision: 'reject' }, agent);
    equal(agentDecision.status, 403, 'the agent cannot review its own idea');

    const accepted = await request('POST', '/api/lms/planner-suggestion/' + id + '/decide',
      { decision: 'accept' }, founder);
    equal(accepted.status, 200, 'the founder can accept an idea');
    equal(accepted.body.suggestion.status, 'accepted', 'the idea is marked accepted');
    equal(accepted.body.applied.cache.version, 4, 'acceptance creates the next immutable version');
    equal(accepted.body.applied.cache.createdByRole, 'founder', 'the accepted plan is founder-authored');

    const after = await request('GET', '/api/lms/planner' + query, undefined, agent);
    equal(after.body.cache.version, 4, 'the active plan reflects founder approval');
    const twice = await request('POST', '/api/lms/planner-suggestion/' + id + '/decide',
      { decision: 'reject' }, founder);
    equal(twice.status, 409, 'an idea cannot be reviewed twice');

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
  }

  console.log('plannerAgent: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
