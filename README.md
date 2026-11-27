# Mathify Learning OS

This repository contains the Mathify dashboard website and its API layer. Live teaching is strictly **1-on-1**; there are no group classes.

> **Branch note:** current branch `feat/student-rtc-control-perfection`. Live 1:1 video uses **LiveKit**, including server-owned **Egress** recording into private S3-compatible/R2 storage and signed LiveKit webhooks; role-scoped viewers receive short-lived signed links, never a permanent public URL. Transactional email uses **Resend** and fails closed when keys are absent. Every server-side AI call uses one chain: **freelm → Gemini → Groq → Cloudflare Workers AI**. The chat Worker source follows the same chain and builds cleanly; its live deploy remains gated by the existing Cloudflare token's permissions. Agora, Nodemailer/SMTP, OpenAI/DeepSeek and Cloudflare-only AI references in archived reports describe the earlier provider round, not current state. Agora transport has since been removed. See [`LIVE_QA_REPORT.md`](LIVE_QA_REPORT.md) for the current redacted verification ledger.

> **Full project guide:** [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) explains what, why, how, where and when for every part of Mathify.

## Current service providers

| Concern | Current provider / service | What is true now |
| --- | --- | --- |
| 1:1 live video | **LiveKit** | Server-signed `AccessToken`, server-derived `mathify-<sessionId>` room, `wss://` media URL. Agora transport has been removed. |
| Class recording | **LiveKit Egress → private S3-compatible/R2 storage** | Trainer-only start/stop; signed LiveKit webhooks reconcile status and final object key; role-scoped short-lived SigV4 GET links. No public object URL is stored. |
| Transactional email | **Resend** | All mail, including reminders and password resets. No SMTP/Nodemailer sender remains; missing keys fail closed. |
| AI/LLM calls | **freelm → Gemini → Groq → Cloudflare Workers AI** | One chain for server and Worker source; image questions use Gemini → Cloudflare. OpenAI/DeepSeek are unused. |
| Persistence | **Supabase service role** | Live mode never falls back to demo identities; browser sees only the publishable key. |
| Payments / WhatsApp | **Razorpay / Twilio** | Both remain credential-gated and fail closed when unset. |

## Surfaces

| Path | What it is |
| --- | --- |
| `index.html` | Public landing page — 1-on-1 tutoring, tutor profile and demo. |
| `apps.html` | Suite hub linking the live dashboards. |
| `home/index.html` | Redirect to the root public home. |
| `student/index.html` | Student dashboard — Mastery with self-practice, sessions, recordings, reward trophies, wallet and Study Buddy chat. |
| `trainer/index.html` | Trainer console — attendance, timeline, attention queue, Trainer Desk support chat and parent-thread unread badge. Live classes start from the camera check and open in the classroom. |
| `parent/index.html` | Parent desk — private 1-on-1 human thread with the child's trainer, unread count and DLP-safe send feedback. |
| `classroom/index.html` | 1:1 live classroom — planner, whiteboard, quizzer, video and notes. |
| `lms/` | LMS surface (partial) with local planner designer. |
| `founder/` | Founder settings drafts — policy, mastery and trainer policy; money widgets are read-only. |
| `server/` | Express API, mock DB, auth/RBAC, quizzer, LiveKit tokens/egress/webhooks, the shared AI chain, Resend email and Razorpay seams. Cloudflare Workers AI is a required final chain stage, not a legacy provider. |
| `worker-core.mjs`, `worker.js`, `wrangler.toml` | Cloudflare Worker source plus a platform-free shared prompt/validation core using the same freelm → Gemini → Groq → Cloudflare chain. Deployment remains permission-gated. |

## Current state

