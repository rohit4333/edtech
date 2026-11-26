# Mathify — Project Guide

**What this is:** the single reference for what Mathify is, why it is built the way it is, where every piece lives, when each flow runs, and how to run/verify/ship it.

**Status:** `feat/student-rtc-control-perfection` (27 November 2026). Local/mock mode by default; 46 deterministic suites pass. Live 1:1 video uses LiveKit with server-owned Egress recording; transactional email uses Resend; every server-side model call uses one chain: freelm → Gemini → Groq → Cloudflare Workers AI. The chat Worker source follows that chain and builds cleanly; live deploy is gated by the current Cloudflare token's permissions. The older Agora/Workers-AI-only live checks referenced below remain historical evidence in `TEST_REPORT.md` and `E2E_MASTER_INTEGRATION_REPORT.md`; they are not claims about the current provider stack. The private parent ↔ trainer chat is built with regex DLP and founder-only flags in the existing service-only record store. Production boot requires LiveKit and the full AI chain, not Agora or keyless freelm.

**Companion documents:** [`README.md`](README.md) (quick start), [`server/README.md`](server/README.md) (API reference), [`LIVE_QA_REPORT.md`](LIVE_QA_REPORT.md) (current redacted live evidence), [`TEST_REPORT.md`](TEST_REPORT.md) (historical verification evidence), [`server/migrations/README.md`](server/migrations/README.md) (SQL review procedure).

---

## 0. Facts at a glance

| Question | Answer |
| --- | --- |
| Product | Private **1-on-1** live maths tutoring. No group classes. |
| Stack | Vanilla HTML/CSS/JS surfaces + Node/Express API. No framework or build step. |
| AI | Every server-side model call uses one chain: restricted **freelm** (approved Google/Gemini, Groq and Cloudflare families only) → direct Gemini → direct Groq → direct Cloudflare Workers AI. Image questions skip the text-only freelm/Groq stages and use Gemini → Cloudflare. The chat Worker source uses the same chain. DeepSeek/OpenAI mentions remain historical and unused. |
| Video | **LiveKit** rooms with server-signed JWTs. One room, one trainer publisher + one student publisher; founder observers are subscribe-only. Legacy Agora routes are retained for compatibility/tests only. |
| Database | In-memory mock by default; completed Supabase service-role adapter for `DATABASE_MODE=supabase`. |
| Realtime | DB-backed session event outbox + scrubbed cursor polling; Supabase Realtime for canvas strokes. |
| Payments | Razorpay, 12 sessions / 540 SAR; credit only on verified `payment.captured`. |
| Tests | 46 Node suites, plain `node` + `assert`. CI, Dockerfile and deploy manifests present. `npm install livekit-server-sdk freelm resend` adds the three new dependencies; `npm audit --omit=dev --prefix server` reports 0 vulnerabilities. |
| Migrations | 4 reviewed SQL files (including chat audit logs), dry-run by default; apply needs explicit confirmation. |
| Live readiness | Live HTTP and Supabase evidence passes 68/68 checks. Credential-gated gaps remain: Egress storage, Resend sender, Razorpay/Twilio keys, and Workers deploy permission. See `LIVE_QA_REPORT.md`. |

---

## 1. WHAT — the product and its surfaces

### 1.1 The promise

A trainer and one student meet in a private live classroom. They share **name, face, voice and whiteboard/Wacom activity — nothing else**. No mobile number, no social link, no profile cross-exposure. Trainer instructions, quiz answer keys, hints, explanations and correctness stay server-side until the trainer deliberately reveals them.

> **Verbatim founder privacy note — source of truth, original typos retained:**
>
> `check whether no personal details of trainer or kid visible to each other apart from name only.... as data,,.. no mobile number, no sical media link, nothing, just face / voice/ name/ trainer/wacom activity.. that's it..`

The same promise governs the new parent ↔ trainer chat: it is a private human thread for one linked child, never AI, never a group, and it carries no answer keys or trainer notes. Regex DLP stops contact/social details at send time and records a masked, founder-only flag instead of delivering the message.

### 1.2 Surfaces

| Path | Purpose |
| --- | --- |
| `index.html` | Public landing page: 1-on-1 positioning, tutor profile, demo booking. |
| `pricing.html`, `terms.html`, `privacy.html`, `refund.html`, `contact.html` | Legal and sales pages. Every footer carries all five links. |
| `apps.html`, `home/index.html` | Suite hub and redirect to public home. |
| `student/index.html` | Student desk: mastery with self-practice, sessions, recordings with chapters, **reward trophies**, wallet, Study Buddy chat. |
| `trainer/index.html` | Trainer console: attendance, timeline, attention queue, payouts, live-call panel, Trainer Desk chat. |
| `classroom/index.html` | The 1:1 room: planner, whiteboard/ink, quizzer, PiP video call, chat, notes, tools, rewards. |
| `lms/index.html` | Partial course library surface. |
| `server/` | Express API, auth, services, data adapters, migrations, tests. |

