/* Installable web app contract: the whole reviewed site is one origin, one
 * manifest, one service worker and one injected bootstrap. Private API,
 * founder-admin and auth data are never cached or duplicated in the shell. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function main() {
  const manifest = JSON.parse(read('webapp/manifest.webmanifest'));
  check(manifest.display === 'standalone' && manifest.scope === '/' && manifest.start_url === '/',
    'the web app installs as a standalone same-origin application');
  check(Array.isArray(manifest.icons) && manifest.icons.length >= 2 &&
    manifest.icons.some(function (i) { return i.sizes === '512x512'; }),
  'the manifest has installable 192/512 icons');
  check(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 4,
    'the launcher shortcuts reach connect, student, trainer and apps surfaces');
  ['/webapp/icon-192.png', '/webapp/icon-512.png', '/webapp/icon-maskable-512.png']
    .forEach(function (icon) {
      check(fs.existsSync(path.join(root, icon.replace(/^\//, ''))), icon + ' exists');
    });

  const worker = read('sw.js');
  check(/new URL\(request\.url\)/.test(worker) && /url\.origin !== self\.location\.origin/.test(worker),
    'the service worker ignores cross-origin requests');
  check(/pathname\.indexOf\('\/api\/'\) === 0/.test(worker) &&
    /pathname\.indexOf\('\/founder-admin'\) === 0/.test(worker),
  'API and founder-admin responses are never cached');
  check(/request\.mode === 'navigate'/.test(worker) && /networkFirst\(request\)/.test(worker),
    'HTML navigation is network-first with an honest offline fallback');
  check(/staleWhileRevalidate\(request\)/.test(worker) && /request\.method !== 'GET'/.test(worker),
    'only safe static GET assets use cache reuse');
  check(/\/classroom\/connect\.html/.test(worker) && /\/classroom\/index\.html/.test(worker) &&
    /\/unified\/index\.html/.test(worker),
  'the cached shell includes camera check, classroom and unified app pages');

  const bootstrap = read('webapp/register.js');
  check(/rel = 'manifest'/.test(bootstrap) &&
    /navigator\.serviceWorker\.register\(SW, \{ scope: '\/' \}\)/.test(bootstrap),
  'the shared bootstrap registers the manifest and root-scoped worker');
  check(/beforeinstallprompt/.test(bootstrap) && /userChoice/.test(bootstrap),
    'install is user-initiated and never forced');

  const app = read('server/app.js');
  check(/\/webapp\/register\.js/.test(app) && /sendWebAppHtml\(/.test(app),
    'the server injects one web-app bootstrap into reviewed HTML pages');
  check(/Service-Worker-Allowed/.test(app) && /application\/manifest\+json/.test(app),
    'the service worker and manifest are served with the correct headers');
  check(/publicFiles\.has/.test(app) && /'webapp'/.test(app),
    'web app assets are allowlisted next to the existing public directories');

  const docker = read('Dockerfile');
  [
    'password-reset.html', 'landing.css', 'login.html', 'register.html',
    'COPY founder ./founder', 'COPY founder-admin ./founder-admin',
    'COPY login ./login', 'COPY parent ./parent', 'COPY planner-agent ./planner-agent',
    'COPY register ./register', 'COPY rm ./rm', 'COPY unified ./unified',
    'COPY webapp ./webapp', 'sw.js'
  ].forEach(function (entry) {
    check(docker.includes(entry), 'Docker image ships ' + entry);
  });

  const student = read('student/index.html');
  check(!/whiteboard\.css/.test(student),
    'the student desk has no stale stylesheet reference');

  console.log('webApp: ' + assertions + ' assertions passed');
}

main();
