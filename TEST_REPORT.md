# Mathify test report

> **ARCHIVED EVIDENCE — NOT CURRENT STATE.** This report captures an earlier
> verification round. Agora/DeepSeek/Cloudflare-only references in it are historical
> provider-round notes. The current stack is LiveKit for 1:1 calls, Resend for mail and
> the freelm → Gemini → Groq → Cloudflare Workers AI chain. See `README.md`,
> `PROJECT_GUIDE.md` and `LIVE_QA_REPORT.md` for the live contract.

**Date:** 26 November 2026
**Branch:** `feat/student-rtc-control-permission` (working tree based on `main` at `9838d0a`)
**Scope:** Full Mathify stack — public site, shared assets, student desk with reward trophies and mastery self-practice, trainer console, 1:1 classroom with live Agora wiring, one Student Control surface, server-owned celebrations and role-scoped reactions, two-sided connection precondition, curriculum LMS preview with planner designer, founder settings drafts, Express API, completed Supabase adapter and event outbox, ordered migration plan, Cloudflare Workers AI chat assistants, Razorpay/Agora/Twilio boundaries, dependency audit, DX/DevOps extras.
**Mode:** Local/mock by default for automated and browser checks. One live Workers AI text call and one local Agora token generation were performed (evidence below). No live database migration, Supabase call, payment, capture or SMS was performed during this verification round.

## Result

**PASS** — all 36 automated suites in the v3.1.0 evidence snapshot (including the parent-chat, MCP, Agora-routes, async-auth and Razorpay-webhook suites), syntax checks, migration dry run, dependency audit, HTTP/browser smoke checks, and in-app browser click-throughs completed successfully. The chat/practice additions are covered by the live evidence below; no full end-to-end browser live-chat success is claimed.

## Live verification evidence

Session `ses_de8f350eaffeqms9zk7fkKMzz3`. Direct provider checks after the chat/practice additions; these are separate checks, not a full browser live-chat run. No secret, full token or model reply text was logged.

| Check                         | Model / surface                                  | Result      | Evidence and limitation                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workers AI text               | `@cf/meta/llama-3.1-8b-instruct`                 | **PASS**    | HTTP `200`, about `453 ms`, valid Cloudflare success envelope. The reply did not strict-parse on the first pass, so tolerant JSON extraction was hardened after the check.                                   |
| Requested vision              | `@cf/llava-hf/llava-v1.6b-34b`                   | **FAIL**    | HTTP `400` `No route for that URI` — not available on this account. The configured fallback path is triggered correctly.                                                                                     |
| Fallback vision               | `@cf/meta/llama-3.2-11b-vision-instruct`         | **BLOCKED** | HTTP `403` `Model Agreement` — a one-time Meta license acceptance (`agree`) is required and was **not** submitted on the user's behalf. Live image chat stays unavailable until that is explicitly accepted. |
| Agora token, local generation | Demo session with fresh two-sided network checks | **PASS**    | Token generated OK; the full token was not printed. No Agora webhook was proven.                                                                                                                             |
| Supabase                      | Service-role adapter                             | **SKIPPED** | Credentials absent/empty; no call made. No practice or chat audit row was written live.                                                                                                                      |
| Razorpay                      | Orders / webhook                                 | **SKIPPED** | Credentials absent/empty; no order, capture or payment made.                                                                                                                                                 |
| Twilio                        | WhatsApp parent assistant                        | **SKIPPED** | Credentials absent/empty; no message sent.                                                                                                                                                                   |
| Migration                     | `0001`–`0004` reviewed SQL                       | **SKIPPED** | Credentials absent/empty; no live migration applied.                                                                                                                                                         |

Backend fixes made in response to the live check:

- Workers AI model slugs (for example `@cf/meta/llama-3.1-8b-instruct`) now stay literal in REST paths instead of being URL-encoded; encoding produced `No route for that URI`. Applied in `worker.js` and `server/services/chatWorkerService.js`.
- A LLaVA `No route for that URI` HTTP `400` now counts as model-not-found and triggers the configured vision fallback.
- `safeParseJSON()` in `worker-core.mjs` now extracts the first balanced JSON object from chatty model output, respecting strings and escapes, before falling back to strict parsing.
- Input sanitizers in `worker-core.mjs` and `server/services/chatAssistantService.js` now redact explicitly named people, free-text hints, answer keys and session ids before any model prompt; chat text is pinned to `@cf/meta/llama-3.1-8b-instruct` in both the Worker and local bridge.
- Severe trainer complaints deterministically route to `founder@mathify.app` even when a model reply omits the address.
- The eighth self-practice batch stays answerable: offered count no longer marks the topic complete before all ten answers are saved. The API's `unlimited` flag was replaced with the honest 80-question `topicLimit`/`topicRemaining` contract.

