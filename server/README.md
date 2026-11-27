# Mathify server

Role-based API behind the trainer dashboard, student dashboard and live 1:1 session. Teaching is strictly **1-on-1**; there are no group classes.

This codebase state (`feat/student-rtc-control-perfection`, reviewed at `5639127`) delivers auth + RBAC, session/quiz APIs, curriculum authoring, a contact booking API, live-readiness guards, a completed service-role Supabase adapter, a DB-backed session event outbox, trainer-owned student media permissions, a two-sided connection gate, reward trophies, server-held mastery self-practice, a private parent ↔ trainer human chat with DLP founder flags, founder/RM people administration with an append-only manager audit, public registration, password change/reset and the full-screen teaching board. Live 1:1 video uses **LiveKit** with server-owned private Egress recording and signed webhooks, every AI call uses **freelm → Gemini → Groq → Cloudflare Workers AI**, and transactional email uses **Resend**; the earlier Agora routes remain only for compatibility and local tests. The default runtime is the in-memory mock store; `DATABASE_MODE=supabase` selects live mode and never silently falls back to demo identities. The ordered SQL plan is reviewed by a dry-run/checksum runner. All 49 suites pass in deterministic mock mode; current live evidence is in `LIVE_QA_REPORT.md`. Historical evidence is in `TEST_REPORT.md` and `E2E_MASTER_INTEGRATION_REPORT.md`.

**Current providers:** LiveKit (RTC, tokens, Egress, webhooks) · private S3-compatible/R2 storage with short-lived SigV4 links (recordings) · Resend (all mail) · freelm → Gemini → Groq → Cloudflare Workers AI (every model call) · Supabase service role (live persistence) · Razorpay (packs) · Twilio (WhatsApp). Agora, Nodemailer/SMTP, OpenAI and DeepSeek are not current providers.

## Run

```powershell
cd server
npm install
copy .env.example .env
npm start
```

From the repository root the same actions are `npm start`, `npm run dev`, `npm test` and `npm run migrate`.

Health check:

```text
GET http://localhost:4000/api/health
```

Demo accounts (password `mathify-demo`, or `DEMO_PASSWORD` from `.env`):

| Role | Email |
| --- | --- |
| Founder | founder@mathify.app |
| Trainer | trainer@mathify.app |
| Student | student@mathify.app |
| Parent (linked to `usr_student_001`) | parent@mathify.app |

`GET /api/auth/demo` returns the same list. Founder and RM demo accounts are `founder@mathify.app` and `rm@mathify.app` with the same demo password.

`PATCH /api/admin/people/:id/password` is the scoped credential-recovery endpoint. `{ "generated": true }` issues the existing `firstname@mathify123` value and is allowed to a relationship manager only for a trainer whose KYC is on file and whose access was granted; any supplied `password` returns `403 RM_PASSWORD_CHOICE_DENIED`, other target roles return `403`, and an ungranted trainer returns `422 KYC_OR_GRANT_REQUIRED`. The founder keeps chosen-password and any-role override. Both roles are audited (`password.temp_issued` / `password.granted`) without writing the password value. [ev: local HTTP contract check, 2026-11-26]

