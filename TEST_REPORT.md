# Mathify test report

**Date:** 26 November 2026
**Branch:** `feat/student-rtc-control-permission` (based on `main` at `b2bf372`)
**Scope:** Full Mathify stack — public site, shared assets, student desk with reward trophies, trainer console, 1:1 classroom with live Agora wiring, trainer-owned student media permissions, two-sided connection precondition, curriculum LMS, Express API, completed Supabase adapter and event outbox, ordered migration plan, Cloudflare-only AI, Razorpay/Agora/Twilio boundaries, DX/DevOps extras.
**Mode:** Local/mock by default. No live database migration and no live paid transaction were performed.

## Result

**PASS** — all 23 automated suites, syntax checks, migration dry run, HTTP/browser smoke checks, and in-app browser click-throughs completed successfully.

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Full automated suite | `npm test` from `server/` | Exit `0`. All 23 suites passed. |
| Live-readiness suite | `node tests/liveReadiness.test.js` | `62 assertions passed`. |
| Live persistence suite | `node tests/livePersistence.test.js` | `25 assertions passed`. |
| Live operations suite | `node tests/liveOperations.test.js` | `14 assertions passed`. |
| RTC controls suite | `node tests/rtcControls.test.js` | `42 assertions passed`. |
| API smoke | Included in `npm test` | `apiSmoke: passed`. |
| UI scaffold contract | Included in `npm test` | `scaffoldedUI: 12 assertions passed`. |
| Migration dry run | `npm run migrate --silent` | No database contacted. `0001_baseline.sql` 66763 bytes `sha256:82e6768ba8a2`; `0002_student_curriculum.sql` 4088 bytes `sha256:aff8a4359641`; `0003_live_persistence.sql` 2840 bytes `sha256:99e665c198c1`. Checksums reflect CRLF working-tree bytes; migration files are unchanged in git. |
| JS syntax | `node --check` on every changed JS file | All 16 changed/new JS files passed. |
| Whitespace | `git diff --check` | Clean (exit `0`). |
| HTTP surface smoke | Express origin on port 4173 | Reviewed pages/assets returned `200`; server source, `.env`, `.git`, and migration files remain `404`. |
| Browser smoke | In-app Chromium, 12 surfaces | `0` console errors and `0` failed requests on every surface. |
| Classroom live-call panel | `?sessionId=ses_math_001` | `Check speed` and Join controls present; Join disabled with “Check speed” label until both people pass; mic/camera on by default; server-signed token API exposed; no SDK/network call until Join. |
| Trainer media Access button | Trainer classroom view | `Access on` toggled to `Access off` and back; force flags and version advanced server-side; no console errors. |
| Student media lock | Student classroom view | After revoke: mic/camera on and disabled, Access button absent, version advanced; after grant: controls re-enabled; both events arrived via the safe channel with no quiz running; `0` console errors. |
| Student reward trophies | `student/index.html` | Trophy section, list and point total rendered from the dashboard (`25 pts`, 2 seeded trophies in mock mode); `0` console errors. |
| Student recording chapters | `student/index.html` | Three timestamped chapter buttons rendered (`0:00`, `7:00`, `15:30`); 8 session actions wired. |

## Automated suite breakdown

All suites are registered in `server/package.json`:

- `payoutService`: 31 assertions
- `attendancePolicy`: 10 assertions
- `leaveService`: 23 assertions
- `masteryGating`: 31 assertions
- `quizGenerator`: 21 assertions
- `quizPromptInjection`: 10 assertions
- `cloudflareClient`: 72 assertions
- `curriculumAuthoring`: 107 assertions
- `curriculumContext`: 116 assertions
- `aiCurriculumIntegration`: 36 assertions
- `studentSerializer`: 19 assertions
- `privacyBoundary`: 139 assertions
- `chatAssistant`: 26 assertions
- `curriculumPersistence`: 25 assertions
- `navContract`: 44 assertions
- `slotService`: 15 assertions
- `presenceService`: 17 assertions
- `apiSmoke`: passed
- `scaffoldedUI`: 12 assertions
- `liveReadiness`: 62 assertions
- `livePersistence`: 25 assertions
- `liveOperations`: 14 assertions
- `rtcControls`: 42 assertions

Expected non-fatal console output during tests:

- `[ai] Cloudflare credentials missing; using deterministic fallback.`
- `[cloudflare] Workers AI credentials missing; using deterministic fallback.`
- `[SECURITY] Trainer-only fields detected in student payload!`
- `[realtime:mock] ...` event log lines
- `{"level":"info","child":"reminders","event":"disabled"}` when reminders are off

These confirm mock-mode fallback, deliberate privacy rejection, and opt-in jobs — not failures.

## Live-readiness coverage

`server/tests/liveReadiness.test.js` verifies:

- Production config fails closed on weak `AUTH_SECRET`; production CORS never falls back to `*`.
- Passwords use per-user salts and verify correctly; legacy hashes are marked for upgrade.
- Demo account discovery returns `404` in production.
- Recording and WhatsApp webhooks fail closed when production secrets/signatures are missing.
- Agora channel, uid, and peer uid are derived server-side; browser-supplied channel/uid/role are ignored.
- Student-safe event payloads strip `answerKey`, `correctOptionId`, `hints`, `trainerNotes`, and similar keys.
- Session chat uses the JWT role, normalises text, and rejects cross-session access.
- Board sharing is trainer-only and carries no drawing/trainer content.
- Parent recap reports unconfigured channels as not sent, never as delivered.
- A verified Razorpay `payment.captured` event credits only the server-created order; malicious payment notes cannot change student, session count, or amount; replays are ignored; unsigned webhooks are rejected.
- Out-of-range and non-numeric score overrides are rejected.
- Booking form API accepts valid requests, rejects invalid email, and returns a reference.
- Static serving exposes only reviewed files; server source, `.env`, `.git`, and migration files return `404`.
- Migration SQL is wrapped in one transaction per file with checksum drift guards; baseline nested `do $$` blocks remain intact.

`server/tests/livePersistence.test.js` verifies:

- Mock mode remains the safe local default and live session creation fails closed outside Supabase mode.
- Published events land in the shared outbox in order, support exclusive `since` cursors, and are readable by the trainer log.
- The Supabase adapter refuses calls without credentials and implements every facade operation, so live mode cannot silently fall back to demo identities.
- `0003_live_persistence.sql` creates the service-only record store and session outbox, uses `app_metadata` rather than user-editable metadata, restricts client writes, and avoids runner dollar-quote collisions.
- Three reviewed migrations are discovered and each carries a transaction wrapper and checksum guard.

`server/tests/liveOperations.test.js` verifies:

- Cloudflare drafts are content-gated before trainer approval; personal contact details, social links, and trainer-only fields are rejected.
- Public write throttling returns `429` with `Retry-After` after the configured window.
- Structured logging and reminders stay quiet/no-op when their webhooks are not configured and never echo secrets.
- Recording chapter timestamps reach the student dashboard serializer.
- Mock seeding exits cleanly without contacting a database.

`server/tests/rtcControls.test.js` verifies:

- Students have media controls by default; no track is forced on without an explicit trainer revoke.
- A student cannot change the permission flag; trainer/founder revoke sets `forceMicOn` and `forceCameraOn` and advances the version; grant clears both.
- The student state and the `rtc.media.control.changed` event carry only allowlisted, scrubbed keys — no correctness, hint, trainer note or answer-key fields.
- The connection gate blocks token issuance before any check, after one failed side, and after only one passing side; the Agora channel/uid still come from the server once both pass.
- Connection events expose pass/fail and readiness only — no raw download/upload measurements.
- Public config advertises the 15/10 Mbps floor and the badge catalog.
- Students cannot award badges; unknown or invented badge ids are rejected; trainer picks a badge while policy owns label/points; the dashboard exposes only safe trophy fields and accumulated points.
- Browser contracts: force-on happens before lock, media is reaffirmed on quiz/focus/keep-alive, the safe event channel opens on session load, and the student dashboard renders trophies.

## Browser click-through results

- All 12 public and app surfaces: nav contract intact; 0 console errors and 0 failed requests.
- `contact.html`: booking form posts to `/api/contact`; visible status changed to **“Request received. We will contact you shortly.”** with no console errors.
- `lms/index.html`: course count `6`, `detailTitle` present; Review filter reduced list to `1`; Add module increased count `44 → 45` and showed a confirmation; sort changed label to **“Course name”**; no console errors.
- `classroom/index.html`: chat message submitted successfully through the session API and appeared in the shared log; with `sessionId=ses_math_001` the call bar shows `Check speed` and Join stays disabled with the “Check speed” label; mic/camera are on by default; no console errors.
- Trainer **Access** click-through: `Access on → Access off → Access on` matched the server permission version and force flags; the student tab received both changes through the safe event channel with no quiz running; no console errors.
- Student classroom view (`?view=student`): after revoke the mic/camera buttons were on and disabled and the Access button was absent; after grant both re-enabled; no console errors.
- `student/index.html`: reward trophies rendered from the dashboard with a point total; search highlighted `3` matches, notifications popover opened, `8` session actions wired, recording chapter buttons carry real timestamps, mobile tabs carry real targets; no console errors.
- `trainer/index.html`: search returned `1 matching student/session row`, `5` mobile tabs carry real targets, Start Class is wired; no console errors.

## Deliberate non-actions

- No Supabase migration was applied. Apply still requires human review plus both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply`.
- No live Cloudflare call was made because the current `.env` token must be rotated first.
- No real Razorpay capture, Agora recording webhook, or Twilio message was sent from tests. Test notification credentials were cleared before HTTP checks.
- The Agora Join control was not activated during browser smoke: it would load the remote SDK and request camera/microphone access. Its token contract and the connection gate are covered by server tests instead.
- The browser cannot remotely flip another user's physical camera/microphone. Revoked enforcement runs in the student tab through local Agora tracks plus server-owned state/events; a denied device, stopped track or offline tab is reported honestly rather than shown as on.

## Remaining launch gates

1. Rotate the exposed Cloudflare API token, Supabase secret key, and Agora Primary Certificate; replace values in gitignored `server/.env` without sharing them in chat.
2. After rotation, make one live Cloudflare Workers AI call and verify production env validation on the chosen host.
3. Obtain explicit approval before applying reviewed Supabase migrations.
4. Finish founder-editable policy/mastery/trainer-policy settings screens and planner designer v1 if they are required for the launch scope.
5. Provide OCR access or extracted text for PDF pages 5–17 before quoting them verbatim.