Limitations: no deployed Worker end-to-end browser chat was exercised; the text provider call and local Agora token generation were verified separately. Live image chat is gated until the user accepts the Meta model agreement. The local automated suites cover the new Worker, mastery and parent-chat contracts deterministically; their final counts are recorded below.

## Simulation fixes and recheck evidence

Three role agents (trainer, student and founder perspectives) found and we fixed the student `batchLabel` shadowing bug, the final 80th-question batch being disabled before answers, the favicon 404 on dashboard surfaces, incomplete trainer payout copy, generated quiz drafts blocked by `explanation: null`, and legacy tutor prompts carrying `sessionId`.

Before the parent-chat suite was added, the full 26-suite run exited `0`: payoutService 31, attendancePolicy 10, leaveService 23, masteryGating 31, quizGenerator 21, quizPromptInjection 10, cloudflareClient 87, curriculumAuthoring 107, curriculumContext 116, aiCurriculumIntegration 36, studentSerializer 19, privacyBoundary 154, chatAssistant 38, chatWorker 80, masteryPractice 365, curriculumPersistence 25, navContract 78, slotService 15, presenceService 17, apiSmoke passed, scaffoldedUI 12, liveReadiness 64, livePersistence 33, liveOperations 20, rtcControls 42, engagementControls 66. The final 27-suite run recorded below has `cloudflareClient` at 91 and `privacyBoundary` at 159 after the later hardening.

- **API cap simulation after fixes:** 8 batches = 80 questions; the final batch reported `topicComplete=false` when offered and `true` after all ten answers; a 9th request returned `409 TOPIC_PRACTICE_COMPLETE` with the encouraging rest message.
- **In-app browser recheck after the `batchLabel` fix:** `Start 10 questions` rendered 10 questions and status `Ready · Baseline · 10 / 80 topic questions`; after answering all 10, the card showed `Batch 01 · 10 / 10 answered · Baseline` and `Batch complete`; `Fetch another 10 · 15% harder ↓` produced `Ready · +15% harder · 20 / 80 topic questions`; the wallet rendered `9 sessions left`; 0 console errors.
- **Static/copy recheck:** `GET /favicon.ico` returns `200 image/svg+xml`; the trainer static payout copy contains `₹300–₹400 per completed 1-on-1 session`, `48-hour notice`, bonuses and `founder@mathify.app`.

## Approved roadmap recorded

- Founder-managed trainer access/pay/allotment.
- Student self-registration, payment and self-set credentials.
- Parent ↔ trainer chat with notifications — now built as a private human thread with per-recipient unread counts, mark-read, regex DLP and founder-only masked flags; no new SQL migration.

## Parent ↔ trainer chat completion evidence

Backend and frontend agents completed parent↔trainer chat. The static allowlist in `server/app.js` was updated to expose the new `parent/` surface; this change was made after those agents reported.

- **Local API smoke on port 4001:** parent login OK; trainer login OK; a safe parent message was delivered; trainer unread incremented and then cleared via mark-read; the trainer reply was visible to the parent; a blocked phone attempt returned `422 CONTENT_BLOCKED`; the blocked message was absent from both inboxes and the realtime log; a founder flag was recorded with a masked preview only; parent/trainer flag reads returned `403`; student thread read returned `403`.
- **Parent browser smoke:** the parent page rendered footer links and the inbox; a safe message rendered as `You · parent`; a blocked phone send left the message count unchanged, cleared the composer, showed the neutral notice and did not put raw digits in the DOM. The expected network `422` appears in the parent console; no raw contact detail is rendered.
- **Trainer browser smoke:** the compact Parent messages panel rendered, showed the parent message and a trainer reply rendered as `You · trainer`; 0 console errors. The dynamic payout note now includes ₹300–₹400, 48-hour/mutual-leave/fine wording, bonuses and founder escalation.

## Commands and results