### 1.3 Public navigation contract

Exactly: **Home · Pricing · Terms · Privacy · Refund · Contact · Book Demo**. Mobile-first responsive; enforced by `navContract.test.js` (44 assertions).

### 1.4 Design system

`--paper #FDFAF3`, `--ink #0E1420`, `--coral #FF5B2E`; Poppins UI; monospace eyebrows/counters; hairline borders; small radii. No gradients or shadow-heavy cards. Coral buttons use ink text.

### 1.5 Capabilities that are live in code

- JWT auth with strict founder/trainer/student roles; production fails closed on weak config.
- Session state, planner/page updates, attendance, presence heartbeat, chat, board sharing.
- Quizzer state machine with AI drafts, trainer approval, server-held answer keys and reveal gating.
- Server-signed LiveKit tokens with server-owned room/identity and subscribe-only founder observers; legacy Agora webhook/recording routes remain for compatibility.
- Razorpay order creation, signature-verified webhook, idempotent pack crediting.
- freelm-first fallback chain with OpenAI-style `system`/`user` messages and PII sanitization; direct Gemini, Groq and Cloudflare stages keep the app alive when an upstream is unavailable.
- Trainer Desk support chat and Study Buddy doubt chat use one shared, platform-free core with the same chain; Resend `sendSessionEmail()` handles classroom invitations.
- Mastery self-practice with server-held answer keys and a per-topic question cap.
- Trainer-owned student media permission with force-on-before-lock.
- Two-sided connection precondition before any class can start.
- Fixed-catalog reward badges rendered as student trophies.
- Student Control: one trainer-only surface for media Access, explicit mute/camera-off, emoji/applause pauses, board sharing, rewards, quiz, progress and end.
- Server-owned brand-safe celebrations and role-scoped reactions with separate visual layers, sound opt-in and reduced-motion fallback.
- Private parent ↔ trainer human chat for a linked child, with per-recipient unread counts, mark-read, regex DLP and founder-only flags.
- 44 automated suites, CI, Docker, Render/Railway manifests, five-minute reminder and Needs Attention cron, private recordings Storage, structured logging, rate limiting.

---

## 2. WHY — the reasoning behind the design

| Decision | Why |
| --- | --- |
| Strictly 1-on-1 | The teaching model is private attention; group features would break the privacy and quality promise. “Max 3 kids” exists only as future chapter-plan language, never as a live group feature. |
| Name-only cross-role identity | The founder brief explicitly forbids phone numbers, social links and personal details between trainer and student. |
| Correctness only after reveal | A student must not receive an answer key, hint, explanation or trainer note through realtime. The quizzer enforces this in serializers and event scrubbing. |
| Trainer-owned media permission | Kids start with camera/mic controls, but the trainer must be able to keep the lesson face-to-face. Revoking forces tracks on **before** locking the buttons. |
| Honest media status | A browser cannot flip another device's hardware. Claiming “camera on” when a track is denied, stopped or the tab is offline would be a lie; the UI reports the real state. |
| Two-sided bandwidth gate | A 1:1 video lesson fails for both people if either connection is poor. Both must pass a fresh check before a token is issued. |
| Badges as trophies | Positive reinforcement owned by the trainer, with server-owned point values so the reward cannot be forged by the client. |
| One Student Control surface | Trainers should never hunt through panels mid-lesson; every permission and quick action is in one role-gated place. |
| Server-owned celebrations | Clients may only request a configured trigger and offer an allowlisted preference. Labels, motion, sound and spotlight come from server config and are scrubbed before the safe event channel. |
| Reactions are not celebrations | Emoji are small, immediate signals; celebrations are bounded recognition moments. Separate layers prevent visual and audio overlap. |
| Review-first migrations | A live Supabase schema change is destructive; it never runs without human review and two explicit confirmations. |
| Mock-first runtime | Local development needs zero credentials and deterministic data. Production must fail closed rather than silently fall back to demo identities. |
| One AI chain everywhere | All server-side and Worker model calls start at restricted freelm with sanitized input, then fall back to direct Gemini → Groq → Cloudflare. Mock mode uses a deterministic provider registry and makes no live call. DeepSeek/OpenAI mentions in the newer brief remain legacy. |
| LiveKit for the 1:1 room | Agora is replaced for live joins. Room name and participant identity are re-derived from the verified session on every token request; a browser-supplied `roomName` may only confirm it, never choose it. Observer grants are subscribe-only. |
| Two scoped chat bots | Trainer support is an internal policy desk with a professional tone; student help must coach with hints and analogies, never replace the trainer's reveal with a final answer. |
| Shared Worker core | The same sanitizers, model prompts and reply guards run in the Worker source and in local development; Express only bridges identity and owns no prompt text. The current Worker bundle builds cleanly but live deploy needs a token with Workers Scripts edit permission. |
| Server-held practice keys | Practice is self-paced, but an answer key or trainer-only field in the browser would break the reveal boundary and the 1-on-1 privacy promise. |
| Per-topic practice cap | Eight batches (80 questions) are enough for one topic; an encouraging rest message closes it without blocking practice in other topics. |
| Parent chat DLP | A parent/trainer thread must stay human and 1-on-1; contact and social patterns are blocked before storage or realtime, with only a masked founder flag retained for audit. |
| Existing record store for chat | Parent chat threads, unread state and DLP flags ride in service-only `mathify_records`, so no new SQL migration or browser Data API grant is needed. |

