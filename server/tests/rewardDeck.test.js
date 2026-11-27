/* Trainer celebration deck contract. The deck is trainer-only, active-session
   scoped, icon-only, and available on the dashboard and camera check page.
   It never appears on student surfaces. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
let checks = 0;
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks += 1;
}
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function main() {
  const trainerHtml = read('trainer/index.html');
  const connectHtml = read('classroom/connect.html');
  const trainerApp = read('trainer/app.js');
  const deckJs = read('shared/rewardDeck.js');
  const deckCss = read('shared/rewardDeck.css');
  const boardCss = read('shared/fullBoard.css');

  ok(trainerHtml.indexOf('rewardDeck.css') === -1 &&
    trainerHtml.indexOf('rewardDeck.js') === -1,
  'the trainer dashboard never loads the celebration deck');
  ok(connectHtml.indexOf('href="../shared/rewardDeck.css"') !== -1 &&
    connectHtml.indexOf('src="../shared/rewardDeck.js"') !== -1,
  'the trainer camera check page loads the shared celebration deck');
  ok(trainerHtml.indexOf('id="cameraOnlyBtn"') !== -1 &&
    trainerHtml.indexOf('id="i-cam"') !== -1,
  'the dashboard has a camera-only return action');
  ok(trainerApp.indexOf("cameraOnlyBtn')") !== -1 &&
    trainerApp.indexOf("&camera=1") !== -1,
  'camera-only returns to the connect page');
  ok(trainerApp.indexOf('window.MATHIFY_SESSION_ID = session.id') !== -1,
  'an active dashboard session exposes its id to the deck');

  ok(deckJs.indexOf("declaredRole === 'student'") !== -1 &&
    deckJs.indexOf('!connectPage || studentView') !== -1,
  'the deck refuses student roles and every non-connect page');
  ok(deckJs.indexOf("[data-celebration-style]')") !== -1,
  'the classroom keeps its own deck without a duplicate');
  ok(deckJs.indexOf("state.status === 'live'") !== -1 &&
    deckJs.indexOf('connectPage && sessionLive && sessionId()') !== -1,
  'the deck mounts only after the server confirms a live session');
  ok(deckJs.indexOf("aria-label', 'Celebration controls'") !== -1 &&
    deckJs.indexOf('>Rewards<') === -1 &&
    deckJs.indexOf('reward-deck-label') === -1,
  'the deck is icon-only with no visible reward wording');
  ok(deckJs.indexOf("['👏', '⭐', '🎯', '🎉', '🥳', '🔥']") !== -1 &&
    deckJs.indexOf("id: 'paper_ribbons'") !== -1 &&
    deckJs.indexOf("id: 'milestone_seal'") !== -1,
  'the deck offers trainer reactions and six icon styles');
  ok(deckJs.indexOf("node.className = 'rd-particle '") !== -1 &&
    deckJs.indexOf('rd-wash') !== -1 &&
    deckJs.indexOf('rd-ring rd-ring-') !== -1 &&
    deckJs.indexOf('rd-badge') !== -1,
  'every click renders layered wash, rings, badge and particles');
  ok(deckJs.indexOf("sendCelebration(id, 'trainer_kudos'") !== -1 &&
    deckJs.indexOf("sendReaction(id, body.emoji)") !== -1,
  'the deck sends only allowlisted shared events');
  ok(deckJs.indexOf('Math.min(0.6, 0.3)') !== -1 &&
    deckJs.indexOf('localMuteAllowed') === -1,
  'sound is always on, capped, and has no mute control');

  ok(deckCss.indexOf('position:fixed') !== -1 &&
    deckCss.indexOf('pointer-events:none') !== -1 &&
    deckCss.indexOf('prefers-reduced-motion: reduce') !== -1,
  'the stage is a fixed, non-interactive surface with a static fallback');
  ok(boardCss.indexOf('color:var(--ink);opacity:.22') !== -1 &&
    boardCss.indexOf('pointer-events:none;user-select:none') !== -1,
  'board watermarks are visibly quiet and never take a pointer');

  console.log('rewardDeck: ' + checks + ' assertions passed');
}

main();
