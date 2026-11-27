/* Static LMS client contract for view-only trainer authoring boundaries.
 *
 * Server routes are exercised separately; this test keeps the browser surface
 * from quietly restoring trainer or planner-agent mutation controls.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
let checks = 0;

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function absent(source, needle, label) {
  ok(source.indexOf(needle) === -1, label);
}

const api = read('lms/api.js');
const access = read('lms/access.js');
const app = read('lms/app.js');
const autoPlanner = read('lms/autoPlanner.js');
const assigned = read('lms/assignedPlanner.js');
const html = read('lms/index.html');

/* No browser helper may claim an agent authoring capability. */
absent(api, 'plannerAgentRegenerate', 'the client exposes no agent regenerate call');
absent(api, 'plannerAgentEdit', 'the client exposes no agent edit call');
absent(api, 'plannerSuggest:', 'the client exposes no agent idea-filing call');
ok(api.indexOf('Planner-agent authoring is paused') !== -1,
  'the only agent mutation helper is a disabled stub');
ok(api.indexOf('assignedPlanners:') !== -1, 'the client exposes the batch-scoped trainer read');
ok(api.indexOf('plannerGuidance:') !== -1, 'the client exposes quiz guidance reads');
ok(api.indexOf('PLANNER_AGENT_MUTATIONS_DISABLED') !== -1,
  'a disabled agent mutation reports a stable code');

/* The shared planner view has no design, regeneration or idea controls. */
absent(autoPlanner, 'runAgentMutation', 'the planner view has no mutation runner');
absent(autoPlanner, 'agentToolsNode', 'the planner view has no agent tools');
absent(autoPlanner, 'FOUNDER_PLANNER_IMMUTABLE', 'the planner view has no old agent edit branch');
ok(autoPlanner.indexOf('Planner-agent authoring is disabled') !== -1,
  'the agent sees an explicit read-only notice');
ok(autoPlanner.indexOf('isTrainer()') !== -1, 'the trainer is routed to the assigned surface');

/* The library uses the server catalogue and hides local authoring from others. */
ok(app.indexOf('client.catalog()') !== -1, 'the library loads the server catalogue');
ok(app.indexOf('state.catalogMeta.count') !== -1, 'display counts come from server metadata');
ok(app.indexOf("access.role() === 'trainer') return false") !== -1,
  'local seed courses are excluded from the trainer library');
ok(access.indexOf('canAuthor() { return identity.role === \'founder\'; }') !== -1,
  'authoring is founder-only in the access gate');

/* The trainer surface is read-only by construction. */
ok(assigned.indexOf('/lms/assigned-planners') === -1,
  'the trainer surface calls the API client, not a hard-coded endpoint');
ok(assigned.indexOf('client.assignedPlanners()') !== -1,
  'the trainer surface calls only the assigned read');
absent(assigned, 'plannerEdit', 'the trainer surface has no edit call');
absent(assigned, 'plannerRegenerate', 'the trainer surface has no regenerate call');
absent(assigned, 'plannerSuggest', 'the trainer surface has no idea call');

/* Brand and navigation invariants still hold on the LMS surface. */
ok(html.indexOf('Mathify<i>.</i>') !== -1, 'the LMS keeps the Mathify brand mark');
absent(html, 'href="#"', 'the LMS has no dead-end nav link');
absent(html, '<iframe', 'the LMS has no iframe');
['pricing.html', 'terms.html', 'privacy.html', 'refund.html', 'contact.html'].forEach(function (page) {
  ok(html.indexOf(page) !== -1, 'the LMS links ' + page);
});
ok(html.indexOf('assignedPlanner.css') !== -1 && html.indexOf('assignedPlanner.js') !== -1,
  'the LMS loads the assigned-planner surface');

console.log('lmsClientContract: ' + checks + ' assertions passed');