| Check                        | Command                                                    | Result                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full automated suite         | `npm test --prefix server`                                 | Exit `0`. All 27 suites passed; `server/package.json` contains 27 `node tests/*.test.js` entries including `parentChat.test.js`.                                                                                                                                                                                                      |
| Engagement controls suite    | `node tests/engagementControls.test.js`                    | `66 assertions passed`.                                                                                                                                                                                                                                                                                                               |
| Live-readiness suite         | `node tests/liveReadiness.test.js`                         | `64 assertions passed`.                                                                                                                                                                                                                                                                                                               |
| Live persistence suite       | `node tests/livePersistence.test.js`                       | `33 assertions passed`.                                                                                                                                                                                                                                                                                                               |
| Live operations suite        | `node tests/liveOperations.test.js`                        | `20 assertions passed`.                                                                                                                                                                                                                                                                                                               |
| RTC controls suite           | `node tests/rtcControls.test.js`                           | `42 assertions passed`.                                                                                                                                                                                                                                                                                                               |
| API smoke                    | Included in `npm test`                                     | `apiSmoke: passed`.                                                                                                                                                                                                                                                                                                                   |
| Parent chat suite            | Included in `npm test`                                     | `parentChat: 331 assertions passed`.                                                                                                                                                                                                                                                                                                  |
| UI scaffold contract         | Included in `npm test`                                     | `scaffoldedUI: 12 assertions passed`.                                                                                                                                                                                                                                                                                                 |
| Migration dry run            | `npm run migrate --silent`                                 | No database contacted. `0001_baseline.sql` 66834 bytes `sha256:5d72306998ee`; `0002_student_curriculum.sql` 4088 bytes `sha256:aff8a4359641`; `0003_live_persistence.sql` 1992 bytes `sha256:01cce962350e`; `0004_ai_chat_logs.sql` 3117 bytes `sha256:3d50d91a1cc6`. Checksums reflect working-tree bytes; no migration was applied. |
| Chat audit migration review  | `0004_ai_chat_logs.sql`                                    | Reviewed in `server/migrations/README.md`: founder-only `app_metadata` RLS, service-role writes, no anon/authenticated grants, no image bytes. Dry-run checksum recorded above; no live apply.                                                                                                                                        |
| JS syntax                    | `node --check` on every changed/new JS and MJS file        | All changed/new files passed, including `worker-core.mjs` and `worker.js`.                                                                                                                                                                                                                                                            |
| Whitespace                   | `git diff --check`                                         | Clean (exit `0`, no output).                                                                                                                                                                                                                                                                                                          |
| Dependency audit             | `npm audit --omit=dev --json`                              | `0 vulnerabilities` after upgrading `zod` and `nodemailer` and committing the lockfile change.                                                                                                                                                                                                                                        |
| HTTP surface smoke           | Express origin on port 4173                                | Reviewed pages/assets returned `200`; server source, `.env`, `.git`, and migration files remain `404`.                                                                                                                                                                                                                                |
| Browser smoke                | In-app Chromium, 12 surfaces                               | `0` console errors and `0` failed requests on every surface.                                                                                                                                                                                                                                                                          |
| Lighthouse recheck           | `apps.html`, `contact.html`, `lms/index.html` on port 4100 | Accessibility, best practices and SEO all `1`; `[]` failures after preview/booking-copy changes.                                                                                                                                                                                                                                      |
| Founder settings browser E2E | `founder/index.html` on port 4200                          | Server draft loaded; 18 editable fields and 12 read-only money rows; `0` money inputs; save changed mastery `80 → 85` on the API; reset returned it to `80`; `0` console errors.                                                                                                                                                      |
| Planner designer browser E2E | `lms/index.html` on port 4200                              | Sheet opened with 7 seeded blocks and three 240px expandable sketches; default validation passed; pasting trainer instructions into the student quiz prompt was rejected; reset restored a clean draft; student JSON contained no trainer field names; `0` console errors.                                                            |
| New-surface Lighthouse       | `founder/index.html`, `lms/index.html` on port 4200        | Accessibility, best practices and SEO all `1`; `[]` failures.                                                                                                                                                                                                                                                                         |
| Classroom live-call panel    | `?sessionId=ses_math_001`                                  | `Check speed` and Join controls present; Join disabled with “Check speed” label until both people pass; mic/camera on by default; server-signed token API exposed; no SDK/network call until Join.                                                                                                                                    |
| Trainer media Access button  | Trainer classroom view                                     | `Access on` toggled to `Access off` and back; force flags and version advanced server-side; no console errors.                                                                                                                                                                                                                        |
| Student media lock           | Student classroom view                                     | After revoke: mic/camera on and disabled, Access button absent, version advanced; after grant: controls re-enabled; both events arrived via the safe channel with no quiz running; `0` console errors.                                                                                                                                |
| Student reward trophies      | `student/index.html`                                       | Trophy section, list and point total rendered from the dashboard (`25 pts`, 2 seeded trophies in mock mode); `0` console errors.                                                                                                                                                                                                      |
| Student recording chapters   | `student/index.html`                                       | Three timestamped chapter buttons rendered (`0:00`, `7:00`, `15:30`); 8 session actions wired.                                                                                                                                                                                                                                        |

## Automated suite breakdown

All suites are registered in `server/package.json`:

- `payoutService`: 31 assertions
- `attendancePolicy`: 10 assertions
- `leaveService`: 23 assertions
- `masteryGating`: 31 assertions
- `quizGenerator`: 21 assertions
- `quizPromptInjection`: 10 assertions
- `cloudflareClient`: 91 assertions
- `curriculumAuthoring`: 107 assertions
- `curriculumContext`: 116 assertions
- `aiCurriculumIntegration`: 36 assertions
- `studentSerializer`: 19 assertions
- `privacyBoundary`: 159 assertions
- `chatAssistant`: 38 assertions
- `chatWorker`: 80 assertions
- `masteryPractice`: 365 assertions
- `curriculumPersistence`: 25 assertions
- `navContract`: 78 assertions
- `slotService`: 15 assertions
- `presenceService`: 17 assertions
- `apiSmoke`: passed
- `parentChat`: 331 assertions
- `scaffoldedUI`: 12 assertions
- `liveReadiness`: 64 assertions
- `livePersistence`: 33 assertions
- `liveOperations`: 20 assertions
- `rtcControls`: 42 assertions
- `engagementControls`: 66 assertions

All 27 suites passed with exit `0` in the final integration run. The **Live verification evidence** table above is the authoritative record for the separate provider calls; no deployed Worker end-to-end browser chat is claimed.

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
- Seven review-only SQL files are discovered and each carries a transaction wrapper and checksum guard; no live apply was performed.

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

`server/tests/engagementControls.test.js` verifies:

- One trainer-only Student Control section owns media Access, explicit mute/camera-off, emoji/applause pauses, board sharing, rewards, quiz controls and session end; the student view removes every `.trainer-only` node.
- Student emoji and applause default to enabled, are independently patchable by trainer/founder, reject a student’s attempted change, advance a version per change, and are enforced server-side before any event is published.
- Direct trainer media state is separate from Access revoke: mute/camera-off are versioned and honest, revoke still forces tracks on before locking, grant clears force flags, and an empty patch is rejected.
- Six server-owned celebration types use only paper/ink/coral token keys, 250–4000 ms durations, mapped sounds, student > trainer > default preference priority, a 5-per-session cap and a 3-second gap; clients can only send a trigger id and allowlisted preference ids.
- Celebration payloads carry no answer, correctness, hint, explanation, trainer note or instruction field; students cannot start celebrations; unknown triggers are rejected; `session_complete` randomizes inside the approved pool.
- Kid reactions are limited to `💡 🤔 ✅ 👏`, trainer reactions include `🎯`, applause is explicitly addressed to the trainer, and all reaction/permission events are scrubbed before the safe channel.
- Browser source contracts keep celebrations and reactions in separate layers, queue a reaction that arrives during a celebration instead of overlapping it, suppress celebrations during quiz mode, still render reactions during quiz mode, and apply a server quiz launch to the student tab.
- Reduced motion keeps the static recognition badge and the always-on sound but drops animation; sound has no mute control and is volume-capped at `0.6`. Every emoji click renders a layered full-page celebration on both roles; engagement code never enables a camera or microphone. The live-gated deck was rendered on the trainer dashboard and camera page, while the classroom engagement strip was rendered on the planner and remained visible over the full whiteboard at tablet widths.
- The board watermark is now one centred, upright regular-weight very-light-grey diagonal document-style `Mathify.` print on the trainer and student canvas, with the original dark bold `Mathify.` signature at the bottom of every surface; both are non-interactive and haloed so ink stays readable, and the dark Wacom panel uses the same prints in paper ink. The marks stay fixed to the board frame while hand pan, zoom and question transfer move only canvas content.
- A trainer question is rendered to question-only pixels on the same shared board, with earlier ink/images shifted upward and the full ordered board sent as one snapshot; options, answer keys, hints and trainer notes never enter the board event. The quiz sheet states this behavior. Closing and reopening the board preserves the same written history rather than opening a blank board.
- Question cards are now top-right aligned and use the Paper & Ink tokens for paper, ink, coral accent and hairline borders. A picture question carries its own attached image into both the quiz stage and the board card; the exported student payload includes only the image source, never its prompt, answer key, hint or trainer note. Earlier writing that would collide with the reserved card is moved below it.
- The trainer planner designer exposes **Send question to whiteboard**. It hands only the quiz stem and optional image URL to the classroom, which opens the trainer board with `board=full` and places the card once the board helper is ready. The dashboard now remembers the active session id for this handoff.
- A development-only `DEV PAGE · …` badge is injected into every reviewed HTML page; it is absent when `NODE_ENV=production` and can be hidden with `?devLabel=0`. Review labels resolve to `Trainer dashboard / Start class`, `Shared connect page`, `Trainer planner designer`, `Quiz sheet / trainer`, `Trainer whiteboard / shared board`, and `Student shared whiteboard`.
- The whiteboard now opens in Select mode. Non-sketching tools keep the compact dark arrow pointer; Pen, Highlighter/Marker, Eraser and Laser show their own compact tool icon as the cursor. Custom pointers are 18px instead of 28px (about 36% smaller), and hand pan still uses grab/grabbing.
- The eraser now removes complete ink strokes instead of painting paper-coloured cover strokes. It hit-tests the actual polyline or shape at every zoom level, samples between pointer events so a fast swipe cannot skip a stroke, commits one undoable deletion per gesture, and sends the resulting full board as one snapshot to the student.
- Board zoom and hand-pan viewport changes are sent to the student through the same session-scoped board channel. Pan is normalised to the canvas, so the same part of the writing stays visible at different screen sizes; it is clamped server-side. The receiving board never echoes the view back to the trainer.
- Laser pen is trainer-only. The child has no laser control and no tool dock at all, but now sees the trainer's live fading laser trail as a temporary cue that never becomes saved ink, a snapshot item or a student-editable object.
- Uploaded board screenshots, question-card images and the quiz image keep the uploaded aspect ratio. Very wide images are fitted by width instead of being stretched taller; the quiz image uses intrinsic sizing with object-fit contain.