## Auth

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "trainer@mathify.app", "password": "mathify-demo" }
```

Response:

```json
{ "token": "...", "user": { "id": "...", "role": "trainer", "name": "Ananya Rao" } }
```

Send the token as `Authorization: Bearer <token>`.

## Endpoints

### Trainer / founder

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/trainer/dashboard` | Hero, today timeline, attention queue and metric sources |
| `GET` | `/api/trainer/score` | Teaching score shape; value stays null until bands are configured |
| `GET` | `/api/trainer/payouts` | Current payout with base pay, fines, bonus, MVT award and daily trend |
| `GET` | `/api/trainer/payouts/:period` | Payout for a `YYYY-MM` period |
| `GET` | `/api/trainer/attention` | Derived planner, quiz, draft, attendance and recording signals |
| `GET` | `/api/trainer/attendance` | Six-session attendance register with present/absent/late/leave/unattended states |
| `PATCH` | `/api/trainer/attendance/:sessionId` | Set one student's status for a session |
| `POST` | `/api/trainer/attendance/:sessionId/save` | Save records and return the refreshed register |
| `GET` | `/api/trainer/sessions` | Sessions owned by the trainer |
| `GET` | `/api/trainer/sessions/:sessionId` | Full planner, pages, trainer notes, quiz answer key |
| `PATCH` | `/api/trainer/sessions/:sessionId/planner` | Replace planner or toggle one item |
| `PATCH` | `/api/trainer/sessions/:sessionId/page` | Set current page, 1–3 |
| `GET` | `/api/trainer/quiz/templates` | Curriculum templates available for AI drafts |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/launch` | Start quiz, reset attempts, publish event |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/reveal` | Reveal one question or all to the student |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/next` | Advance; completes the quiz after the last question |
| `GET` | `/api/trainer/sessions/:sessionId/quiz/drafts` | AI drafts awaiting trainer approval |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/drafts/:draftId/approve` | Approve a draft into the live question set |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/reteach` | Freeze quiz during reteach |
| `POST` | `/api/trainer/sessions/:sessionId/quiz/new-check` | Add a fresh parallel question from the same objective |
| `POST` | `/api/chat/trainer-support` | Trainer/founder only: Mathify Trainer Desk support reply from verified payout, leave and policy facts |

### Leave (trainer, student, founder)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/leaves` | Upcoming sessions with eligibility, leave balance and applied requests |
| `POST` | `/api/leaves` | Apply for mutual leave on a session or date; auto-approved when 2+ days notice |

The trainer balance is 8 session leaves per calendar month. A student-initiated leave is mutual but does not consume a trainer credit. Applying sets the session to `leave`, records student attendance as `leave`, pays the trainer nothing and deducts no pack session.

### Student / founder

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/student/dashboard` | Next session, streak, Mastery, recordings, safe trophy list and points |
| `GET` | `/api/student/sessions/:sessionId` | Sanitized lesson + quiz; no notes or answer key |
| `POST` | `/api/student/sessions/:sessionId/quiz/answers` | Save answer only; no correctness or explanation |
| `POST` | `/api/chat/student-doubt` | Student/founder only: Study Buddy doubt reply; text plus optional PNG/JPG/WEBP/GIF image up to 1 MB, Socratic hints only |
| `POST` | `/api/student/practice/batch` | Start a 10-question self-practice batch, 15% harder than the last one |
| `GET` | `/api/student/practice/batch/:id` | Re-read a student-owned batch; prompts, options and progress only |
| `POST` | `/api/student/practice/batch/:id/answer` | Save one answer; returns a private correctness boolean, no key or explanation |

### Parent ↔ trainer chat

Human-only, strictly 1-on-1 threads. The demo parent is linked to `usr_student_001`; a trainer reaches only assigned students; the founder audits all threads and flags but cannot send. `GET /api/parent-chat/thread/:studentId` (alias `/threads/:studentId/messages`) returns messages plus the viewer's unread count. `POST /api/parent-chat/thread/:studentId/messages` (alias `/threads/:studentId/messages`) sends; `POST /api/parent-chat/thread/:studentId/read` (alias `/threads/:studentId/mark-read`) clears only the caller's unread count. `GET /api/parent-chat/unread` (alias `/unread-summary`) is the dashboard summary. `GET /api/parent-chat/flags` (alias `/privacy-flags`) is founder-only.

Text is scanned by `services/parentChatDlp.js` before any write or delivery. Email, URL/`www`, phone/`+country`/10-digit, `@handle`, social platform names, contact schemes and explicit off-platform requests return `422 CONTENT_BLOCKED` with a neutral message. The rejected text is not echoed, stored or published to realtime; a founder-only flag keeps actor id/role, reason code, masked preview and timestamp. Messages, unread cursors and flags use the existing service-only `mathify_records` store (collections `parent_chat_message`, `parent_chat_read`, `parent_chat_flag`) — no SQL migration and no browser Data API grant.

### Shared session

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sessions/:sessionId/state` | Role-aware live state and permissions |
| `GET` | `/api/sessions/:sessionId/events?since=<seq>` | Cursor-based shared event log with key-free payloads |
| `POST` | `/api/sessions/:sessionId/chat` | Participant-only chat; sender identity from the JWT |
| `POST` | `/api/sessions/:sessionId/rtc-token` | Legacy server-signed Agora RTC/RTM token; retained for compatibility/tests |
| `POST` | `/api/livekit/token` | Canonical LiveKit token: reads `roomName`/`participantName` from `req.body`, verifies them against the session, and returns JWT + WebSocket URL |
| `POST` | `/api/get-token` | Alias of `/api/livekit/token`, used by the classroom/trainer adapters |
| `POST` | `/api/sessions/:sessionId/media-permission` | Trainer/founder only: allow or revoke the student's local mute/camera buttons; revoke forces both tracks on before locking |
| `POST` | `/api/sessions/:sessionId/network-check` | Verified participant reports their own speed; role comes from the JWT, never the body |
| `POST` | `/api/sessions/:sessionId/badges` | Trainer/founder only: award a fixed-catalog badge; label and points come from policy |
| `POST` | `/api/sessions/:sessionId/end` | Trainer-only end + recap; ready recordings are exposed later through role-scoped signed links |

