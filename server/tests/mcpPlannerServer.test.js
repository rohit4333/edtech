/* Contract for the planner designer MCP: bounded dry-run generation, a
 * deterministic rubric, profile-scoped submit and a still-closed browser
 * planner_agent role. AI calls are stubbed; no real provider or network is used. */

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const plannerServer = require('../mcp-planner-server');
const planner = require('../services/weeklyPlannerService');
const plannerAgent = require('../services/plannerAgentService');
const rubric = require('../services/plannerRubricService');
const ai = require('../services/cloudflareAiService');

let checks = 0;
function equal(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  checks += 1;
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}

const SELECTION = {
  subject: 'math', curriculum: 'cbse', grade: 'class-7', topic: 'Ratios'
};
const originalGenerate = ai.generateAIResponse;
let validPlanner;

function stubProviders() {
  ai.generateAIResponse = async function (system) {
    if (String(system).indexOf('independent planner reviewer') !== -1) {
      return JSON.stringify({ verdict: 'pass', findings: [] });
    }
    return JSON.stringify(validPlanner);
  };
}

async function call(server, name, args) {
  const response = await server.handleMessage({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: name, arguments: args }
  });
  assert.strictEqual(response.error, undefined, 'tool call has no protocol error: ' + name);
  return response.result.structuredContent;
}

async function main() {
  const selection = planner.resolveSelection(SELECTION);
  validPlanner = planner.buildFallback(selection, planner.allowedStandards(selection));
  validPlanner.meta.title = 'Ratios maths week';
  stubProviders();

  const closed = plannerServer.createServer({ token: '', authorized: false });
  const init = await closed.handleMessage({ jsonrpc: '2.0', id: 0, method: 'initialize' });
  equal(init.result.serverInfo.name, 'mathify-planner-designer', 'handshake is public');
  const denied = await closed.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  equal(denied.error.code, -32001, 'discovery refuses an unauthenticated client');
  equal(denied.error.data.code, 'MCP_PLANNER_TOKEN_REQUIRED', 'refusal carries a stable code');

  const review = plannerServer.createServer({ token: 'review-token', authorized: true, profile: 'review' });
  const author = plannerServer.createServer({ token: 'author-token', authorized: true, profile: 'planner_designer' });
  const reviewList = await review.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const authorList = await author.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const reviewNames = reviewList.result.tools.map(function (tool) { return tool.name; });
  const authorNames = authorList.result.tools.map(function (tool) { return tool.name; });
  ok(reviewNames.indexOf('draft_planner') !== -1, 'review profile can draft');
  equal(reviewNames.indexOf('submit_planner_draft'), -1, 'review profile cannot submit');
  ok(authorNames.indexOf('submit_planner_draft') !== -1, 'author profile can submit a suggestion');
  equal(authorNames.indexOf('publish_planner_draft'), -1, 'no autonomous publish tool exists');

  const draft = await call(review, 'draft_planner', SELECTION);
  equal(draft.evaluation.ok, true, 'the rubric passes a valid draft');
  equal(draft.evaluation.score, 100, 'score is fully evidence-backed');
  ok(draft.draft && draft.draft.week, 'a dry-run draft is returned');
  equal(draft.executed, false, 'drafting executes nothing');
  ok(draft.hash && draft.hash.length === 64, 'draft has a sha256 evidence hash');

  const regenerated = await call(review, 'regenerate_until_pass', SELECTION);
  equal(regenerated.passed, true, 'bounded loop reaches a passing draft');
  equal(regenerated.attempts, 1, 'loop stops as soon as the rubric passes');
  equal(regenerated.trace.length, 1, 'trace records the attempt');
  ok(regenerated.pendingFounderInput.length >= 1, 'pending founder rules remain visible');

  const checked = await call(review, 'cross_check_planner', Object.assign({}, SELECTION, {
    planner: validPlanner
  }));
  equal(checked.verdict, 'pass', 'second-pass review is parsed');
  equal(checked.executed, false, 'cross-check executes nothing');

  const tampered = JSON.parse(JSON.stringify(validPlanner));
  delete tampered.week;
  const invalid = await call(review, 'validate_planner', Object.assign({}, SELECTION, { planner: tampered }));
  equal(invalid.evaluation.ok, false, 'an invalid planner is rejected');
  ok(invalid.evaluation.hardGateFailures.indexOf('schema') !== -1, 'schema hard gate fails');

  let browserRefusal = null;
  try {
    await plannerAgent.propose(Object.assign({}, SELECTION, { planner: validPlanner }), {
      id: 'browser_agent', role: 'planner_agent'
    });
  } catch (error) {
    browserRefusal = error;
  }
  ok(browserRefusal, 'browser planner_agent proposal is refused');
  equal(browserRefusal.code, 'PLANNER_AGENT_MUTATIONS_DISABLED', 'global fail-closed flag is unchanged');

  const submitted = await call(author, 'submit_planner_draft', Object.assign({}, SELECTION, {
    planner: validPlanner, note: 'MCP planner designer test'
  }));
  equal(submitted.suggestion.status, 'pending', 'submission is a pending review item');
  equal(submitted.suggestion.authorRole, 'planner_designer', 'service identity is recorded');
  equal(submitted.status, 'pending', 'no active planner is published');
  ok(submitted.requiresFounderApproval === true, 'founder approval is explicit');
  ok(submitted.evaluation.hash.length === 64, 'submission carries an evidence hash');

  const logPath = path.join(__dirname, '..', 'logs', 'mcp-actions.jsonl');
  ok(fs.existsSync(logPath), 'MCP audit log exists');
  const logText = fs.readFileSync(logPath, 'utf8');
  ok(logText.indexOf('draft_planner') !== -1, 'audit log records tool names');
  equal(/authorization|bearer|token/i.test(logText.slice(-4000)), false, 'audit log carries no token material');

  ai.generateAIResponse = originalGenerate;
  console.log('mcpPlannerServer: ' + checks + ' assertions passed');
}

main().catch(function (error) {
  ai.generateAIResponse = originalGenerate;
  console.error(error);
  process.exitCode = 1;
});