- 49 Node test suites (`DATABASE_MODE=mock npm test` → `EXIT=0`), including `liveReadiness.test.js`, `livePersistence.test.js`, `liveOperations.test.js`, `rtcControls.test.js`, `engagementControls.test.js`, `parentChat.test.js`, `founderAdmin.test.js`, `relationshipManager.test.js`, `registration.test.js`, `passwordFlow.test.js`, `adminAudit.test.js`, `fullBoard.test.js`, `livekitEgress.test.js`, `livekitWebhooks.test.js`, `reminderTimezone.test.js`, `recordingAccess.test.js`, `securityHardening.test.js` and `apiSmoke.test.js`. Tests use plain `node` + `assert` — no Jest, Vitest, Playwright or Cypress; current local and live evidence is in `LIVE_QA_REPORT.md`.
- `.github/workflows/ci.yml`, a `Dockerfile`, `docker-compose.yml`, `render.yaml` and `railway.json`; root `package.json` provides `start`, `dev`, `test`, `migrate`, `seed`, `reminders` and `reminders:once`. CI runs `reminders:once` every five minutes; the web process keeps its timer disabled. The job checks 24-hour/1-hour reminders, the 15-minute parent + trainer join window and the trainer-only 2-minute warning.
- `server/db/schema.sql` plus eight ordered reviewed SQL migrations through `0009_recordings_storage.sql`, checked by a dry-run/checksum runner. No runner-based live migration has been applied; the private `recordings` bucket and its hardened session-reader policy were applied separately through the linked Supabase MCP after review.
- Default runtime is the in-memory mock store. `DATABASE_MODE=supabase` selects the completed service-role adapter in `server/db/supabase.js`; production never silently falls back to demo identities.
- Structured feedback (`POST /api/generate-feedback`) goes through the shared `cloudflareAiService` boundary with a `system`/`user` message array; curriculum drafts and both dashboard chats enter the same `freelm → Gemini → Groq → Cloudflare` chain. `worker-core.mjs` is the platform-free core used by the Worker source and the local Express bridge; it is not a legacy provider. Mock mode returns deterministic replies before any provider call. No browser code receives Cloudflare, Supabase, freelm or LiveKit secrets. LiveKit tokens are server-signed from the verified session; transactional email uses Resend; the contact booking API stores validated requests and notifies configured channels.
- Founder/RM people desks are backed by an append-only manager audit. The founder can grant any non-founder credential, choose a password and edit pay. A relationship manager can grant access and, only for a KYC-verified trainer with an existing access grant, issue the generated `firstname@mathify123` temporary password; the manager cannot choose the value, revoke a desk, set salary or edit founder-set pay. Free account creation and password reset live at `/register.html` and `/password-reset.html`. Browser interaction, live Supabase, live providers and migration apply are NOT verified in this run. [ev: `npm.cmd test --prefix server`; local HTTP contract check, 2026-11-26]
- Trainer Desk answers payout (₹300–₹400 per completed 1-on-1 session; exact pay is per the trainer contract/offer letter or as stated during onboarding), the 48-hour notice rule, fines and bonuses, and routes severe complaints to `founder@mathify.app`. Study Buddy gives Socratic hints and visual analogies only, never a final answer; it accepts PNG/JPG/WEBP/GIF images up to 1 MB.
- Mastery self-practice offers 10 questions per batch and another 10 on demand, ramping difficulty 15% per batch, with a hard cap of 80 questions per topic (8 batches) and no cross-topic cap. Answer keys stay in service-only `practice_batches` records; the browser receives prompts, options and a private boolean only.
- A private **parent ↔ trainer** human chat is available to the new demo parent for their own child (`usr_student_001`) and to trainers only for assigned students; the founder can audit all threads. Messages are 1-on-1, carry per-recipient unread counts and mark-read, and are never AI. Regex DLP blocks email, URL/`www`, phone/`+country`/10-digit numbers, `@handle`s and social platform names: a blocked message is not delivered, echoed, stored or published to realtime; instead a founder-only flag records actor id/role, reason code, masked preview and timestamp, and the sender gets `422 CONTENT_BLOCKED`. No new SQL migration is needed — messages, unread state and flags live in the existing service-only `mathify_records` store, and browser Data API roles have no access.
- The `lms/` surface is partial: course, module, review and planner designer are usable; pack import and publish remain disabled. Founder settings are runtime drafts; money fields are read-only and deployment policy stays file-backed until reviewed.

## Run locally

One command installs the API dependencies and serves the UI and API from the same origin:

```powershell
npm install --prefix server
npm start
```

Open `http://localhost:4000/`. The Express app serves the reviewed HTML/CSS/JS surfaces and the API at `/api`; server source, migrations and `.env` files are never exposed. For a separate frontend origin, set `window.MATHIFY_API_BASE` to the API root before the app scripts load. The root scripts wrap the same commands: `npm run dev` (watch), `npm test`, `npm run migrate`, `npm run seed` and `npm run reminders`.

Copy `server/.env.example` to `server/.env` before adding credentials; `.env` is git-ignored. The default port is `4000`.

Review the ordered SQL plan with:

```powershell
cd server
npm run migrate
```