### Public connection probe and policy

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/network/probe?bytes=<n>` | Cache-busted, no-store download payload for the classroom speed test; no identity or secrets |
| `POST` | `/api/network/probe` | No-store upload echo point; body size is clamped to the configured probe size |
| `GET` | `/api/public/config` | Browser-safe policy: Supabase publishable config, realtime mode, connection thresholds and the badge catalog |

Connection policy lives in `server/config/policy.json` under `networkCheck` (`15` down, `10` up, `250 ms`, `15` minute freshness). `rtc.media.control.changed`, `network.check.completed` and `badge.awarded` are allowlisted, scrubbed session events. Extra state (`mediaPermissions`, `networkChecks`, `badges`, `trophyPoints`) is stored in the service-only `mathify_records` JSONB store in live mode, so it persists without a schema migration.

### Quizzer state flow

Questions are generated as **curriculum template + AI draft**, then approved by the trainer before they reach a student.

```text
draft → answering → awaiting_reveal → revealed → answering → … → complete
                         ↓
                      reteach → recheck
```

- `POST /quiz/answers` only returns `{ attemptId, saved, phase }`.
- `quiz.answer.saved` carries no correctness.
- Correctness, `answerIndex` and `explanation` enter the student payload only after `POST /quiz/reveal`.
- Low readiness never auto-promotes; the trainer triggers `reteach` and then `new-check`.

Realtime events:

`quiz.launched`, `quiz.answer.saved`, `quiz.answer.revealed`, `quiz.question.changed`, `quiz.reteach.started`, `quiz.check.added`, `quiz.completed`, `quiz.draft.approved`, `rtc.media.control.changed`, `network.check.completed`, `badge.awarded`, `reaction.sent`, `reaction.permission.changed`, `shared.celebration`.

Student Control is the single trainer surface for `/media-permission`, `/media-state`, `/reaction-permission`, badge awards, board sharing, quiz controls and session end. Celebrations are server-owned through `/celebrate`; clients may only send a trigger id and allowlisted preference ids. A server quiz launch also opens the student quiz view so celebrations stay suppressed in both tabs.

In mock mode the event stream is a bounded in-memory cursor log; in live mode it is the `mathify_session_events` outbox. Both are read through the scrubbed `/events` endpoint with an exclusive `since` cursor. Supabase Realtime canvas strokes are optional and carry no answer key. `classroom/` and `trainer/` wire `/state`, `/events` and a LiveKit call panel whose room, identity and token always come from the server.

#### Quiz Wacom overlay over Supabase Realtime

`classroom/realtime.js` subscribes to `INSERT` events on `public.quiz_canvas_strokes`.
The browser receives only the Supabase URL and publishable key from
`GET /api/public/config`; the secret key stays server-side. A signed-in host supplies:

```js
window.MATHIFY_SESSION_ID = '<uuid from public.sessions>';
window.MATHIFY_SUPABASE_ACCESS_TOKEN = '<Supabase user JWT>';
window.MATHIFY_USER = { role: 'trainer' }; // or 'student'
```

RLS permits trainer/founder writes and participant reads. Without these values the
local canvas still works and Realtime is skipped. No answer key or correctness is
ever sent through the stroke channel.

#### Participant privacy

Trainer and student payloads expose each other's display name only — no email, phone,
social link, profile id, title or pay rate. `serializers.participant()` is the only
cross-role identity builder, and `public.session_participant_names` is the only
browser-readable Supabase view for session partners. Face, voice, names, role and
whiteboard/Wacom activity are the only shared signals.

### Public

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/contact` | Validated, rate-limited booking request; stored and forwarded to configured Slack/email channels, never `mailto:` |

