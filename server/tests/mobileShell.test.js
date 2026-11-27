/* Mobile shell contract: Android and iOS are thin Capacitor wrappers around the
 * reviewed web app. They share every rule and never carry provider secrets. */

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
function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

function main() {
  const config = JSON.parse(read('mobile/capacitor.config.json'));
  check(config.appId === 'com.mathify.learningos' && config.appName === 'Mathify',
    'both mobile shells use the Mathify application identity');
  check(config.webDir === 'www' && config.server && /^https?:\/\//.test(config.server.url),
    'the shell loads a reviewed web origin rather than a copied server tree');
  check(/[?&]native=1$/.test(config.server.url),
    'the native shell is marked so camera/microphone are prepared only once');
  check(!config.server.url.includes('@') && !/secret|key|token/i.test(JSON.stringify(config)),
    'the native config carries no credential or secret');

  const configure = read('mobile/scripts/configure.js');
  check(/MATHIFY_WEB_URL/.test(configure) && /credentials/.test(configure),
    'the web origin is configurable and credentials are rejected');
  check(/capacitor\.config\.json/.test(configure) && /webDir/.test(configure),
    'the generator owns the checked-in Capacitor config');
  check(/native=1/.test(configure) && !/plugins\.Camera|Plugins\.Camera/.test(configure),
    'install-time media access uses the web grant, not a duplicated camera plugin');

  const prepare = read('mobile/scripts/prepare-native.js');
  check(/isSymbolicLink/.test(prepare) && /chmodSync/.test(prepare),
    'native sync clears read-only generated folders without following junctions');
  const mobilePackage = JSON.parse(read('mobile/package.json'));
  check(/prepare-native\.js/.test(mobilePackage.scripts.sync),
    'every mobile sync starts with Windows-safe native preparation');

  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
  [
    'android.permission.INTERNET',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO'
  ].forEach(function (permission) {
    check(manifest.includes(permission), 'Android declares ' + permission);
  });
  check(manifest.indexOf('android.permission.INTERNET') < manifest.indexOf('<application'),
    'Android permission declarations stay above the application node');
  check(!/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|READ_MEDIA_IMAGES|READ_MEDIA_VIDEO/.test(manifest),
    'Android requests no broad storage or photo-library permission');

  const plist = read('mobile/ios/App/App/Info.plist');
  check(plist.includes('NSCameraUsageDescription') &&
    plist.includes('NSMicrophoneUsageDescription'),
  'iOS declares camera and microphone usage reasons');
  check(!/NSPhotoLibraryUsageDescription|NSPhotoLibraryAddUsageDescription/.test(plist),
    'iOS requests no photo-library permission for chat attachments');
  const permissionsScript = read('mobile/scripts/native-permissions.js');
  check(/httpOrigin/.test(permissionsScript) &&
    /NSAppTransportSecurity/.test(permissionsScript) &&
    /if \(!httpOrigin/.test(permissionsScript),
  'the iOS HTTP development exception is removed for HTTPS production origins');

  check(exists('mobile/android/app/src/main/java') && exists('mobile/android/app/build.gradle'),
    'a real Android native project is present');
  check(exists('mobile/ios/App/App.xcodeproj/project.pbxproj') &&
    exists('mobile/ios/App/Podfile'),
  'a real iOS Xcode project is present');

  const rootPackage = JSON.parse(read('package.json'));
  check(rootPackage.scripts['mobile:sync'] && rootPackage.scripts['mobile:add:android'] &&
    rootPackage.scripts['mobile:add:ios'],
  'root scripts expose one mobile build path for both platforms');
  check(/node_modules\//.test(read('.gitignore')),
    'installed mobile dependencies are ignored by git');

  const iosWorkflow = read('.github/workflows/ios-build.yml');
  check(/runs-on: macos-26/.test(iosWorkflow) && /xcodebuild archive/.test(iosWorkflow),
    'iPhone/iPad builds run on a GitHub-hosted Mac with the current iOS SDK');
  check(/IOS_DIST_P12_BASE64/.test(iosWorkflow) &&
    /IOS_PROVISIONING_PROFILE_BASE64/.test(iosWorkflow) &&
    /exportArchive/.test(iosWorkflow),
  'the no-Windows-Mac path produces a signed IPA from repository secrets');
  check(/upload_to_testflight/.test(iosWorkflow) && /upload-artifact/.test(iosWorkflow),
    'the iOS workflow can deliver to TestFlight and expose the built IPA');

  const connect = read('classroom/connect.html');
  check(/id="startSessionBtn"/.test(connect),
    'the shell opens the same shared camera check as web');

  const webBootstrap = read('webapp/register.js');
  check(/isNativeShell\(\)/.test(webBootstrap) && /prepareCameraMic\(\)/.test(webBootstrap),
    'native install-time media preparation lives in the shared web bootstrap');
  check(/requestChatImageAccess\(\)/.test(webBootstrap) &&
    !/navigator\.storage|permissions\.query/.test(webBootstrap),
  'chat image access uses the scoped picker without a broad storage grant');
  check(/aiImage|Attach a maths photo/i.test(webBootstrap),
    'the scoped picker hook is limited to the chat photo controls');

  console.log('mobileShell: ' + assertions + ' assertions passed');
}

main();