## Browser click-through results

- All 12 public and app surfaces: nav contract intact; 0 console errors and 0 failed requests.
- `contact.html`: booking form posts to `/api/contact`; visible status changed to **“Request received. We will contact you shortly.”** with no console errors.
- `lms/index.html`: course count `6`, `detailTitle` present; Review filter reduced list to `1`; Add module increased count `44 → 45` and showed a confirmation; sort changed label to **“Course name”**; no console errors.
- `classroom/index.html`: chat message submitted successfully through the session API and appeared in the shared log; with `sessionId=ses_math_001` the call bar shows `Check speed` and Join stays disabled with the “Check speed” label; mic/camera are on by default; no console errors.
- Trainer **Access** click-through: `Access on → Access off → Access on` matched the server permission version and force flags; the student tab received both changes through the safe event channel with no quiz running; no console errors.
- Student classroom view (`?view=student`): after revoke the mic/camera buttons were on and disabled and the Access button was absent; after grant both re-enabled; no console errors.
- `student/index.html`: reward trophies rendered from the dashboard with a point total; search highlighted `3` matches, notifications popover opened, `8` session actions wired, recording chapter buttons carry real timestamps, mobile tabs carry real targets; no console errors.
- `trainer/index.html`: search returned `1 matching student/session row`, `5` mobile tabs carry real targets, Start Class is wired; no console errors.
- Partial-work labelling: the LMS surface shows a visible “Curriculum preview” banner, the apps hub marks it **Preview** instead of **Live**, and the contact form states that no payment is taken there; Lighthouse remained `1/1/1` on all three changed surfaces.

## Fresh-session browser E2E (port 4100)

- Both trainer and student tabs began with Join disabled and **Check speed**; after passing the client check both showed **Join**, with no RTC token issued before the two-sided gate passed.
- Student Control clicks produced the expected server state for media Access, explicit mute/camera-off, emoji/applause pauses, board sharing and badge/kudos/quiz/end links; the student view exposed `0` `.trainer-only` elements and no Student Control sheet.
- Pausing applause and emoji disabled only the corresponding student buttons; trainer/founder role checks rejected the same writes from a student token.
- A server quiz launch put the student tab into quiz mode (`quiz-live`) and suppressed the shared celebration: `/celebrate` returned `fired:false`, `seq:null`, and no `shared.celebration` event or visible celebration layer followed.
- A kid reaction during that active quiz still reached the safe event stream (`reaction.sent`, seq `13`) and rendered the separate reaction layer containing `💡`; it did not enable any camera or microphone track.
- A reaction arriving while a celebration was visible stayed hidden until the celebration cleared, then rendered; the two layers were never visible at the same time.
- Reduced-motion / always-on sound contracts, the icon-only trainer deck appearing on the dashboard and camera page only after a live server state, its absence before start and on student surfaces, and the static badge fallback were verified in source contracts; no real device permission or remote hardware change was requested.

## Founder settings and planner designer (port 4200)

