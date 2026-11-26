# Mathify server

Role-based API behind the trainer dashboard, student dashboard and live 1:1 session. Teaching is strictly **1-on-1**; there are no group classes.

This codebase state (`main` plus `feat/student-rtc-control-permission`) delivers auth + RBAC, session/quiz APIs, curriculum authoring, a contact booking API, live-readiness guards, a completed service-role Supabase adapter, a DB-backed session event outbox, trainer-owned student media permissions, a two-sided connection gate and reward trophies. The default runtime is the in-memory mock store; `DATABASE_MODE=supabase` selects live mode and never silently falls back to demo identities. Agora RTC/RTM tokens are real and server-signed, AI is Cloudflare Workers AI only (no DeepSeek/OpenAI), and the ordered SQL plan is reviewed by a dry-run/checksum runner. No live migration has been applied.

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

`GET /api/auth/demo` returns the same list.

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

### Shared session

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sessions/:sessionId/state` | Role-aware live state and permissions |
| `GET` | `/api/sessions/:sessionId/events?since=<seq>` | Cursor-based shared event log with key-free payloads |
| `POST` | `/api/sessions/:sessionId/chat` | Participant-only chat; sender identity from the JWT |
| `POST` | `/api/sessions/:sessionId/rtc-token` | Real server-signed Agora RTC/RTM token; channel, uid and peer derived server-side; blocked with `NETWORK_BELOW_MINIMUM` until both people pass the connection check |
| `POST` | `/api/sessions/:sessionId/media-permission` | Trainer/founder only: allow or revoke the student's local mute/camera buttons; revoke forces both tracks on before locking |
| `POST` | `/api/sessions/:sessionId/network-check` | Verified participant reports their own speed; role comes from the JWT, never the body |
| `POST` | `/api/sessions/:sessionId/badges` | Trainer/founder only: award a fixed-catalog badge; label and points come from policy |
| `POST` | `/api/sessions/:sessionId/end` | Trainer-only end + recap + recording link |

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

`quiz.launched`, `quiz.answer.saved`, `quiz.answer.revealed`, `quiz.question.changed`, `quiz.reteach.started`, `quiz.check.added`, `quiz.completed`, `quiz.draft.approved`, `rtc.media.control.changed`, `network.check.completed`, `badge.awarded`.

In mock mode the event stream is a bounded in-memory cursor log; in live mode it is the `mathify_session_events` outbox. Both are read through the scrubbed `/events` endpoint with an exclusive `since` cursor. Supabase Realtime canvas strokes are optional and carry no answer key. `classroom/` wires `/state`, `/events` and a live Agora call panel whose channel, uid and token always come from the server.

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
| `POST` | `/api/webhooks/recording` | Store vendor recording URL and notify |
| `POST` | `/api/webhooks/whatsapp` | Twilio WhatsApp parent assistant; returns TwiML |
| `GET` | `/api/admin/support-escalations` | Founder-only human-handoff review log |
| `GET` | `/api/realtime/log` | Trainer/founder view of local event log |
| `GET` | `/api/public/config` | Browser-safe Supabase URL/publishable key, connection thresholds and badge catalog only |

### Cloudflare Workers AI, Agora, Razorpay

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/agora/token?sessionId=…` | Real server-signed RTC + RTM tokens, 1-hour expiry; browser-supplied channel/uid/role are ignored |
| `POST` | `/api/agora/recording/start` | Start Agora Cloud Recording or mock recording |
| `POST` | `/api/agora/recording/stop` | Stop a started recording by `recordingId` |
| `POST` | `/api/razorpay/orders/monthly` | Create a 12-session / 540 SAR Razorpay order |
| `POST` | `/api/razorpay/webhook` | `payment.captured` → credit `sessions_remaining` once |

`services/agoraTokenService.js` owns channel, uid and peer identity and fails closed with `AGORA_NOT_CONFIGURED` until `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` are set.

`services/cloudflareService.js` generates curriculum in two Workers AI calls:
`generatePlannerAndCurriculum(context)` returns the `curriculum_map` and planner blocks;
`generateQuizTiers(context, plannerOutput)` returns `level_1`, `level_2`, `level_3` and
`advance_criteria`. Each call renders its own system prompt, parses strict JSON (with fences and
trailing commas tolerated), and validates the shape with Zod. A deterministic trainer-reviewable
fallback is used when Workers AI is unavailable. `generateQuizDraft(topic, difficulty)` remains as
a backward-compatible wrapper for the adaptive quiz generator.

`services/cloudflareAiService.js` is the single provider client. It handles bearer auth, timeouts,
both Workers AI response envelopes and JSON cleanup, and appends the strict JSON-only instruction to
every system prompt. `services/cloudflareClient.js` remains as a compatibility alias.

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

`services/whatsappAiService.js` uses the same Workers AI client. It queries the mock Supabase adapter for
quiz scores, attendance and session balance, then returns either a parent-safe reply, `ACTION: RESCHEDULE_REQUEST`
or `HUMAN_HANDOFF_REQUIRED`. The webhook logs handoffs, publishes a `support.handoff_required` event and fires
Slack/email alerts through `services/notificationService.js`. Twilio signature verification activates when both
`TWILIO_AUTH_TOKEN` and `TWILIO_WEBHOOK_URL` are set.

Add these env vars in `.env`:
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_MODEL`, `CLOUDFLARE_TIMEOUT_MS`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`,
`AGORA_CUSTOMER_KEY`, `AGORA_CUSTOMER_SECRET`, `AGORA_RECORDING_STORAGE_CONFIG`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server-only),
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WHATSAPP_NUMBER`, `TWILIO_WEBHOOK_URL`, `WHATSAPP_DEMO_PARENT_PHONE`,
`SLACK_WEBHOOK_URL`, `ADMIN_EMAIL`, `NODEMAILER_EMAIL`, `NODEMAILER_PASSWORD`.

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
- Founder role can audit all sessions.

## Configurable policy

`config/policy.json` leaves quiz scoring bands and teaching-score bands unset until the conflicting founder-doc values are confirmed. The 80% mastery unlock threshold and payout rules are configured:

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

Twenty-two Node suites run with plain `node` + `assert` via `npm test` (from this directory or the root); there is no Jest, Vitest, Playwright or Cypress setup. `TEST_REPORT.md` at the repository root has the full results, including `liveReadiness.test.js`, `livePersistence.test.js`, `liveOperations.test.js` and `apiSmoke.test.js`.

## Migrations

`db/schema.sql` is the source of truth. `migrations/0001_baseline.sql`, `0002_student_curriculum.sql` and `0003_live_persistence.sql` are reviewed with `npm run migrate` (dry run, SHA-256 checksums, no DB contact). Applying requires both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply`; see `migrations/README.md`. No live migration has been applied.

## Remaining work

1. Finish the partial LMS surface and mirror the remaining mock stores onto normalized relations.
2. Add founder-editable policy/mastery/trainer-policy settings screens and planner designer v1.
3. Rotate exposed credentials and make one live Cloudflare Workers AI call before launch.
4. OCR PDF pages 5–17 before quoting them verbatim.