### Policy / webhooks

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/policy/config` | Configurable rules; unresolved values are `null` |
| `POST` | `/api/webhooks/recording` | Legacy Agora recording-ready webhook; retained for compatibility/tests, not the current LiveKit Egress path |
| `POST` | `/api/webhooks/whatsapp` | Twilio WhatsApp parent assistant; returns TwiML |
| `GET` | `/api/admin/support-escalations` | Founder-only human-handoff review log |
| `GET` | `/api/admin/settings` | Founder-only runtime settings draft with read-only money widgets |
| `PATCH` | `/api/admin/settings` | Founder-only allowlisted section patch; money/network keys return `FIELD_READ_ONLY` |
| `DELETE` | `/api/admin/settings` | Reset runtime draft to file-backed defaults |
| `GET` | `/api/realtime/log` | Trainer/founder view of local event log |
| `GET` | `/api/public/config` | Browser-safe Supabase URL/publishable key, connection thresholds and badge catalog only |

### LiveKit, freelm, Resend, Razorpay

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/livekit/token`, `/api/get-token` | LiveKit JWT + WebSocket URL; server-owned room/identity, subscribe-only observer grants; `NETWORK_BELOW_MINIMUM` until both sides pass |
| `POST` | `/api/livekit/recording/start`, `/api/livekit/recording/stop` | Trainer-only Egress control; server derives room, object key and private S3 destination |
| `POST` | `/api/webhooks/livekit` | Verified LiveKit JWT + raw-body `sha256`; reconciles presence and Egress status/final object key |
| `GET` | `/api/recordings` | List ready private recordings for the caller's role scope |
| `GET` | `/api/recordings/:sessionId/url` | Mint a short-lived SigV4 GET link (10 minutes default, 1 hour cap); no permanent URL or secret |
| `GET` | `/api/parent/reminders` | Parent-only in-app class reminders scoped to the linked child |
| `POST` | `/api/generate-feedback` | Structured feedback through the shared `freelm → Gemini → Groq → Cloudflare` chain; mock mode returns deterministically |
| `POST` | `/api/ai/test-ping` | Live-only, founder-only probe; requires two real provider answers, never returns a mock result |
| `POST` | `/api/razorpay/orders/monthly` | Create a 12-session / 540 SAR Razorpay order |
| `POST` | `/api/razorpay/webhook` | `payment.captured` → credit `sessions_remaining` once |

`services/livekitTokenService.js` lazily loads `livekit-server-sdk`, derives the room as `mathify-<sessionId>` and the identity from the JWT role/id, converts `https://` to `wss://`, and awaits `toJwt()`. A browser-supplied `roomName` may only confirm the derived room; any other value returns `403 ROOM_MISMATCH`. `ALLOW_DIRECT_ROOM_TOKENS=true` enables a dev-only literal-room path and is disabled in production/Supabase mode. Optional `LIVEKIT_AGENT_NAME` dispatch is trainer-initiated, deduplicated with `listDispatch`, and never runs in mock mode or for observers.

`services/cloudflareAiService.js` is the single server-side model boundary. Its live order is `freelm → Gemini → Groq → Cloudflare Workers AI`; `services/freelmStage.js` restricts freelm to those three approved provider families with keyless mode disabled, then the direct stages run in the same order. Image questions skip the text-only freelm and Groq stages but still use Gemini then Cloudflare. `services/freeLmService.js` sanitizes PII, calls that boundary for feedback/transcripts, and probes providers independently for `/api/ai/test-ping` (two live successes required). `FREELM_TIMEOUT_SECONDS` is in seconds and `FREELM_MODEL` defaults to `chat:fast`. Mock mode returns before any provider client is created. `services/emailService.js` wraps Resend `emails.send()` and exposes `sendSessionEmail(studentEmail, sessionLink)`.