---

## 3. WHERE — repository map

| Area | Files | Role |
| --- | --- | --- |
| Public HTML | `*.html`, `public.css`, `assets/` | Marketing, legal, nav/footer contract. |
| AI chat Worker | `worker-core.mjs`, `worker.js`, `wrangler.toml` | Shared prompts/sanitizers, Worker routes and deploy config; no browser secrets. |
| Student desk | `student/index.html`, `student/app.js`, `student/api.js` | Dashboard rendering, trophy list, recording chapters. |
| Parent chat | `parent/` | Private parent ↔ trainer thread with unread notifications and DLP-safe send feedback. |
| Trainer console | `trainer/` | Attendance, timeline, payouts, session actions, parent chat unread badge. |
| Classroom | `classroom/index.html`, `app.js`, `session.js`, `livekit.js`, `agora.js`, `livekit-demo.html`, `api.js`, `networkCheck.js`, `engagement.js`, `engagement.css`, `realtime.js`, `room.css`, `panels.css` | Live room, quiz/board state, call controls, connection preflight, Student Control, celebrations/reactions, safe event bridge. `livekit.js` is the current call adapter; `agora.js` is legacy. |
| LMS | `lms/` | Partial course library with local planner designer and schema/privacy validation. |
| Founder workspace | `founder/index.html`, `founder/app.js`, `founder/founder.css` | Runtime policy/mastery/trainer-policy drafts; money widgets are read-only. |
| App entry | `server/index.js`, `server/app.js`, `server/config.js` | Boot, production guard, routes, reviewed static allowlist. |
| Auth | `server/auth/`, `server/middleware/auth.js` | Passwords, JWT, `sessionUser`/`publicUser` key allowlists, RBAC, session access. |
| Routes | `server/routes/` | Auth, trainer, student, sessions, policy, webhooks, admin (founder settings), LiveKit tokens, feedback, Razorpay, legacy Agora, leaves, contact, network, chat bridge, student practice, parent ↔ trainer chat. |
| Services | `server/services/` | LiveKit tokens, freelm feedback, Resend email, payouts, attendance, leave, presence, moderation, notification, logger, media permissions, network quality, badges, celebrations, reactions, reaction permissions, founder settings, chat Worker bridge, mastery self-practice, parent chat/DLP; legacy Agora tokens and Cloudflare client remain for compatibility. |
| Data | `server/db/index.js`, `mock.js`, `supabase.js`, `schema.sql` | Facade, demo store, service-role adapter, canonical schema. |
| Migrations | `server/migrations/0001…0004`, `server/migrate.js` | Ordered SQL (including chat audit logs), checksum guards, dry-run runner. |
| Tests | `server/tests/*.test.js` | 46 suites; see `LIVE_QA_REPORT.md` and current `DATABASE_MODE=mock npm test` results. |
| Config | `server/config/policy.json`, `server/.env.example` | Business thresholds and env variable names (no secrets). |
| DevOps | `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`, `render.yaml`, `railway.json` | CI, containers, deployment manifests. |

### Where live state is stored

- `sessions.mediaPermissions` — `{ studentCanToggleMedia, forceMicOn, forceCameraOn, version, updatedAt }`.
- `sessions.networkChecks` — per-role `{ ok, downloadMbps, uploadMbps, latencyMs, failures, checkedAt }`.
- `users.badges` / `users.trophyPoints` — safe trophy records and total points.
- `practice_batches` — service-only self-practice records holding all answer keys and attempts; only prompts, options and a private answer boolean are serialized.
- `trainer_support_logs` / `student_doubt_logs` — founder-auditable chat metadata from `0004_ai_chat_logs.sql`; no image bytes.
- Parent chat messages, per-recipient unread cursors and DLP flags — service-only `mathify_records` records; blocked message text is never stored, only a masked preview with actor id/role, reason code and timestamp. No new SQL migration and no browser Data API grant.
- In live mode media, network, badge, practice and parent-chat state ride in the service-only `mathify_records` JSONB store; chat audit rows use their own reviewable SQL tables.