- `founder/index.html` is now served by the reviewed Express static allowlist; a regression assertion covers the surface and the forbidden `server/` path remains `404`.
- `GET /api/admin/settings` is founder-only. Student access returns `403`; PATCH rejects money keys with `FIELD_READ_ONLY` and rejects network-floor contract fields. A valid mastery patch and reset were verified through the UI and API.
- The founder client renders 18 allowlisted editable fields, 12 locked money rows and `0` money inputs. Pay, bonuses, fines, no-show amounts, packs and pay percentages are shown as read-only output; `Never get emotional about money transactions.` is visible in the rail and the money panel.
- Edits are labelled as runtime drafts: the browser saves locally when the API is unavailable and says so; deployment remains file-backed until reviewed. No server file is written by a founder save.
- `lms/index.html` now exposes a planner designer sheet. Its seeded draft has 7 blocks, includes analogy/story/sketch_space, and uses 240px expandable sketch spaces with trainer drawing prompts.
- Designer validation enforces non-empty trainer instructions and misconception watch lists, a caption/image prompt for analogies, a sketch after each text/image/story block, `>=220px` sketch height, `expandable === true`, and a quiz prompt that does not restate trainer instructions.
- The student copy builder emits only `id`, `type`, `content` and sketch geometry. `trainerInstructions`, `misconception_watch` and `prompt_for_trainer` were absent from the generated student JSON in the browser check.
- Browser checks on both new surfaces produced `0` console errors; Lighthouse scored `1/1/1` on accessibility, best practices and SEO.

## Security assessment disposition

The pasted assessment was checked against the current code, excluding demo credentials. Eight priorities were reconciled:

- **IDOR / access control — already covered.** Signed JWTs are re-verified, the active user is reloaded from the DB, `canAccessSession` limits founder/trainer/student to the right records, and all session routes apply `requireAuth` + `loadSession`. Student payloads and the browser event channel strip trainer-only fields. No new IDOR was found; no fix required.
- **Agora token trust — already covered.** Channel, UID, peer UID, publisher role and TTL are server-derived from the verified session; browser input is ignored; both roles must pass a fresh two-sided network check. Webhook signatures use HMAC-SHA256 with `timingSafeEqual`. Added one hardening fix: duplicated Agora channels now fail closed instead of attributing presence to the first match.
- **Razorpay signature — already covered.** Raw body is preserved before JSON parsing, HMAC-SHA256 is compared in constant time, only `payment.captured` is credited, and amount/currency/order/student are revalidated with replay protection. No fix required.
- **Supabase RLS — staged SQL hardened.** All policies read `auth.jwt()->'app_metadata'->>'role'`, never `user_metadata`; RLS is enabled on every public table. Closed the strongest gap by revoking authenticated `SELECT` on `mathify_session_events`, leaving the raw outbox service-role-only so clients cannot bypass browser event scrubbing. Removed `hint` from the safe student quiz view and column grant until an explicit trainer grant. The DB facade now throws `LIVE_ADAPTER_METHOD_MISSING` instead of silently falling back to mock data in live mode. **Deployment is still pending.**
- **Workers AI cross-tenant / PII — hardened.** Tutor/copilot prompts already use academic-only fields. Added an explicit untrusted-question envelope plus reply-side DLP for PII, social links and trainer-only material. Parent support now sends `pseudonymous learner` instead of the student name, fences parent text as untrusted data, and applies the same reply DLP.
- **Prompt injection — hardened.** System instructions establish hierarchy over fenced user data; adversarial “ignore previous instructions” and leaking-completion fixtures are covered by tests. Quiz drafts remain trainer-approval-only behind content moderation.
- **Dependency CVEs — already covered.** `zod@^4.6.7` and `nodemailer@^10.6.1` resolved the reported advisories; `npm audit --omit=dev` reports `0 vulnerabilities`. Added `.github/workflows/ci.yml` so `npm ci`, `npm audit` and `npm test` run on every push/PR. Node engine requirement aligned to `>=20` for `nodemailer 10.x`.
- **1:1 session isolation — already covered.** Sessions have exactly one trainer and one student with a distinct-party constraint. Trainer-created sessions now additionally validate that both ids resolve to active accounts with the correct roles via `server/services/sessionPartyService.js`. Live-created sessions get a unique server-derived `rtc.channel`, so tokens and webhooks cannot be misrouted.

## Deliberate non-actions