LiveKit recording is available through `POST /api/livekit/recording/start` and
`POST /api/livekit/recording/stop`. The trainer sends only a session id or
recording id; the server derives the room, object key and S3 destination. With
no LiveKit Egress storage configured, both routes fail closed with
`RECORDING_NOT_CONFIGURED`. Webhook verification uses `WebhookReceiver` with the
existing `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` and a `sha256` checksum of the
exact raw body; there is no separate LiveKit webhook secret. A verified
`egress_ended` event with `fileResults` writes the object key and marks the
recording `stopped`; failed or aborted Egress without a file is `failed` and
never watchable. The internal `agora_join`/`agora_leave` presence labels are
legacy compatibility names, not Agora transport.

`GET /api/recordings` and `GET /api/recordings/:sessionId/url` use `canAccessRecording()`:
founder and relationship manager may review any class; trainer, student and
parent are scoped to their own 1:1 session. Links are 600-second S3 SigV4 GET
URLs (60–3600 second bounds) built by `recordingAccessService.js`; no permanent
URL, bucket name in a browser payload, or secret key is returned. Legacy routes
`GET /api/agora/token`, `POST /api/agora/recording/start|stop` and
`/api/agora/webhook` are retained for compatibility/tests only.

Curriculum path — `services/cloudflareService.js` generates curriculum in two model calls through
the shared chain: `generatePlannerAndCurriculum(context)` returns the `curriculum_map` and planner
blocks; `generateQuizTiers(context, plannerOutput)` returns `level_1`, `level_2`, `level_3` and
`advance_criteria`. Each call renders its own system prompt, parses strict JSON (with fences and
trailing commas tolerated), and validates the shape with Zod. A deterministic trainer-reviewable
fallback is used only in mock mode; live calls fail closed instead of substituting a fake answer.
`generateQuizDraft(topic, difficulty)` remains as a backward-compatible wrapper for the adaptive quiz
generator.

Provider client — `services/cloudflareAiService.js` also handles bearer auth, timeouts, both Workers
AI response envelopes and JSON cleanup, and appends the strict JSON-only instruction when requested.
`services/cloudflareClient.js` remains as a compatibility alias.

`services/curriculumContext.js` maps CBSE, ICSE, IB, IGCSE, Common Core, British National and Ontario
to country, style, notation and pedagogy, then returns a `promptInjection` from the student profile.
Only academic fields are read — names, email, phone and social links never enter a prompt.
`services/aiCurriculumService.js` is the integration layer: it calls `getCurriculumContext(student)`
first, injects the result into the planner, quiz and parallel-question system prompts, and demands a
visual analogy, story narration, 220px expandable `sketch_space` blocks and `trainerInstructions`
for every planner block. `generateParallelQuestion(student, concept, difficulty)` uses the same
curriculum injection so a reteach item matches the student's learning style.

Student payloads use `serializers.toStudentCurriculum()` and `serializers.toStudentQuizTiers()`.
Those allowlists strip `trainerInstructions`, `misconception_watch`, sketch trainer prompts, answer
keys, explanations and withheld hints. A hint only appears when the server passes an explicit
`grantedHints` map; correctness remains post-reveal only.

Legacy WhatsApp path — `services/whatsappAiService.js` uses the same Workers AI client. It queries the mock Supabase adapter for
quiz scores, attendance and session balance, then returns either a parent-safe reply, `ACTION: RESCHEDULE_REQUEST`
or `HUMAN_HANDOFF_REQUIRED`. The webhook logs handoffs, publishes a `support.handoff_required` event and fires
Slack/email alerts through `services/notificationService.js`. Twilio signature verification activates when both
`TWILIO_AUTH_TOKEN` and `TWILIO_WEBHOOK_URL` are set.

### AI chat Worker

