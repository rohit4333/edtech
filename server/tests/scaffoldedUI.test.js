/* Static guard for the scaffolded-mastery UI contract. The classroom surface
   is vanilla HTML/JS with no build step, so these checks keep the student
   badge, gated progression and trainer-only override from being removed. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'classroom', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'classroom', 'session.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'classroom', 'session.css'), 'utf8');

let checks = 0;
function ok(value, label) {
  assert.ok(value, label);
  checks += 1;
}

ok(html.indexOf('id="quizPracticeBadge"') !== -1, 'student practice badge exists');
ok(
  html.indexOf("Practice Question: Let's try this one together!") !== -1,
  'exact student badge copy is present'
);
ok(html.indexOf('id="quizForceNext"') !== -1, 'trainer override button exists');
ok(html.indexOf('Trainer Override: Force Next') !== -1, 'exact override copy is present');
ok(
  html.indexOf('class="quiz-trainer trainer-only"') < html.indexOf('id="quizForceNext"'),
  'override button lives inside the trainer-only container'
);

ok(
  script.indexOf('requiresCorrectAnswer === true') !== -1,
  'client detects the required parallel check'
);
ok(
  script.indexOf('quizState.parallelSolved') !== -1,
  'client tracks backend-confirmed correctness'
);
ok(script.indexOf('/quiz/attempts/') !== -1, 'client reads attempt correctness from the server');
ok(
  script.indexOf('/quiz/new-check') !== -1,
  'client requests a parallel question from the trainer route'
);
ok(
  script.indexOf('force === true ? { force: true } : {}') !== -1,
  'client sends an explicit trainer override'
);
ok(
  /\$\$\('\.trainer-only'\)\.forEach\(function \(el\) \{\s*el\.remove\(\);\s*\}\);/.test(script),
  'trainer controls are removed from the student DOM'
);
ok(css.indexOf('.quiz-practice-badge') !== -1, 'badge has design-token styling');

console.log('scaffoldedUI: ' + checks + ' assertions passed');
