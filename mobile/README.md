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

iOS builds must be archived on macOS/Xcode:

```bash
MATHIFY_WEB_URL=https://your-mathify-origin npm --prefix mobile run add:ios
MATHIFY_WEB_URL=https://your-mathify-origin npm --prefix mobile run sync
npm --prefix mobile run open:ios
```

The iOS simulator default is `http://localhost:4000`.

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
