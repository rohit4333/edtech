/* Generate the checked-in Capacitor config from one reviewed web origin.
 *
 * The mobile shells are thin wrappers around the same HTTPS web app. They never
 * copy server source, .env files, migrations or credentials into the APK/IPA.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const here = __dirname;
const mobileRoot = path.resolve(here, '..');
const args = process.argv.slice(2);
const platformIndex = args.indexOf('--platform');
const platform = platformIndex >= 0 ? args[platformIndex + 1] : '';
const defaultUrl = platform === 'android'
  ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
const raw = String(process.env.MATHIFY_WEB_URL || defaultUrl).trim();
let url;

try {
  url = new URL(raw);
} catch (error) {
  throw new Error('MATHIFY_WEB_URL must be an absolute http(s) URL.');
}
if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
  throw new Error('MATHIFY_WEB_URL must be an http(s) URL without credentials.');
}

const isHttp = url.protocol === 'http:';
/* The first document carries a one-shot marker. The shared web bootstrap uses
   it to request camera/microphone once during native installation/first launch,
   then removes it from the visible URL. No storage or photo-library plugin is
   generated: chat images use the OS-scoped file picker on demand. */
const nativeUrl = raw + (raw.indexOf('?') === -1 ? '?' : '&') + 'native=1';
const config = {
  appId: 'com.mathify.learningos',
  appName: 'Mathify',
  webDir: 'www',
  server: {
    url: nativeUrl,
    cleartext: isHttp
  },
  android: {
    allowMixedContent: isHttp
  },
  ios: {
    contentInset: 'always'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0c121d',
      showSpinner: false
    }
  }
};

fs.writeFileSync(
  path.join(mobileRoot, 'capacitor.config.json'),
  JSON.stringify(config, null, 2) + '\n'
);

const fallback = path.join(mobileRoot, 'www', 'index.html');
fs.mkdirSync(path.dirname(fallback), { recursive: true });
if (!fs.existsSync(fallback)) {
  fs.writeFileSync(fallback, [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Mathify</title></head>',
    '<body style="font-family:system-ui;background:#0c121d;color:#fdfaf3;display:grid;place-items:center;min-height:100vh;margin:0">',
    '<main><h1>Mathify</h1><p>Set MATHIFY_WEB_URL and run <code>npm run sync</code> to load the app.</p></main>',
    '</body></html>\n'
  ].join('\n'));
}

process.stdout.write('Capacitor web origin: ' + raw + '\n');
