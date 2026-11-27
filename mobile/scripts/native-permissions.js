/* Idempotent native permission patch applied after `cap add` / `cap sync`.
 * Only camera, microphone, internet and local development transport are added.
 * No provider key, database URL or application secret is written to native files.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');
const configPath = path.join(mobileRoot, 'capacitor.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const httpOrigin = String((config.server && config.server.url) || '').startsWith('http://');

const androidManifest = path.join(mobileRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(androidManifest)) {
  let xml = fs.readFileSync(androidManifest, 'utf8');
  /* Capacitor's template places INTERNET after <application>; keep all
     permission declarations together at the top of the manifest. */
  const internetTag = '    <uses-permission android:name="android.permission.INTERNET" />';
  const applicationIndex = xml.indexOf('<application');
  const internetIndex = xml.indexOf(internetTag);
  if (applicationIndex > 0 && internetIndex > applicationIndex) {
    xml = xml.replace('\n\n    <!-- Permissions -->\n\n' + internetTag, '')
      .replace(internetTag + '\n', '');
    xml = xml.replace(/(\s*)<application/, '\n' + internetTag + '\n    <application');
  }
  const permissions = [
    'android.permission.INTERNET',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS'
  ];
  const missing = permissions.filter(function (name) {
    return xml.indexOf('android:name="' + name + '"') === -1;
  });
  if (missing.length) {
    const block = missing.map(function (name) {
      return '    <uses-permission android:name="' + name + '" />';
    }).join('\n') + '\n';
    xml = xml.replace(/(\s*)<application/, '\n' + block + '    <application');
    fs.writeFileSync(androidManifest, xml);
  }
}

const iosPlist = path.join(mobileRoot, 'ios', 'App', 'App', 'Info.plist');
if (fs.existsSync(iosPlist)) {
  let xml = fs.readFileSync(iosPlist, 'utf8');
  let changed = false;
  /* Local HTTP origins need an explicit development exception. A production
     HTTPS sync removes it again so the shipped app keeps ATS enabled. */
  const ats = /\s*<key>NSAppTransportSecurity<\/key>\s*<dict>\s*<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>\s*<\/dict>/;
  if (!httpOrigin && ats.test(xml)) {
    xml = xml.replace(ats, '');
    changed = true;
  }
  const entries = [];
  if (xml.indexOf('NSCameraUsageDescription') === -1) {
    entries.push('  <key>NSCameraUsageDescription</key>\n' +
      '  <string>Mathify uses the camera for your private 1:1 lesson.</string>');
  }
  if (xml.indexOf('NSMicrophoneUsageDescription') === -1) {
    entries.push('  <key>NSMicrophoneUsageDescription</key>\n' +
      '  <string>Mathify uses the microphone so your trainer can hear you.</string>');
  }
  if (httpOrigin && xml.indexOf('NSAppTransportSecurity') === -1) {
    entries.push('  <key>NSAppTransportSecurity</key>\n' +
      '  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>');
  }
  if (entries.length) {
    /* Insert before the root dictionary, never inside the nested ATS dict. */
    xml = xml.replace(/\s*<\/dict>\s*<\/plist>/, '\n' + entries.join('\n') + '\n</dict>\n</plist>');
    changed = true;
  }
  if (changed) fs.writeFileSync(iosPlist, xml);
}

process.stdout.write('Native camera/microphone permissions verified.\n');