---

## 4. WHEN — lifecycles and timing

### 4.1 Session lifecycle

```text
booked → scheduled → live → ended → recap / recording chapters → dashboard
```

- Booking posts to `/api/contact`; no payment is taken from the static form.
- A pack purchase credits 12 sessions only after Razorpay confirms capture.
- `/sessions/:id/end` is trainer-only and produces the parent recap and recording link.

### 4.2 Quizzer state machine

```text
AI draft → trainer approval → answering → awaiting_reveal → revealed
                                    ↓              ↓
                                 reteach → recheck → answering → complete
```

- `POST /quiz/answers` returns only `{ attemptId, saved, phase }`.
- `quiz.answer.saved` carries no correctness; `quiz.answer.revealed` is the only gate that releases it.
- Low readiness never auto-promotes; the trainer triggers reteach, then a new check.
- Mastery unlock threshold is 80, with policy flags `keepSameTopicBelowThreshold` and `reteachBeforeNewCheck`.

### 4.3 Media permission sequence

1. Student opens a session: `studentCanToggleMedia: true`, both force flags false.
2. Trainer clicks **Access** → `POST /media-permission` with `studentCanToggleMedia: false`.
3. Server increments `version`, sets both force flags true, publishes `rtc.media.control.changed`.
4. Student tab receives the event (or reads `/state` on next load): **force tracks on first**, then disable the mic/camera buttons.
5. Trainer clicks **Access** again → flags clear, buttons unlock.

Reaffirmation happens on quiz launch/exit/reveal, on `visibilitychange`, and every 5 seconds while joined.

### 4.4 Connection check

- Triggered manually by **Check speed**; never automatically, never on page load.
- Download, upload and latency are timed in the browser against `/api/network/probe`.
- `POST /network-check` records the result against the JWT role — a student cannot submit for the trainer.
- Pass requires **≥15 Mbps down, ≥10 Mbps up and <250 ms latency**; a pass expires after **15 minutes**.
- Join stays disabled and `POST /rtc-token` returns `NETWORK_BELOW_MINIMUM` until both participants are fresh-passing.

### 4.5 Rewards

Trainer selects a badge from the fixed catalog during a session → server writes the trophy to the student record → `badge.awarded` event → student dashboard shows it with a running point total.

### 4.6 Reminders and money

- Reminder job checks every 5 minutes by default and sends once per `24h` and `1h` bucket, only when notification channels are configured.
- Leave: 48-hour notice; auto-approved with ≥2 days; trainer gets 8 leaves/month; student-initiated leaves do not consume trainer credit or penalise the pack.
- Packs: 38-day expiry, non-refundable; no-show marks a session used; pay requires presence.

### 4.7 AI chat

```text
signed-in dashboard → Express /api/chat/{trainer-support,student-doubt}
  → deployed Worker (CHAT_WORKER_URL) OR local worker-core + shared chain
  → sanitized prompt / decoded image → freelm → Gemini → Groq → Cloudflare
  → reply guard → JSON reply
  → founder-auditable metadata row (service role, no image bytes)
```

- Trainer Desk is limited to trainer/founder and answers payout (₹300–₹400 per completed 1-on-1 session; exact pay is per the trainer contract/offer letter or as stated during onboarding), 48-hour notice, fines and bonuses; severe complaints go to `founder@mathify.app`.
- Study Buddy is limited to student/founder and accepts text plus one PNG/JPG/WEBP/GIF image up to 1 MB; it offers Socratic hints and visual analogies, never a final answer.
- Images exist only in memory while the model call runs. No name, contact detail, session id, answer key, hint or trainer note enters a prompt.

### 4.8 Mastery self-practice

```text
POST /practice/batch → 10 questions (15% harder than last batch)
  → GET /practice/batch/:id → POST /practice/batch/:id/answer → private boolean
  → repeat on demand until 80 questions in that topic → encouraging rest message
```

- Difficulty rises 15% per batch (inside the requested 10–20% range); each new batch is another 10 questions.
- The cap is 80 questions per topic (8 batches) with no cross-topic cap.
- Answer keys remain in the service-only `practice_batches` record; the browser gets prompts, options and a private boolean only.

### 4.9 Parent ↔ trainer chat

```text
parent or assigned trainer sends human text → DLP regex gate
  → allowed: message record + recipient unread increment → role-scoped inbox → mark-read
  → blocked: 422 CONTENT_BLOCKED + founder-only masked flag; no delivery, echo, store or event
```

