/* Static navigation contract. Every surface links the Razorpay-required
   policy pages; dashboard navigation never dead-ends on href="#"; and the
   public nav is exactly the seven approved destinations. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const checks = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function ok(value, label) {
  assert.strictEqual(Boolean(value), true, label);
  checks.push(label);
}

const REQUIRED = ['pricing.html', 'terms.html', 'privacy.html', 'refund.html', 'contact.html'];

/* The five payment-policy destinations appear in every user-facing surface. */
[
  'index.html',
  'student/index.html',
  'trainer/index.html',
  'lms/index.html',
  'classroom/index.html'
].forEach(function (surface) {
  const html = read(surface);
  REQUIRED.forEach(function (page) {
    ok(html.indexOf(page) !== -1, surface + ' links ' + page);
  });
});

/* Public nav is exact and ordered. */
const publicNav = read('index.html').match(/<nav class="nav-links"[\s\S]*?<\/nav>/)[0];
const publicHrefs = (publicNav.match(/href="[^"]+"/g) || []).map(function (value) {
  return value.slice(6, -1);
});
assert.deepStrictEqual(publicHrefs, [
  'index.html', 'pricing.html', 'terms.html', 'privacy.html',
  'refund.html', 'contact.html', 'contact.html'
]);
checks.push('public nav is the exact seven-item list');

/* Dashboard navigation resolves to a real section or a real page. */
['student/index.html', 'trainer/index.html'].forEach(function (surface) {
  const html = read(surface);
  ok(html.indexOf('href="#"') === -1, surface + ' has no dead-end links');
  ok(html.indexOf('Batch pause') === -1, surface + ' has no Batch pause dead end');
  ok(html.indexOf('Community') === -1, surface + ' has no group-class Community link');

  const nav = html.match(/<nav class="nav"[\s\S]*?<\/nav>/)[0];
  const sectionIds = Array.from(html.matchAll(/\sid="([^"]+)"/g)).map(function (match) {
    return match[1];
  });
  const targets = Array.from(nav.matchAll(/<a[^>]+href="#([^"]+)"/g)).map(function (match) {
    return match[1];
  });
  ok(targets.length === 5, surface + ' has five nav destinations');
  targets.forEach(function (target) {
    ok(sectionIds.indexOf(target) !== -1, surface + ' nav target #' + target + ' exists');
  });
});

console.log('navContract: ' + checks.length + ' assertions passed');