`npm run migrate` is a dry run and contacts no database; the ordered plan now includes `0009_recordings_storage.sql`. Applying is blocked until both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply` are set deliberately; see `server/migrations/README.md`. No runner-based live migration has been applied.

## Realtime and live mode

The shared session event stream uses a bounded in-memory cursor log in mock mode and the `mathify_session_events` outbox in live mode; both feed the same server-scrubbed `/events` polling endpoint. The safe channel is opened when a session loads, not only during a quiz, so media-control and connection changes reach both people at any time. Supabase Realtime canvas strokes are optional and carry no answer key. LiveKit tokens are server-signed; the classroom and trainer call panels join only with a server-derived room and identity, and founder observers are subscribe-only. Face, voice, names, role and whiteboard/Wacom activity are the only shared signals; answer keys, explanations and trainer notes never reach students.

### Recordings, reminders and timezones

- **Private Egress recording:** start/stop remains trainer-only; LiveKit writes to the configured private S3-compatible/R2 bucket, and the browser never receives storage credentials or a permanent URL. A verified LiveKit webhook reconciles Egress status and the final object key. Failed or aborted Egress without `fileResults` never becomes watchable. The internal `livekit_join` presence label records verified LiveKit join evidence.
- **Role-scoped playback:** founder and relationship manager may review any class; trainer, student and parent are confined to their own 1:1 session. `GET /api/recordings` lists only ready recordings, and `GET /api/recordings/:sessionId/url` mints a short-lived SigV4 GET link (10 minutes default, 1 hour cap) with no secret or bucket name in the browser payload.
- **Reminders:** 15 minutes before class, parent and trainer receive a Resend join email and the parent also gets an in-app notification. If the trainer has not joined by 2 minutes before start, a second Resend warning tells them slots are appearing and to join now to avoid penalty. With Resend unset, delivery fails closed as `EMAIL_NOT_CONFIGURED`; no mail success is claimed.
- **Timezones:** one absolute UTC instant is stored; each viewer sees it in their registered IANA zone, with the child's registration zone as the fallback for a shared parent login. Invalid zones are rejected with `INVALID_TIMEZONE`.

### Classroom media and connection rules

- Students start with microphone and camera controls. The trainer's **Access** button grants or revokes that ability; a student is rejected by the server with `403` if they try to change the flag themselves.
- Revoking always forces the student's local tracks on **before** the buttons are locked. If a browser cannot actually enable a track (permission denied, stopped track, offline tab), the classroom says so instead of claiming audio/video are on. The server state remains authoritative and is re-read on the next load or event.
- Quiz and whiteboard transitions, tab focus and a light in-call keep-alive reaffirm the chosen media state on every device type — laptop/PC, Android/iPad tablet and Android/iOS phone. A silent mobile suspension cannot leave a camera or mic off mid-lesson.
- A 1:1 call cannot start until **both** verified participants pass a fresh connection check: at least `15 Mbps` download, `10 Mbps` upload and under `250 ms` latency. Results expire after 15 minutes. `Check speed` is a manual control beside Join; Join stays disabled until both people are ready, and the LiveKit token endpoint fails closed with `NETWORK_BELOW_MINIMUM`. Raw measurements are peer-private; events carry only pass/fail and readiness.
- Trainers can award fixed-catalog reward badges during a session. The server owns label and points; the student dashboard renders them as **trophies** with a running point total. Badge notifications carry no trainer identity or notes.

### Teaching whiteboard

- The full-screen board (`shared/fullBoard.js`, `shared/fullBoard.css`, `classroom/index.html`) shows four corner grips on a selected image: each corner resizes from the opposite pinned corner while preserving aspect ratio, and dragging still moves the item. There is no delete icon; Delete/Backspace deletes the selection, Ctrl+A selects all, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo/redo, and Escape clears selection. Ctrl+plus / Ctrl+minus zoom and Ctrl+0 resets on both the shared and desk boards.
- The student's shared board is a clean white surface only — header, camera deck, tool dock, reactions and status are hidden; the trainer closes the share to return the student to the desk. The palette docks upper-left and remains trainer-draggable; board controls dock lower-right.
- The floating dock replaces the single Marker with a Highlighter (wide, translucent ink) and a Laser pen (temporary red glowing trail that fades, not saved or shared as permanent ink). Shapes expand on click to square, rectangle, circle, triangle, diamond, pentagon, hexagon, star and parallelogram; lines expand to straight line, arrow, double arrow, dashed line and dotted line. Keys: P pen, M highlighter, E eraser, V select, H hand, R laser; shape/line menus open on click. The camera deck stays a draggable/resizable two-feed tile, and dashboard controls remain Share, Close, End and Call.

## AI chat and mastery self-practice

- **Mathify Trainer Desk** is a professional internal support bot inside the trainer dashboard. It answers payout (₹300–₹400 per completed 1-on-1 session; exact pay is per the trainer contract/offer letter or as stated during onboarding), the 48-hour notice rule, fines and bonuses from verified policy; severe complaints go to `founder@mathify.app`.
- **Mathify Study Buddy** is the student-dashboard companion. Text and maths images (PNG/JPG/WEBP/GIF, max 1 MB) produce Socratic questions and visual analogies only — never a final answer, worked solution or correct option — and it ignores faces, names and backgrounds in an image.
- `worker-core.mjs` holds the shared prompts, sanitizers and validation with no platform APIs; `worker.js` and `wrangler.toml` deploy it as a Cloudflare Worker. Express bridges `/api/chat/trainer-support` and `/api/chat/student-doubt` to the same AI chain used by every other model call. Secrets stay in Worker/Express environment variables, never in the browser.
- Every model call uses one ordered chain: restricted freelm (approved Google/Gemini, Groq and Cloudflare families only) → direct Gemini → direct Groq → direct Cloudflare Workers AI. Image questions skip the text-only freelm and Groq stages and still use Gemini → Cloudflare. `POST /api/ai/test-ping` is live-only and requires two real provider successes; it never returns keys or raw provider error bodies.
- Audit tables `trainer_support_logs` and `student_doubt_logs` come from `0004_ai_chat_logs.sql`: founder-only RLS via `app_metadata`, no anon/authenticated Data API grants, service-role writes, no image bytes stored.
- Historical Workers AI status: the text model passed a direct Workers AI call (HTTP `200`); the requested 34b vision model returned HTTP `400` `No route for that URI` on this account, and the fallback returned HTTP `403` `Model Agreement`. **Legacy live image chat remained gated until the one-time Meta model agreement was accepted.** This is evidence for the old provider round, not current LiveKit/freelm/Resend validation; see `TEST_REPORT.md` and `E2E_MASTER_INTEGRATION_REPORT.md`.
- Structured feedback enters the same chain: `POST /api/generate-feedback` accepts a practice transcript, sanitizes contact details, and calls the shared `cloudflareAiService` boundary. It returns `{ text, provider, mode }`; in mock/local mode it returns a deterministic reply without creating a provider client or spending a key.
- Production boot requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and the full AI chain (`GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). `FREELM_KEYLESS` and non-chain provider keys are rejected. LiveKit webhook verification reuses `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`; no separate webhook secret exists. Recording additionally needs the `LIVEKIT_EGRESS_*` S3-compatible settings. `RESEND_API_KEY` and `RESEND_FROM` enable transactional email; no SMTP/Nodemailer sender remains.
- Self-practice lives in `server/services/masteryPracticeService.js` behind `/api/student/practice/batch`, `/api/student/practice/batch/:id` and `/api/student/practice/batch/:id/answer`. After a topic's 80th question the student gets an encouraging rest message; other topics remain available.