- The demo parent is linked only to `usr_student_001`; a trainer sees only assigned students; the founder can audit all threads and flags.
- One thread is strictly one parent, one trainer and one child — no group classes, batch pause, answer keys or trainer notes in messages.
- Unread counts are per recipient and clear only through the recipient's own mark-read call.
- Founder flags carry actor id/role, reason code, masked preview and timestamp; parent/trainer tokens cannot read them.

### 4.10 Migration flow

```text
edit SQL → npm run migrate (dry run, checksums printed) → human review →
DATABASE_URL + MATHIFY_MIGRATE_CONFIRM=apply → apply
```

---

## 5. HOW — architecture

### 5.1 Request flow

```text
Browser surface
  → classroom/api.js (token from localStorage or demo login)
  → /api/... (auth.requireAuth → role + session access)
  → server route → service / db facade
  → mock store OR Supabase service-role adapter
  → serializer (role-aware) → JSON
  → realtime.publish → /events (scrubbed) → browser bridge
```

### 5.2 Auth and RBAC

- Passwords are salted per user; legacy hashes are flagged for upgrade.
- JWT identifies the user; every request re-reads the user from the DB, so a disabled account is rejected immediately.
- `publicUser()` exposes only `id`, `name`, `role`; `sessionUser()` adds server-side business fields.
- Supabase RLS reads `auth.jwt()->'app_metadata'->>'role'` — **never `user_metadata`**. Every application table has RLS; safe views use `SECURITY INVOKER`.
- Production guard requires `AUTH_SECRET ≥ 32`, explicit `CORS_ORIGIN`, `DATABASE_MODE=supabase`, Supabase credentials, `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`, and the full AI chain (`GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). `FREELM_KEYLESS` and non-chain provider keys are rejected. Resend, Razorpay, Twilio and Egress storage remain separately gated integrations. Agora values are no longer required. No wildcard CORS, no demo fallback.

### 5.3 Data layer

- `server/db/index.js` is the only facade routes call. It delegates to the Supabase adapter in live mode and the in-memory store otherwise; live mode never silently falls back to demo data.
- Real-time analytics and app-shaped records use `public.mathify_records` (service-only JSONB); the event log uses `public.mathify_session_events` with participant-scoped reads.
- Migrations carry transaction wrappers and checksum drift guards; the runner defaults to dry-run.

### 5.4 Realtime

- `realtime.publish()` writes to an allowlisted, scrubbed event log.
- `safePayload()` removes keys matching answer/correct/hint/why/explain/trainer/instruction/misconception/key.
- `classroom/realtime.js` polls `/events?since=<seq>` every 1200 ms with an exclusive cursor. The channel opens on session load, so control and connection events work even with no quiz running.
- Supabase Realtime is used for canvas strokes (`quiz_canvas_strokes`) with only the publishable key in the browser; no secret key, no answer key on that channel.

### 5.5 Live call

- LiveKit JWTs are signed server-side from the verified session; browser-provided `roomName`/`participantName` may only confirm or label the join, never choose the room or identity.
- Both real participants publish (`canPublish: true`); a founder observer gets a subscribe-only grant. A revoked student keeps publish capability while the client-side media controls are locked, because tracks must be forced on before the buttons are disabled.
- `classroom/livekit.js` and `trainer/livekit.js` keep local track state, publish with `enableCameraAndMicrophone()`, attach subscribed tracks to the existing video containers, and detach/remove them on `TrackUnsubscribed` and `Disconnected`.
- `NETWORK_BELOW_MINIMUM` maps to a friendly in-app message.
- AI tutor dispatch is optional and trainer-initiated only; it is deduplicated through `listDispatch`, never runs in mock mode or for observers, and carries no PII or answer keys. Recording uses server-owned LiveKit Egress: the trainer starts/stops by session id, the room and object key are derived server-side, and missing storage fails closed with `RECORDING_NOT_CONFIGURED`.
- Works on laptop/PC, Android/iPad tablet and Android/iOS phone; a mobile tab suspension is corrected by reaffirmation, not treated as an intentional mute.

### 5.6 AI

- The restricted freelm stage calls `FreeLLM.fromEnv()` with an allowlisted provider registry (Google/Gemini, Groq and Cloudflare families only), `model: FREELM_MODEL` (default `chat:fast`), an OpenAI-style `system`/`user` array and a seconds-based timeout. `FREELM_KEYLESS` is rejected in production. Mock mode returns before any live provider call.
- Every chain call then tries direct Gemini → direct Groq → direct Cloudflare Workers AI. Image questions skip the text-only freelm and Groq stages and proceed Gemini → Cloudflare.
- Prompts end with exactly: `CRITICAL: Return ONLY valid JSON. No markdown, no explanations.`
- Drafts pass a moderation gate that rejects personal details, social links and trainer-only fields before trainer approval. Missing credentials fail closed in production; local mock mode is deterministic.
- `worker-core.mjs` is pure logic (no fetch or platform globals); `worker.js` verifies the Express-issued HMAC token, applies CORS/rate limits and calls the same chain with the `[ai]` binding or Cloudflare REST as the last stage. `CHAT_WORKER_URL` makes Express call the deployed Worker; without it the same core runs locally through the shared chain. No secret is sent to the browser.
- Chat text uses `@cf/meta/llama-3.1-8b-instruct` as the pinned Cloudflare fallback. Vision uses `@cf/llava-hf/llava-v1.6b-34b` with fallback `@cf/meta/llama-3.2-11b-vision-instruct`; model slugs stay literal in REST paths and JSON parsing extracts the first balanced object from chatty output.
- Live chain evidence: `/api/ai/test-ping` required two live successes and got Gemini `PONG`, Groq `PONG`, Cloudflare `EMPTY_RESPONSE`; trainer and student chat both returned guarded AI replies, and the unsafe student prompt returned the exact safety line. See `LIVE_QA_REPORT.md`. The Worker bundle builds cleanly; live deploy is gated by Cloudflare token permissions.
- Reply guards strip contact data and block final-answer phrasing for students; unanswered or unsafe replies fall back to a safe message. Audit rows go only to the founder-only `trainer_support_logs` / `student_doubt_logs` tables.

### 5.7 Payments

- Monthly pack: 12 sessions for 540 SAR (54000 halalas).
- Orders are created server-side; the webhook verifies signature and credits only a real `payment.captured` for a server-created order. Replays and forged payment notes are ignored.

### 5.8 Badges

- Catalog in `policy.json`: Focus Star (10), Sharp Thinking (20), Steady Progress (15), Kind Partner (10), Concept Master (25).
- Trainer posts only a `badgeId`; label, points and icon come from policy. Student award attempts get `403`; unknown ids get `400`.
- Student serializer exposes `badges` and `trophyPoints`; no trainer identity or notes.

### 5.9 Mastery self-practice

- `server/services/masteryPracticeService.js` builds 10-question batches from the fallback generator, ramps difficulty 15% per batch and enforces the 80-question per-topic cap across service-only `practice_batches` records.
- `safeBatch()` allows only id, topic, position, prompt, options, difficulty and progress counters into the browser. `answer()` returns only the question id, a private correctness boolean, counts and any rest message.
- Batch ids are checked against the signed-in student; another student's batch returns `403`. No trainer-only field or explanation is serialized.

### 5.10 Parent chat and DLP

- The parent chat service resolves the thread from the signed-in role and the linked/assigned student; a body-supplied student id cannot widen access. Founder audit is role-scoped at the API, and the underlying records stay service-only.
- The DLP gate rejects email, URL/`www`, phone/`+country`/10-digit sequences, `@handle`s and social platform names before any message is stored or published. Blocked text is replaced in the founder flag by a masked preview; the sender receives `422 CONTENT_BLOCKED` with no echo of the rejected text.
- Realtime publication happens only for allowed messages; blocked attempts produce no session/chat event.

### 5.11 Testing and delivery

- 46 suites cover services, serializers, privacy, nav/static surfaces, API smoke, LiveKit/freelm readiness, persistence, operations, media/network controls, engagement controls, founder settings, planner designer and parent chat contracts.
- Plain `node` + `assert` is intentional: no Jest/Vitest dependency, deterministic local runs.
- CI runs on `.github/workflows/ci.yml`; `Dockerfile`, `docker-compose.yml`, `render.yaml` and `railway.json` cover container/deploy shapes.

---

## 6. WHO — permission matrix

| Action | Founder | Trainer | Student | Parent |
| --- | --- | --- | --- | --- |
| View trainer notes / answer key before reveal | Yes | Yes | **No** | No |
| Award badges | Yes | Yes | **No** | No |
| Change student media permission | Yes | Yes | **No (403)** | No |
| Report own connection check | Yes | Yes | Yes | No |
| Submit a check for another role | No | No | **No** | No |
| Get an RTC token | Yes | Yes | Yes, only after both pass | No |
| Start/end session | Yes | Yes | No | No |
| Edit planner / draw on board | Yes | Yes | Yes (draw) | No |
| Read realtime log | Yes | Yes | **No** | No |
| Use Trainer Desk support chat | Yes | Yes | No | No |
| Use Study Buddy doubt chat | Yes | No | Yes | No |
| Read chat audit logs | Yes | No | No | No |
| Read parent-chat DLP flags | Yes | **No** | **No** | **No** |
| Use own parent ↔ trainer thread | Audit all | Assigned students only | No | Own child only |
| Get a self-practice answer key from the API | No | No | **No** | No |
| See peer's raw speed numbers | Own only | Own only | Own only | No |

---

## 7. RUNBOOK

### Local

```powershell
npm install --prefix server
npm start
# open http://localhost:4000
```

Demo logins (password `mathify-demo`): `founder@mathify.app`, `trainer@mathify.app`, `student@mathify.app`, `parent@mathify.app` (linked to `usr_student_001`).

### Verify

```powershell
$env:DATABASE_MODE = 'mock'
npm test                 # 46 suites
npm run migrate          # dry run, prints checksums
```

Useful classroom URLs:

```text
/classroom/index.html?sessionId=ses_math_001
/classroom/index.html?sessionId=ses_math_001&view=student
```

Browser smoke should show: mic/camera on by default, Join disabled until **Check speed** passes for both people, trainer **Access** button present only on the trainer view, student trophies on the student desk, Trainer Desk / Study Buddy panels in the respective dashboards, self-practice batches of 10 with no answer key in the response, the parent/trainer chat unread badge clearing on read, `422 CONTENT_BLOCKED` with no echoed text for contact/social attempts, and zero console errors.

Historical live status (evidence round, not the current provider stack): one Workers AI text call passed and local Agora token generation passed with fresh two-sided checks. Those ledgers are preserved in `TEST_REPORT.md` and `E2E_MASTER_INTEGRATION_REPORT.md`. Current validation is 46/46 deterministic suites plus real HTTP and service-role SQL checks: signed LiveKit tokens, two-sided network gates, the freelm → Gemini → Groq → Cloudflare chain, guarded chat, role isolation, policy/practice contracts and fail-closed Egress/payment/email paths. See `LIVE_QA_REPORT.md`; Razorpay, Twilio, Resend, Egress storage and Worker deploy permission remain explicitly gated.

v4.0.0 status [U~2026-11-26]: the 10-role audit found and fixed A-01…A-09 (A-09 was already fixed in v3.1.0 and is only recorded here); B-01…B-06 remain `BLOCKED_EXTERNAL` and G-01…G-03 remain unchanged gaps. Historical final validation was 36/36 suites, a 136-file syntax sweep with zero failures, a seven-file migration dry run and a clean diff check apart from CRLF warnings. No live provider, migration apply, commit or push was performed in that pass. See `E2E_TEST_LOG.md`, `TPFF_BLOCKERS.md` and `TEST_REPORT.md` §v4.0.0 final validation addendum.

v4.0.1 status [U+2026-11-26]: branch `feat/student-rtc-control-perfection` adds founder/RM people administration, manager audit, public registration, password change/reset, the founder-managed RM lock, the teaching board and a scoped RM credential recovery (generated trainer-only temporary password after KYC plus grant). Local validation is 42/42 suites, a 50-file syntax sweep with zero failures, a 44-check HTTP contract run and a clean diff check apart from CRLF warnings. No browser click-through, live provider, migration apply or live Supabase mutation is claimed. [ev: `npm.cmd test --prefix server`; `node.exe live-check.js`, 2026-11-26]

### Production checklist

1. Rotate every credential ever pasted or exposed: the LiveKit API key/secret, `SUPABASE_SECRET_KEY`, and the historical Cloudflare/Agora values. Production needs LiveKit, the full AI chain (freelm restricted providers plus Gemini/Groq/Cloudflare), Supabase, Resend, and — when those features are enabled — Egress storage, Razorpay and Twilio.
2. Fill `server/.env` from `server/.env.example`; never commit secrets.
3. Review all seven SQL files (`0001_baseline.sql`, `0002_student_curriculum.sql`, `0003_live_persistence.sql`, `0004_ai_chat_logs.sql`, `0006_trainer_onboarding_batches.sql`, `0007_student_hint_lockdown.sql`, `0008_payment_idempotency.sql`), then apply only with founder approval, `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply`. No live apply occurred in the v3.1.0 evidence pass.
4. Set `NODE_ENV=production`, `DATABASE_MODE=supabase`, explicit `CORS_ORIGIN`, `AUTH_SECRET ≥ 32`, `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `FREELM_KEYLESS` and non-chain provider keys are rejected. Optional Egress storage and Resend values are documented in `server/.env.example`.
5. Deploy `worker.js` with `wrangler secret put` for `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, the AI-chain keys and optional `FREELM_MODEL`; then set `CHAT_WORKER_URL` on Express. The current Cloudflare token can build the bundle but lacks Workers Scripts deploy permission, so this step remains open until that token is replaced.
6. Confirm both participants can pass the connection gate and that Join opens only then.

---

## 8. Known gaps and deliberate non-actions

| Item | Status |
| --- | --- |
| Live migration | Not applied; requires explicit approval. |
| Credential rotation | Still required before launch, now including the LiveKit credential. Production needs LiveKit + the full AI chain + Supabase + Resend; Razorpay, Twilio and Egress storage are gated when their features are enabled. Historical Workers AI text evidence remains documentary. |
| PDF pages 5–17 | Not OCR'd; verbatim policy numbers (e.g. “Score 60”, “8% unlock”) cannot be confirmed yet. Current policy values are the documented source of truth. |
| Alerting (Sentry/Pino sinks) | Structured logging exists; external alerting is future work. |
| Distributed rate limiting | In-process limiter is fine for one instance; shared store needed for multi-replica. |
| Founder-editable settings screens | Live as reviewed runtime drafts. Money fields are read-only; file-backed deployment policy still needs explicit approval. |
| Planner designer v1 | Live as local authoring/export. Publish and pack import remain disabled. |
| LiveKit Join in browser smoke | Not clicked: it would request real camera/mic. Token, room-ownership, observer-grant and gate contracts are covered by tests. |
| LiveKit live verification | Mock-mode token and endpoint smoke checks pass; real token signing, WebSocket join and optional agent dispatch need real credentials in gitignored `server/.env`. |
| freelm live verification | Mock-mode feedback is deterministic; a real `FreeLLM` chat call needs a provider key and is not claimed here. |
| Cloudflare Workers AI chat (legacy) | Historical text call PASS (HTTP `200`); requested vision unavailable (`400 No route`), fallback blocked (`403 Model Agreement`). No full browser live-chat success claimed; see `TEST_REPORT.md`. |
| Chat audit tables | `0004_ai_chat_logs.sql` reviewed but not applied; founder-only `app_metadata` RLS, no anon/authenticated grants. No live Supabase write. |
| Mastery self-practice | Service-only answer keys and local batch contracts; live Supabase persistence not exercised because credentials were absent. |
| Founder-managed trainer access/pay/allotment | **Approved roadmap.** Founder will grant trainer access, fix each trainer's pay rate and own class allotment. Today founder settings are runtime drafts with read-only money fields, and trainer slots are trainer-managed. |
| Paid self-registration | **Approved roadmap.** Free account creation now accepts student/trainer/RM with a chosen password; a student is `active` immediately and staff stay `pending` until KYC plus founder/RM grant. Payment and pack purchase are not built; Razorpay pack crediting exists only for authenticated orders. A relationship manager may issue a generated temporary password to an already granted trainer but cannot choose or replace credentials. [ev: local HTTP contract check, 2026-11-26] |
| Parent ↔ trainer chat with notifications | **Built.** Private 1-on-1 human thread for the linked parent and assigned trainer, with per-recipient unread counts, mark-read, regex DLP and founder-only masked flags. No new SQL migration; records stay in service-only `mathify_records`. |

A stale external review claimed the project lacks a schema, tests, CI, realtime wiring and uses DeepSeek. None of that matches the current code; it appears to describe an older Phase-1 snapshot. Do not use it as a to-do list.

---

## 9. Decision log

| Commit | Decision |
| --- | --- |
| `251b1b7` | Hardened classroom privacy and trainer hint grants. |
| `a3e7905` | Live-readiness hardening; removed UI dead ends. |
| `b2bf372` | Completed live adapter, realtime outbox and live-readiness DX. |
| `044f9e4` | Trainer-owned student media controls, two-sided connection gate and reward trophies. |
| `f11c6b6` / `194409a` | LiveKit replaces Agora for live joins; `freelm` replaces Cloudflare Workers AI for new structured feedback; Resend added for transactional email; dependencies and lockfile updated. |
| `b43ba33` | Production guard migrated to require LiveKit + freelm instead of Agora + Cloudflare; regression suite updated to lock the new contract. |
| Working tree | LiveKit classroom/trainer adapters and standalone demo page; server-held mastery self-practice batches; private parent ↔ trainer chat with regex DLP and founder-only flags in `mathify_records`. |

---

## 10. Vocabulary

| Term | Meaning |
| --- | --- |
| PiP | Picture-in-picture floating call panel in the classroom. |
| Outbox | Durable event rows read through the safe `/events` cursor endpoint. |
| Safe payload | Event body after key scrubbing; never carries correctness or trainer notes. |
| Publisher | LiveKit grant with `canPublish: true`; both real participants stay publishers while founder observers are subscribe-only. |
| Reaffirm | Re-apply the user's chosen media state after a transition or suspension. |
| Fresh check | A passing connection result younger than 15 minutes. |
| Trophy | Student-safe view of a trainer-issued badge. |
| Trainer Desk | Internal trainer/founder support chat with verified payout and leave policy. |
| Study Buddy | Student doubt chat that coaches with Socratic hints and visual analogies, never final answers. |
| Self-practice batch | Ten server-generated questions with the key retained service-side. |
| DLP flag | Founder-only audit record for a blocked chat message: actor id/role, reason code, masked preview and timestamp; no delivered message payload. |
