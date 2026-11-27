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
  const engagementCss = read('classroom/engagement.css');

  ok(trainerHtml.indexOf('href="../shared/rewardDeck.css"') !== -1 &&
    trainerHtml.indexOf('src="../shared/rewardDeck.js"') !== -1,
  'the trainer dashboard loads the shared celebration deck');
  ok(connectHtml.indexOf('href="../shared/rewardDeck.css"') !== -1 &&
    connectHtml.indexOf('src="../shared/rewardDeck.js"') !== -1,
  'the trainer camera check page loads the same celebration deck');
  ok(trainerHtml.indexOf('id="startClass"') !== -1 &&
    trainerHtml.indexOf('id="cameraOnlyBtn"') === -1,
  'Start class is the dashboard’s only entry into the connect flow');
  ok(trainerApp.indexOf("$('#startClass')") !== -1 &&
    trainerApp.indexOf('cameraOnlyBtn') === -1 &&
    trainerApp.indexOf('&camera=1') === -1,
  'the dashboard opens the connect page without a camera-only action or flag');
  ok(trainerApp.indexOf('window.MATHIFY_SESSION_ID = session.id') !== -1,
  'an active dashboard session exposes its id to the deck');

  ok(deckJs.indexOf("params.get('role') === 'student'") !== -1 &&
    deckJs.indexOf('!trainerSurface || studentView') !== -1 &&
    deckJs.indexOf('trainerDashboard = /(^|\\/)trainer\\//') !== -1 &&
    deckJs.indexOf('!trainerCredential') !== -1,
  'the deck refuses student roles, unauthenticated pages and every non-trainer page');
  ok(deckJs.indexOf("[data-celebration-style]')") !== -1,
  'the classroom keeps its own deck without a duplicate');
  ok(engagementCss.indexOf('body.board-open .side > .room-card') !== -1 &&
    engagementCss.indexOf('body.board-open .side > .room-card .engagement-bar') !== -1,
  'the classroom engagement strip stays visible over the full board on tablet widths');
  ok(deckJs.indexOf("state.status === 'live'") !== -1 &&
    deckJs.indexOf('trainerSurface && sessionLive && sessionId()') !== -1 &&
    deckJs.indexOf("window.mathifyTrainerApi.getSessionState(id)") !== -1 &&
    deckJs.indexOf("request('/sessions/' + encodeURIComponent(id) + '/state')") !== -1,
  'the dashboard deck mounts only after the server confirms a live session');
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
  var markBlock = boardCss.slice(boardCss.indexOf('.mathify-board-mark{'));
  markBlock = markBlock.slice(0, markBlock.indexOf('}'));
  var markOpacity = Number((markBlock.match(/opacity:\s*([\d.]+)/) || [])[1]);
  ok(markBlock.indexOf('left:50%;top:50%') !== -1 &&
    markBlock.indexOf('pointer-events:none;user-select:none') !== -1 &&
    markBlock.indexOf('transform:translate(-50%,-50%) rotate(-30deg)') !== -1 &&
    markBlock.indexOf('font:400 clamp(72px,13vw,200px)/1 var(--sans)') !== -1 &&
    markBlock.indexOf('color:#BDB7AD') !== -1 &&
    markBlock.indexOf('background-image') === -1 &&
    boardCss.indexOf('.mathify-board-mark i{font-style:normal;font-weight:400') !== -1 &&
    markOpacity >= 0.18 && markOpacity <= 0.28,
  'board watermarks are a centred, upright regular-weight very-light-grey diagonal document print and never take a pointer');

  console.log('rewardDeck: ' + checks + ' assertions passed');
}

main();