## Roadmap — approved self-serve operations

- **Founder-controlled trainer access/pay/allotment (approved, roadmap):** the founder will grant trainer access, fix each trainer's pay rate and own the scheduled class allotment. Current money fields are intentionally read-only runtime drafts and trainer slots are trainer-managed.
- **Student self-registration, payment and self-set credentials (approved, roadmap):** students will register, pay, and set their own login ID and password. Current demo identities are server-seeded; Razorpay pack crediting exists but account creation and student-chosen credentials are not built yet.
- **Parent ↔ trainer chat (built):** the approved private thread with unread notifications is now live for the linked demo parent/trainer, with founder-only DLP flags. In-classroom chat, WhatsApp parent support and reminder/contact notifications remain separate channels.

## Demo logins

| Role | Email | Password |
| --- | --- | --- |
| Founder | `founder@mathify.app` | `mathify-demo` |
| Trainer | `trainer@mathify.app` | `mathify-demo` |
| Student | `student@mathify.app` | `mathify-demo` |
| Parent (linked to `usr_student_001`) | `parent@mathify.app` | `mathify-demo` |

## Design rules

- Paper & Ink + coral: `--paper #FDFAF3`, `--ink #0E1420`, `--coral #FF5B2E`.
- Coral buttons use ink text.
- Poppins UI, mono eyebrows/counters, hairlines, small radii.
- Trainer instructions, quiz answer keys and correctness are never sent to students before reveal.
- AI chat receives no name, contact detail, session id, answer key, hint or trainer note; image bytes are decoded in memory only and are never logged or stored.
- Self-practice answer keys stay server-side in service-only `practice_batches` records; trainer-only fields are never serialized to the browser.
- Public pages keep the shared nav and legal footer links: pricing, terms, privacy, refund and contact.

## Separate repositories

- Creative campaign assets live in [`nextgen-kit`](https://github.com/rohit4333/nextgen-kit), not here.
- This repository is the Mathify dashboard/API only.
