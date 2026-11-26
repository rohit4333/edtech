# Mathify Learning OS

This repository contains the Mathify dashboard website and its API layer. Live teaching is strictly **1-on-1**; there are no group classes.

> **Branch note:** the live-readiness work is on `main`; this branch, `feat/student-rtc-control-permission`, adds trainer-controlled student media access, a two-sided connection gate, reward trophies, two Cloudflare Workers AI chat assistants, server-held mastery self-practice and a private parent ↔ trainer chat with DLP founder flags. The commands below assume this codebase state, not the older Phase 1 snapshot.

> **Full project guide:** [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) explains what, why, how, where and when for every part of Mathify.

## Surfaces

| Path | What it is |
| --- | --- |
| `index.html` | Public landing page — 1-on-1 tutoring, tutor profile and demo. |
| `apps.html` | Suite hub linking the live dashboards. |
| `home/index.html` | Redirect to the root public home. |
| `student/index.html` | Student dashboard — Mastery with self-practice, sessions, recordings, reward trophies, wallet and Study Buddy chat. |
| `trainer/index.html` | Trainer console — attendance, timeline, attention queue, live-call panel, Trainer Desk support chat and parent-thread unread badge. |
| `parent/index.html` | Parent desk — private 1-on-1 human thread with the child's trainer, unread count and DLP-safe send feedback. |
| `classroom/index.html` | 1:1 live classroom — planner, whiteboard, quizzer, video and notes. |
| `lms/` | LMS surface (partial) with local planner designer. |
| `founder/` | Founder settings drafts — policy, mastery and trainer policy; money widgets are read-only. |
| `server/` | Express API, mock DB, auth/RBAC, quizzer, Agora, Cloudflare Workers AI and Razorpay seams. |
| `worker-core.mjs`, `worker.js`, `wrangler.toml` | Cloudflare Workers AI chat Worker plus a platform-free shared prompt/validation core. |

## Current state

- 36 Node test suites, including `liveReadiness.test.js`, `livePersistence.test.js`, `liveOperations.test.js`, `rtcControls.test.js`, `engagementControls.test.js`, `parentChat.test.js` and `apiSmoke.test.js`. Tests use plain `node` + `assert` — no Jest, Vitest, Playwright or Cypress; full results are in `TEST_REPORT.md`.
- `.github/workflows/ci.yml`, a `Dockerfile`, `docker-compose.yml`, `render.yaml` and `railway.json`; root `package.json` provides `start`, `dev`, `test`, `migrate`, `seed`, `reminders` and `reminders:once`. The CI schedule runs `reminders:once` every five minutes; the web process keeps its timer disabled.
- `server/db/schema.sql` plus eight ordered reviewed SQL migrations through `0009_recordings_storage.sql`, checked by a dry-run/checksum runner. No runner-based live migration has been applied; the private `recordings` bucket and its hardened session-reader policy were applied separately through the linked Supabase MCP after review.
- Default runtime is the in-memory mock store. `DATABASE_MODE=supabase` selects the completed service-role adapter in `server/db/supabase.js`; production never silently falls back to demo identities.
- AI is Cloudflare Workers AI only (no DeepSeek/OpenAI). Curriculum drafts pass a trainer-only/personal-data moderation gate before review; the two dashboard chats run through a Cloudflare Worker using a shared prompt core. No browser code receives Cloudflare or Supabase secrets. Agora RTC/RTM tokens are real and server-signed; the contact booking API stores validated requests and notifies configured channels.
- Trainer Desk answers payout (₹300–₹400 per 1-on-1 session), the 48-hour notice rule, fines and bonuses, and routes severe complaints to `founder@mathify.app`. Study Buddy gives Socratic hints and visual analogies only, never a final answer; it accepts PNG/JPG/WEBP/GIF images up to 1 MB.
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

The shared session event stream uses a bounded in-memory cursor log in mock mode and the `mathify_session_events` outbox in live mode; both feed the same server-scrubbed `/events` polling endpoint. The safe channel is opened when a session loads, not only during a quiz, so media-control and connection changes reach both people at any time. Supabase Realtime canvas strokes are optional and carry no answer key. Agora RTC tokens are real and server-signed; the classroom's floating call panel joins only with server-derived channel/uid/token. Face, voice, names, role and whiteboard/Wacom activity are the only shared signals; answer keys, explanations and trainer notes never reach students.

### Classroom media and connection rules

- Students start with microphone and camera controls. The trainer's **Access** button grants or revokes that ability; a student is rejected by the server with `403` if they try to change the flag themselves.
- Revoking always forces the student's local tracks on **before** the buttons are locked. If a browser cannot actually enable a track (permission denied, stopped track, offline tab), the classroom says so instead of claiming audio/video are on. The server state remains authoritative and is re-read on the next load or event.
- Quiz and whiteboard transitions, tab focus and a light in-call keep-alive reaffirm the chosen media state on every device type — laptop/PC, Android/iPad tablet and Android/iOS phone. A silent mobile suspension cannot leave a camera or mic off mid-lesson.
- A 1:1 call cannot start until **both** verified participants pass a fresh connection check: at least `15 Mbps` download, `10 Mbps` upload and under `250 ms` latency. Results expire after 15 minutes. `Check speed` is a manual control beside Join; Join stays disabled until both people are ready, and the RTC token endpoint fails closed with `NETWORK_BELOW_MINIMUM`. Raw measurements are peer-private; events carry only pass/fail and readiness.
- Trainers can award fixed-catalog reward badges during a session. The server owns label and points; the student dashboard renders them as **trophies** with a running point total. Badge notifications carry no trainer identity or notes.

## AI chat and mastery self-practice

- **Mathify Trainer Desk** is a professional internal support bot inside the trainer dashboard. It answers payout (₹300–₹400 per 1-on-1 session), the 48-hour notice rule, fines and bonuses from verified policy; severe complaints go to `founder@mathify.app`.
- **Mathify Study Buddy** is the student-dashboard companion. Text and maths images (PNG/JPG/WEBP/GIF, max 1 MB) produce Socratic questions and visual analogies only — never a final answer, worked solution or correct option — and it ignores faces, names and backgrounds in an image.
- `worker-core.mjs` holds the shared prompts, sanitizers and validation with no platform APIs; `worker.js` and `wrangler.toml` deploy it as a Cloudflare Worker. Express bridges `/api/chat/trainer-support` and `/api/chat/student-doubt`. `CHAT_WORKER_URL` is optional: when unset, the same core runs locally through the Cloudflare REST endpoint. Secrets stay in Worker/Express environment variables, never in the browser.
- Text model: `@cf/meta/llama-3.1-8b-instruct`. Vision: `@cf/llava-hf/llava-v1.6b-34b` with fallback `@cf/meta/llama-3.2-11b-vision-instruct` — Cloudflare's public catalogue documents the Llava 1.5 and Llama 3.2 vision entries, so the requested 34b model is pinned and the documented fallback keeps vision working if it is unavailable.
- Audit tables `trainer_support_logs` and `student_doubt_logs` come from `0004_ai_chat_logs.sql`: founder-only RLS via `app_metadata`, no anon/authenticated Data API grants, service-role writes, no image bytes stored.
- Live status: the text model passed a direct Workers AI call (HTTP `200`); the requested 34b vision model returned HTTP `400` `No route for that URI` on this account, and the fallback returned HTTP `403` `Model Agreement`. **Live image chat is gated until the user explicitly accepts the one-time Meta model agreement.** No end-to-end browser live-chat run, Supabase call, payment, SMS or live migration is claimed; see `TEST_REPORT.md`.
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