`worker-core.mjs` is pure logic (no fetch or platform globals) shared by the Worker source and the local Express bridge. `worker.js` verifies the Express-issued HMAC token, applies allowlisted CORS and a per-minute rate limit, then calls the same chain as the server: restricted freelm → Gemini → Groq → Cloudflare. `wrangler.toml` declares `nodejs_compat`, the `[ai]` binding and non-secret model settings; deploy secrets with `wrangler secret put` (`AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, optional `FREELM_MODEL`). No Cloudflare or Supabase secret is exposed to the browser.

`routes/chat.js` → `services/chatWorkerService.js` forwards only the JWT role, actor id, sanitized question and, for Study Buddy, the image. `CHAT_WORKER_URL` is optional: when set, Express calls the deployed Worker; otherwise the same core runs locally through the shared chain. Trainer Desk uses the verified policy facts (₹300–₹400 per completed 1-on-1 session, exact pay per contract/offer letter or onboarding, 48-hour notice, fines and bonuses, severe complaints to `founder@mathify.app`) and always appends exactly one closing line. Study Buddy gives Socratic hints and visual analogies only, never a final answer; unsafe questions return the exact parent/trainer escalation line.

Reply guards reject contact data, social links, trainer-only material and student final-answer phrasing. Image bytes are decoded in memory only and never logged or stored. Audit rows go to `trainer_support_logs` / `student_doubt_logs` through the service-role key only.

**Current status:** the Worker bundle builds cleanly with `wrangler@3` (`153.09 KiB / 39.64 KiB gzip`); live deploy remains blocked because the current Cloudflare token lacks Workers Scripts deploy permission. The local Express bridge uses the same verified chain and passed live chat checks. Historical legacy-provider evidence remains in `TEST_REPORT.md`.

### Mastery self-practice

`services/masteryPracticeService.js` builds batches of exactly 10 questions, ramps difficulty 15% per batch (inside the requested 10–20% range) and caps a topic at 80 questions (8 batches); after that the student gets an encouraging rest message. There is no cross-topic cap. Answer keys stay in service-only `practice_batches` records; the browser receives prompts, options and a private correctness boolean only — no hint, explanation or trainer-only field. Batch ids are checked against the signed-in student.

Add these env vars in `.env` (`.env.example` lists every supported name):

Required in production: `AUTH_SECRET`, `CORS_ORIGIN`, `DATABASE_MODE=supabase`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server-only),
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
the full AI chain (`GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`) plus `FREELM_MODEL`, `FREELM_TIMEOUT_SECONDS`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WEBHOOK_URL`. `FREELM_KEYLESS` and non-chain provider keys are rejected.

Optional: `LIVEKIT_AGENT_NAME`, `ALLOW_DIRECT_ROOM_TOKENS` (dev-only demo escape hatch),
`APP_ORIGIN`, `RESEND_API_KEY`, `RESEND_FROM`, `CHAT_WORKER_URL`, `TWILIO_ACCOUNT_SID`,
`TWILIO_WHATSAPP_NUMBER`, `WHATSAPP_DEMO_PARENT_PHONE`, `SLACK_WEBHOOK_URL`, `ADMIN_EMAIL`.
All email, including password resets, reminders and human handoffs, goes through Resend. At T−15 minutes parent and trainer receive a join email and the parent also gets an in-app notification; at T−2 minutes an absent trainer gets a second warning. Missing `RESEND_API_KEY`/`RESEND_FROM` returns `EMAIL_NOT_CONFIGURED`; no delivery is mocked.

Legacy and not required by the production guard: `AGORA_*`, `RECORDING_WEBHOOK_SECRET`.
They are retained only for compatibility routes and local tests; Cloudflare Workers AI
is a required member of the approved AI chain.

### Live session creation

`POST /api/trainer/sessions` writes to Supabase when `DATABASE_MODE=supabase`. It uses the
authenticated trainer's UUID from the JWT, so a trainer cannot create sessions for another trainer.
Founders may pass `trainer_id`. The body needs `student_id` as a real UUID from `public.users`;
`code` and `title` are generated server-side because both are required by `public.sessions`.

Test with a trainer bearer token:

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "title": "Ratios · live check"
}
```

The route returns `503 DATABASE_MODE_NOT_LIVE` until Supabase mode and keys are configured.

## Safety rules already enforced

- Sessions are strictly one trainer and one student.
- Trainers only see their own sessions; students only see their own.
- `trainer_instructions` live in a separate table/mapping and are never serialized for students.
- Quiz `answerIndex`, `explanation` and attempt `correct` are withheld until the trainer reveals that question.
- Correctness is not broadcast on the shared realtime channel; `quiz.answer.saved` only carries ids and a timestamp.
- AI drafts and templates are trainer-only until approved.
- AI chat prompts carry no name, contact detail, session id, answer key, hint or trainer note; image bytes are decoded in memory only.
- Self-practice answer keys stay in service-only records; only prompts, options and a private correctness boolean reach the browser.
- Parent ↔ trainer chat is human-only and strictly 1-on-1: the demo parent is linked to `usr_student_001`, trainers see only assigned students and the founder audits all threads. No group classes, batch pause, answer keys or trainer notes in messages.
- Parent chat DLP blocks email, URL/`www`, phone/`+country`/10-digit numbers, `@handle`s and social platform names before storage or realtime. A blocked message is not delivered, echoed or stored; the sender gets `422 CONTENT_BLOCKED` and a founder-only flag keeps actor id/role, reason code, masked preview and timestamp.
- Parent chat records and flags live in the existing service-only `mathify_records` store; browser Data API roles have no access and no SQL migration is required.
- Founder role can audit all sessions and all DLP flags.

## Configurable policy

`config/policy.json` is the file-backed source of truth. Teaching-score scale, bands and target stay `null` until the conflicting founder-doc values are confirmed; the 80% mastery unlock threshold and payout rules are configured:

- 300–400 INR base pay per completed session
- 6 hours / 6 sessions daily cap; under 3 hours is flagged for payroll review
- 2-day (48-hour) notice by either side is mutual leave: no payout, no fine and no pack/attendance penalty
- A trainer cancellation with less than that notice costs exactly that trainer's session pay and marks the student session `unattended`
- No-shows earn no payout and mark the student session as used
- 100% monthly attendance pays 2,000 INR, rising by 500 INR per consecutive month
- MVT ranks trainers by completed sessions and pays 3,000 / 2,000 / 1,000 INR
- 38-day non-refundable packs
- 24–48-hour reschedule window

## Testing

Forty-nine Node suites run with plain `node` + `assert` via `npm test` (from this directory or the root); there is no Jest, Vitest, Playwright or Cypress setup. Use `DATABASE_MODE=mock npm test` for deterministic local results when `.env` points at Supabase. Current suites include `livekitEgress.test.js`, `livekitWebhooks.test.js`, `reminderTimezone.test.js`, `recordingAccess.test.js` and `securityHardening.test.js`. `LIVE_QA_REPORT.md` at the repository root records current live HTTP, signed webhook, reminder/timezone, role-probe and Supabase evidence. `TEST_REPORT.md` has historical full results; its live evidence table records the old provider round, not current LiveKit/Resend/AI-chain validation.

## Migrations

`db/schema.sql` is the source of truth. All eight reviewed SQL files through `0009_recordings_storage.sql` are checked with `npm run migrate` (dry run, SHA-256 checksums, no DB contact). Applying requires both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply`; see `migrations/README.md`. No runner-based live migration has been applied; the private recordings bucket and its session-scoped reader policy were applied separately after review.

## Remaining work

1. Finish the partial LMS surface (publish and pack import) and mirror the remaining mock stores onto normalized relations.
2. Decide whether founder settings drafts should become a reviewed persistence source; planner exports remain local authoring output until then.
3. Rotate exposed credentials, including LiveKit, and verify production env validation; historical Workers AI text evidence is documentary. Live LiveKit signing, AI-chain calls, signed webhooks, role-scoped link signing and Supabase SQL have been verified in `LIVE_QA_REPORT.md`; Resend delivery, Razorpay/Twilio sends, a real joined-room recording and runner-based migration apply remain gated.
4. OCR PDF pages 5–17 before quoting them verbatim.
