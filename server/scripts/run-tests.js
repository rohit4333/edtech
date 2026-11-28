/* Deterministic test runner.
 *
 * The npm test script used to be one very long && chain. Keeping the ordered
 * suite list here lets c8 wrap one process, so V8 coverage from every child
 * suite is collected into a single report. Fail-fast behaviour is preserved.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const suites = [
  'tests/payoutService.test.js',
  'tests/attendancePolicy.test.js',
  'tests/leaveService.test.js',
  'tests/masteryGating.test.js',
  'tests/quizGenerator.test.js',
  'tests/quizPromptInjection.test.js',
  'tests/cloudflareClient.test.js',
  'tests/curriculumAuthoring.test.js',
  'tests/curriculumContext.test.js',
  'tests/aiCurriculumIntegration.test.js',
  'tests/studentSerializer.test.js',
  'tests/privacyBoundary.test.js',
  'tests/chatAssistant.test.js',
  'tests/chatWorker.test.js',
  'tests/masteryPractice.test.js',
  'tests/curriculumPersistence.test.js',
  'tests/navContract.test.js',
  'tests/slotService.test.js',
  'tests/presenceService.test.js',
  'tests/apiSmoke.test.js',
  'tests/parentChat.test.js',
  'tests/scaffoldedUI.test.js',
  'tests/liveReadiness.test.js',
  'tests/livePersistence.test.js',
  'tests/liveOperations.test.js',
  'tests/rtcControls.test.js',
  'tests/sessionPolicy.test.js',
  'tests/sessionLifetime.test.js',
  'tests/credentialLogin.test.js',
  'tests/engagementControls.test.js',
  'tests/trainerOnboarding.test.js',
  'tests/announcements.test.js',
  'tests/concurrency.test.js',
  'tests/asyncAuthMiddleware.test.js',
  'tests/mcpServer.test.js',
  'tests/mcpPlannerServer.test.js',
  'tests/mcpRmServer.test.js',
  'tests/razorpayWebhook.test.js',
  'tests/founderAdmin.test.js',
  'tests/relationshipManager.test.js',
  'tests/rmPayAccess.test.js',
  'tests/rewardDeck.test.js',
  'tests/registration.test.js',
  'tests/passwordFlow.test.js',
  'tests/adminAudit.test.js',
  'tests/fullBoard.test.js',
  'tests/asyncLoginRehash.test.js',
  'tests/alternateAiProviders.test.js',
  'tests/livekitEgress.test.js',
  'tests/livekitWebhooks.test.js',
  'tests/reminderTimezone.test.js',
  'tests/recordingAccess.test.js',
  'tests/securityHardening.test.js',
  'tests/autoPlanner.test.js',
  'tests/demoLifecycle.test.js',
  'tests/batchRenewalMail.test.js',
  'tests/subjectExpansion.test.js',
  'tests/plannerAgent.test.js',
  'tests/studentDoubtQuota.test.js',
  'tests/unifiedApp.test.js',
  'tests/cameraConnect.test.js',
  'tests/mobileShell.test.js',
  'tests/webApp.test.js',
  'tests/temporaryPlannerFlow.test.js',
  'tests/preflightFlow.test.js',
];

const root = __dirname + path.sep + '..';

for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error('Unable to run ' + suite + ': ' + result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('All ' + suites.length + ' suites passed.');