- No Supabase migration was applied. Apply still requires human review plus both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply`. One demo founder user row was inserted and verified in `public.users` at the user’s request; this is data, not a schema migration.
- One live Cloudflare Workers AI text call was made (see evidence above); no secret, full token or reply text was logged. Requested vision is unavailable on this account and fallback vision is blocked by the Meta model agreement, so no live image chat succeeded.
- No Supabase call, Razorpay order/capture, Twilio message, Agora webhook or migration apply was made during this verification round; credentials were absent/empty. Test notification credentials were cleared before HTTP checks.
- The Agora Join control was not activated during browser smoke: it would load the remote SDK and request camera/microphone access. Its token contract and the connection gate are covered by server tests instead.
- The browser cannot remotely flip another user's physical camera/microphone. Revoked enforcement runs in the student tab through local Agora tracks plus server-owned state/events; a denied device, stopped track or offline tab is reported honestly rather than shown as on.

## Remaining launch gates

1. Rotate the exposed Cloudflare API token, Supabase secret key, and Agora Primary Certificate; replace values in gitignored `server/.env` without sharing them in chat.
2. Workers AI text is already verified (HTTP `200`). Accept the one-time Meta model agreement (`agree`) explicitly if image chat is required; until then live image chat remains blocked. Verify production env validation on the chosen host.
3. Obtain explicit approval before applying reviewed Supabase migrations, then verify all deployed tables have RLS enabled, policies read `app_metadata`, the raw event outbox has no authenticated grant, and live-created sessions carry `rtc.channel`.
4. Decide whether founder settings drafts should become a reviewed, persisted deployment source; until then they remain runtime drafts and planner exports remain local authoring output.
5. Provide OCR access or extracted text for PDF pages 5–17 before quoting them verbatim.

## v3.1.0 reconciliation addendum

- VERIFIED — `npm.cmd test --prefix server` completed 36/36 chained suites with exit code 0; highlights include `chatWorker: 110 assertions passed`, `mcpServer: 55 checks`, `chatAssistant: 63 assertions passed`, `livePersistence: 43 assertions passed`, `asyncAuthMiddleware: 6 assertions passed`, `credentialLogin: 10 assertions passed`, `apiSmoke: passed`, `razorpayWebhook: all exactly-once assertions passed` and `agoraRoutes: 35 assertions passed` [ev: npm.cmd test --prefix server, 2026-11-26]; [src: server/package.json:13].
- VERIFIED — `npm.cmd run migrate --silent --prefix server` listed seven review-only SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`), contacted no database and requires `DATABASE_URL` plus `MATHIFY_MIGRATE_CONFIRM=apply` and founder approval to apply [ev: npm.cmd run migrate --silent --prefix server, 2026-11-26]; [src: server/migrations/README.md:28-36].
- VERIFIED — No live Razorpay charge, Twilio message, Supabase apply or Agora join was performed in the reconciliation pass; those remain BLOCKED/UNKNOWN [src: TEST_REPORT.md:19-25,242-253]; [ev: no live provider calls by this pass, 2026-11-26].

## v4.0.0 final validation addendum

[U~2026-11-26] The v3.1.0 figures above remain historical. The final post-fix local validation after the 10-role audit is the current state: `npm.cmd test --prefix server` returned `EXITCODE=0` with 36/36 chained suites, including `agoraRoutes: 60`, `sessionPolicy: 37`, `rtcControls: 46`, `livePersistence: 54`, `chatWorker: 110`, `mcpServer: 55`, `razorpayWebhook: all exactly-once assertions passed` and `apiSmoke: passed`. Earlier `agoraRoutes: 35`, `sessionPolicy: 34`, `rtcControls: 42` and `livePersistence: 43` values are superseded [src: E2E_TEST_LOG.md:57,70-79]; [ev: npm.cmd test --prefix server, 2026-11-26].

