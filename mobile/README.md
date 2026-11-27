# Mathify mobile shells

Android and iOS are thin Capacitor wrappers around the reviewed Mathify web app.
All login, session, timing, pay, attendance, whiteboard, camera and subject logic
stays on the shared server and web surfaces. Nothing here duplicates business
rules or embeds credentials.

## Production origin

Set the deployed HTTPS origin before syncing:

```powershell
$env:MATHIFY_WEB_URL = "https://your-mathify-origin"
npm --prefix mobile run sync
```

## Android

```powershell
npm --prefix mobile install
$env:MATHIFY_WEB_URL = "https://your-mathify-origin"
npm --prefix mobile run add:android   # only once
npm --prefix mobile run sync
npm --prefix mobile run open:android  # opens Android Studio
```

Use `http://10.0.2.2:4000` instead while testing a local server from the Android
emulator. The generated config uses that value by default for Android.

## iOS

Xcode and the iOS SDK only run on macOS. A Windows PC cannot produce an
App-Store-valid IPA locally, and the old "iOS toolchain for Windows" projects do
not build a Capacitor Xcode workspace. The reliable no-Mac route is the checked-in
GitHub Actions workflow, which runs on a GitHub-hosted Mac with Xcode 26/iOS 26.

### Fastest install on iPhone/iPad (no Apple Developer account)

The app is also a PWA on the same HTTPS origin. On the device, open the site in
Safari, tap **Share**, then **Add to Home Screen**. It installs beside the native
apps and uses the same dashboard, classroom, camera and whiteboard code. Browsers
prompt for camera/microphone on first use rather than at install time.

### Signed IPA / TestFlight from Windows

1. Create these encrypted GitHub repository secrets:
   - `MATHIFY_WEB_URL` — deployed HTTPS origin, e.g. `https://mathify.example`
   - `IOS_DIST_P12_BASE64` — base64 of the Apple Distribution `.p12`
   - `IOS_DIST_P12_PASSWORD` — `.p12` password
   - `IOS_PROVISIONING_PROFILE_BASE64` — base64 of the App Store/mobileprovision
   - `IOS_TEAM_ID` — Apple Developer team ID
   - `IOS_PROVISIONING_PROFILE_NAME` — profile name (optional, defaults to `Mathify`)
   - `IOS_KEYCHAIN_PASSWORD` — temporary CI keychain password (optional)
   - `APP_STORE_CONNECT_API_KEY_BASE64`, `APP_STORE_CONNECT_KEY_ID`,
     `APP_STORE_CONNECT_ISSUER_ID` — only needed for the TestFlight upload step

   On Windows:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("dist.p12")) | Set-Clipboard
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("app.mobileprovision")) | Set-Clipboard
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_ABC1234567.p8")) | Set-Clipboard
   ```

2. Trigger the build from Windows:

   ```powershell
   gh workflow run "Build Mathify for iPhone and iPad" `
     -f web_origin="https://your-mathify-origin" `
     -f export_method="app-store-connect" `
     -f version="1.0" `
     -f upload_to_testflight=true
   gh run watch
   ```

3. Download the signed `.ipa` from the workflow artifact, or let the workflow
   upload it to TestFlight. TestFlight installs on both iPhone and iPad.

The iOS simulator default is `http://localhost:4000`. For a local Xcode build on
an actual Mac:

```bash
MATHIFY_WEB_URL=https://your-mathify-origin npm --prefix mobile run add:ios
MATHIFY_WEB_URL=https://your-mathify-origin npm --prefix mobile run sync
npm --prefix mobile run open:ios
```

## What is shared

- `/classroom/connect.html` camera check before the lesson
- `/classroom/index.html` live desk, board and all three subjects
- trainer/student/unified/parent/founder dashboards
- the installable PWA manifest/service worker served by the same Express origin
- server-owned presence, timer, pay, attendance and RBAC

No Razorpay, Twilio, provider secret, `.env` file or server source is copied into
the native bundle.

## Permission policy

- Camera and microphone are declared once in the native manifests and requested
  once during installation/first launch by the shared web bootstrap. The
  classroom reuses that grant and does not add a second permission declaration.
- There is **no** photo-library or broad storage permission. When a learner taps
  `Attach a maths photo` in Study Buddy, the OS-scoped file picker opens and the
  app receives only that chosen image.
- The same origin also installs as a PWA; browser camera/microphone prompts keep
  their normal first-use behaviour because browsers do not allow install-time
  device grants.
