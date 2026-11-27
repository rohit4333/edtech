/* Local walkthrough fixture only.
 *
 * Usage:
 *   $env:DATABASE_MODE = "mock"
 *   node -r ./scripts/load-dev-planner-fixture.js server/index.js
 *
 * It replaces ses_math_001's quiz with the temporary Ratio Railway fixture and
 * attaches a read-only story guide. It is never loaded when NODE_ENV=production,
 * and it does not create any endpoint or trainer mutation path.
 */

'use strict';

if (process.env.NODE_ENV === 'production') {
  console.warn('[dev-planner] skipped: NODE_ENV=production');
} else {
  const db = require('../server/db');
  const fixture = require('../server/services/temporaryPlannerFixture');
  const source = fixture.load();
  const sessionId = process.env.MATHIFY_DEV_PLANNER_SESSION || 'ses_math_001';

  const updated = db.updateSession(sessionId, function (session) {
    return fixture.apply(session, source);
  });
  if (!updated) {
    console.warn('[dev-planner] session not found: ' + sessionId);
  } else {
    const built = fixture.build(source);
    console.warn('[dev-planner] loaded ' + built.questions.length + ' practice questions from ' +
      source.id + ' into ' + sessionId + ' (temporary fixture, not a founder planner).');
  }
}