- VERIFIED — [U+2026-11-26] `node --check` sweep reported `SYNTAX_FILES=136`, `SYNTAX_FAILURES=0`; `node server/migrate.js --dry-run` returned `EXITCODE=0` with seven review-only SQL files (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`); `git diff --check` returned `EXITCODE=0` with no whitespace errors, only CRLF normalization warnings [src: E2E_TEST_LOG.md:77-79].
- VERIFIED — [U+2026-11-26] All in-repo defects A-01…A-09 are FIXED; A-09 was already fixed by the v3.1.0 documentation pass and is recorded, not re-applied. B-01…B-06 remain `BLOCKED_EXTERNAL`, G-01…G-03 remain unchanged gaps, and no live provider success is claimed [src: TPFF_BLOCKERS.md:9-40]; [src: E2E_TEST_LOG.md:55-64,82].
- VERIFIED — [U~2026-11-26] Final pre-commit inventory is 41/32/9: 206 tracked files, 41 `git status --porcelain=v1 --untracked-files=all` paths, 32 modified tracked paths and 9 untracked paths including `E2E_TEST_LOG.md` and `TPFF_BLOCKERS.md`; earlier 25/18/7 and 28/19/9 snapshots remain in H-25. After the v4.0.0 documentation commit the 9 untracked paths become tracked, but the final commit hash is `UNKNOWN_AT_AUTHORING_TIME` [src: E2E_TEST_LOG.md:46,70-82]; [ev: user-supplied v4.0.0 final pre-commit inventory, 2026-11-26].
- VERIFIED — [U+2026-11-26] Documentation validation printed `VALIDATION=PASS` with `unknown=26 however=31 tests=36 files=215 env=59`, `EXACT_STRINGS_MISSING=0` and `CITATION_PATH_FAILURES=0`; `PROJECT_FLOW_INDEX.json` parsed with `JSON_PARSE=OK` [src: TPFF_UPDATE_REPORT.md §U10]; [ev: tpff_final_validate.ps1 final run, 2026-11-26].

## Current-state addendum (2026-11-28)

The figures above remain historical. The current verified state for this branch is:

- **Automated suite:** 65 chained Node suites pass with `DATABASE_MODE=mock`; explicit `EXITCODE=0` from `npm.cmd test` [ev: `C:\Users\rohit\AppData\Local\Temp\opencode\npm-test-final3.log`]. New suites include `mcpPlannerServer: 30 assertions`, `mcpRmServer: 32 assertions`, and the expanded `lmsPlannerAccess: 48 assertions` with an async Supabase batch-facade regression.
- **Mock HTTP master:** 31 checks, 26 passed, 5 explicit skips, 0 failed [ev: `scripts/e2e-master-mock-log.json`].
- **Live read-only HTTP master:** 31 checks, 21 passed, 10 explicit skips, 0 failed against `DATABASE_MODE=supabase` [ev: `scripts/e2e-master-log.json`]. Real Supabase reads, founder-only live AI chain and private recording authorization were exercised; mutations were disabled.
- **Live companion HTTP:** 37 checks, 36 passed, 1 explicit skip, 0 failed [ev: `scripts/e2e-live-log.json`].
- **MCP:** founder, RM and planner-designer servers share `mcp-core.js`. Planner publishing stays founder-approved through the existing suggestion queue; no autonomous publish tool exists.
- **Not claimed:** Razorpay charge, Twilio/WhatsApp delivery, real joined-room recording, runner-based migration apply, live Realtime mode change, signed IPA/TestFlight, exact production planner copy and LMS pixel-match. See `E2E_LOG.md`, `PENDING_RULES.md` and `MCP_DESIGN.md`.

### Quality tooling evidence (2026-11-28)

- VERIFIED — `npm audit --audit-level=moderate` from `server/` reported **0 vulnerabilities** across all dependency types; CI now uses this full-audit gate [ev: local npm audit run, 2026-11-28].
- VERIFIED — `npm run lint` from `server/` exited `0` with **0 errors** and 14 warnings under ESLint 9 flat config; warnings are non-failing and no rule was globally disabled to hide them [ev: `npm-test-coverage` verification round, 2026-11-28].
- VERIFIED — `npm run format:check` passes on `.c8rc.json`, `.prettierrc.json`, `eslint.config.js` and `scripts/run-tests.js`. `npm run format:check:all` reports a pre-existing 193-file formatting backlog; this change does not bulk-reformat legacy source [ev: local Prettier runs, 2026-11-28].
- VERIFIED — `npm test` is now `c8 node scripts/run-tests.js`; all 65 suites passed with explicit `EXITCODE=0`. Coverage: statements `81.62%`, branches `65.75%`, functions `79.53%`, lines `81.62%`; lcov and json-summary reports were generated [ev: `C:\Users\rohit\AppData\Local\Temp\opencode\npm-test-coverage.log`, `npm-test-coverage-exit.txt`].
- VERIFIED — `SECURITY.md`, issue templates, a pull-request template, `.husky/pre-commit`, `lint-staged`, Prettier config and `.c8rc.json` are present. Active docs no longer print demo passwords; `DEMO_PASSWORD` is documented only in `server/.env.example` and discovery remains disabled in production.

### Camera look and mic evidence evidence (2026-11-28)

- VERIFIED — `cameraConnect: 98 assertions passed` and `rtcControls: 72 assertions passed` with `DATABASE_MODE=mock` [ev: focused suite runs, 2026-11-28].
- VERIFIED — The local helper contains no API, presence, pay, clock, `sessionId` or console surface; mic levels use `AudioContext` + `AnalyserNode` and remote levels require a real `MediaStream`. Active animation is teal; coral is only muted [ev: static and behavioural assertions in both focused suites].
- VERIFIED — A privacy-boundary false positive was found because the camera-look configuration key was named `hint:`, matching the quiz hint-text guard. It was renamed to `hintNode`; `privacyBoundary: 239 assertions passed` afterwards [ev: targeted suite rerun, 2026-11-28].
- NOT CLAIMED — ML person segmentation, remote levels without an exposed stream, or guaranteed advanced camera constraints. Blur is a radial soft-focus and Mathify backgrounds are masked washes; limitations are documented in `classroom/camera-background.js`.
