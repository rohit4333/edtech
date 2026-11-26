# Mathify — Project Guide

**What this is:** the single reference for what Mathify is, why it is built the way it is, where every piece lives, when each flow runs, and how to run/verify/ship it.

**Status:** `feat/student-rtc-control-permission` working tree based on `9838d0a` (26 November 2026). Local/mock mode by default; no live database migration and no live paid transaction have been performed.

**Companion documents:** [`README.md`](README.md) (quick start), [`server/README.md`](server/README.md) (API reference), [`TEST_REPORT.md`](TEST_REPORT.md) (verification evidence), [`server/migrations/README.md`](server/migrations/README.md) (SQL review procedure).

---

## 0. Facts at a glance

| Question | Answer |
| --- | --- |
| Product | Private **1-on-1** live maths tutoring. No group classes. |
| Stack | Vanilla HTML/CSS/JS surfaces + Node/Express API. No framework or build step. |
| AI | **Cloudflare Workers AI only.** No DeepSeek, no OpenAI. |
| Video | Agora RTC/RTM, server-signed tokens. One channel, two publishers. |
| Database | In-memory mock by default; completed Supabase service-role adapter for `DATABASE_MODE=supabase`. |
| Realtime | DB-backed session event outbox + scrubbed cursor polling; Supabase Realtime for canvas strokes. |
| Payments | Razorpay, 12 sessions / 540 SAR; credit only on verified `payment.captured`. |
| Tests | 24 Node suites, plain `node` + `assert`. CI, Dockerfile and deploy manifests present. `npm audit --omit=dev` reports 0 vulnerabilities. |
| Migrations | 3 reviewed SQL files, dry-run by default; apply needs explicit confirmation. |
| Live readiness | Code-complete; blocked on credential rotation and migration approval. |

---

## 1. WHAT — the product and its surfaces

### 1.1 The promise

A trainer and one student meet in a private live classroom. They share **name, face, voice and whiteboard/Wacom activity — nothing else**. No mobile number, no social link, no profile cross-exposure. Trainer instructions, quiz answer keys, hints, explanations and correctness stay server-side until the trainer deliberately reveals them.

### 1.2 Surfaces

| Path | Purpose |
| --- | --- |
| `index.html` | Public landing page: 1-on-1 positioning, tutor profile, demo booking. |
| `pricing.html`, `terms.html`, `privacy.html`, `refund.html`, `contact.html` | Legal and sales pages. Every footer carries all five links. |
| `apps.html`, `home/index.html` | Suite hub and redirect to public home. |
| `student/index.html` | Student desk: mastery, sessions, recordings with chapters, **reward trophies**, wallet. |
| `trainer/index.html` | Trainer console: attendance, timeline, attention queue, payouts, live-call panel. |
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
- Server-signed Agora RTC + RTM tokens, cloud recording seam, webhook handling.
- Razorpay order creation, signature-verified webhook, idempotent pack crediting.
- Cloudflare Workers AI generation with moderation and trainer-only field rejection.
- Trainer-owned student media permission with force-on-before-lock.
- Two-sided connection precondition before any class can start.
- Fixed-catalog reward badges rendered as student trophies.
- Student Control: one trainer-only surface for media Access, explicit mute/camera-off, emoji/applause pauses, board sharing, rewards, quiz, progress and end.
- Server-owned brand-safe celebrations and role-scoped reactions with separate visual layers, sound opt-in and reduced-motion fallback.
- 24 automated suites, CI, Docker, Render/Railway manifests, opt-in reminders, structured logging, rate limiting.

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
| Cloudflare-only AI | The product constraint forbids DeepSeek/OpenAI references; one provider keeps moderation and model behavior predictable. |

---

## 3. WHERE — repository map

| Area | Files | Role |
| --- | --- | --- |
| Public HTML | `*.html`, `public.css`, `assets/` | Marketing, legal, nav/footer contract. |
| Student desk | `student/index.html`, `student/app.js`, `student/api.js` | Dashboard rendering, trophy list, recording chapters. |
| Trainer console | `trainer/` | Attendance, timeline, payouts, session actions. |
| Classroom | `classroom/index.html`, `app.js`, `session.js`, `agora.js`, `api.js`, `networkCheck.js`, `engagement.js`, `engagement.css`, `realtime.js`, `room.css`, `panels.css` | Live room, quiz/board state, call controls, connection preflight, Student Control, celebrations/reactions, safe event bridge. |
| LMS | `lms/` | Partial course library with local planner designer and schema/privacy validation. |
| Founder workspace | `founder/index.html`, `founder/app.js`, `founder/founder.css` | Runtime policy/mastery/trainer-policy drafts; money widgets are read-only. |
| App entry | `server/index.js`, `server/app.js`, `server/config.js` | Boot, production guard, routes, reviewed static allowlist. |
| Auth | `server/auth/`, `server/middleware/auth.js` | Passwords, JWT, `sessionUser`/`publicUser` key allowlists, RBAC, session access. |
| Routes | `server/routes/` | Auth, trainer, student, sessions, policy, webhooks, admin (founder settings), agora, razorpay, leaves, contact, network. |
| Services | `server/services/` | Agora tokens, Cloudflare client, payouts, attendance, leave, presence, moderation, notification, logger, media permissions, network quality, badges, celebrations, reactions, reaction permissions, founder settings. |
| Data | `server/db/index.js`, `mock.js`, `supabase.js`, `schema.sql` | Facade, demo store, service-role adapter, canonical schema. |
| Migrations | `server/migrations/0001…0003`, `server/migrate.js` | Ordered SQL, checksum guards, dry-run runner. |
| Tests | `server/tests/*.test.js` | 24 suites; see `TEST_REPORT.md`. |
| Config | `server/config/policy.json`, `server/.env.example` | Business thresholds and env variable names (no secrets). |
| DevOps | `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`, `render.yaml`, `railway.json` | CI, containers, deployment manifests. |

### Where live state is stored

- `sessions.mediaPermissions` — `{ studentCanToggleMedia, forceMicOn, forceCameraOn, version, updatedAt }`.
- `sessions.networkChecks` — per-role `{ ok, downloadMbps, uploadMbps, latencyMs, failures, checkedAt }`.
- `users.badges` / `users.trophyPoints` — safe trophy records and total points.
- In live mode these ride in the service-only `mathify_records` JSONB store, so no new SQL migration is required for them.

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

### 4.7 Migration flow

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
- Production guard requires `AUTH_SECRET ≥ 32`, explicit `CORS_ORIGIN`, `DATABASE_MODE=supabase`, and Supabase/Cloudflare/Razorpay/Agora/Twilio secrets. No wildcard CORS, no demo fallback.

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

- Agora tokens are signed server-side from the session record; browser-provided channel, uid, peer UID and role are ignored.
- Both participants are publishers — a revoked student is **not** downgraded to subscriber, because mic/camera must stay on.
- `agora.js` keeps local track state, exposes `forceMediaOn()`, `setMediaControlsLocked()`, `reaffirmMedia()` and `setNetworkReady()`, and never claims a track was enabled when `setEnabled` failed.
- `NETWORK_BELOW_MINIMUM` maps to a friendly in-app message.
- Works on laptop/PC, Android/iPad tablet and Android/iOS phone; a mobile tab suspension is corrected by reaffirmation, not treated as an intentional mute.

### 5.6 AI

- Cloudflare Workers AI with `CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct`.
- Prompts end with exactly: `CRITICAL: Return ONLY valid JSON. No markdown, no explanations.`
- Drafts pass a moderation gate that rejects personal details, social links and trainer-only fields before trainer approval. Missing credentials produce a deterministic fallback in local mode; live calls wait for rotated credentials.

### 5.7 Payments

- Monthly pack: 12 sessions for 540 SAR (54000 halalas).
- Orders are created server-side; the webhook verifies signature and credits only a real `payment.captured` for a server-created order. Replays and forged payment notes are ignored.

### 5.8 Badges

- Catalog in `policy.json`: Focus Star (10), Sharp Thinking (20), Steady Progress (15), Kind Partner (10), Concept Master (25).
- Trainer posts only a `badgeId`; label, points and icon come from policy. Student award attempts get `403`; unknown ids get `400`.
- Student serializer exposes `badges` and `trophyPoints`; no trainer identity or notes.

### 5.9 Testing and delivery

- 24 suites cover services, serializers, privacy, nav/static surfaces, API smoke, live readiness, persistence, operations, RTC controls, engagement controls, founder settings and planner designer contracts.
- Plain `node` + `assert` is intentional: no Jest/Vitest dependency, deterministic local runs.
- CI runs on `.github/workflows/ci.yml`; `Dockerfile`, `docker-compose.yml`, `render.yaml` and `railway.json` cover container/deploy shapes.

---

## 6. WHO — permission matrix

| Action | Founder | Trainer | Student |
| --- | --- | --- | --- |
| View trainer notes / answer key before reveal | Yes | Yes | **No** |
| Award badges | Yes | Yes | **No** |
| Change student media permission | Yes | Yes | **No (403)** |
| Report own connection check | Yes | Yes | Yes |
| Submit a check for another role | No | No | **No** |
| Get an RTC token | Yes | Yes | Yes, only after both pass |
| Start/end session | Yes | Yes | No |
| Edit planner / draw on board | Yes | Yes | Yes (draw) |
| Read realtime log | Yes | Yes | **No** |
| See peer's raw speed numbers | Own only | Own only | Own only |

---

## 7. RUNBOOK

### Local

```powershell
npm install --prefix server
npm start
# open http://localhost:4000
```

Demo logins (password `mathify-demo`): `founder@mathify.app`, `trainer@mathify.app`, `student@mathify.app`.

### Verify

```powershell
npm test                 # 24 suites
npm run migrate          # dry run, prints checksums
```

Useful classroom URLs:

```text
/classroom/index.html?sessionId=ses_math_001
/classroom/index.html?sessionId=ses_math_001&view=student
```

Browser smoke should show: mic/camera on by default, Join disabled until **Check speed** passes for both people, trainer **Access** button present only on the trainer view, student trophies on the student desk, and zero console errors.

### Production checklist

1. Rotate the exposed Cloudflare API token, `SUPABASE_SECRET_KEY` and Agora Primary Certificate.
2. Fill `server/.env` from `server/.env.example`; never commit secrets.
3. Review all three SQL files, then apply only with `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply`.
4. Set `NODE_ENV=production`, `DATABASE_MODE=supabase`, explicit `CORS_ORIGIN`, `AUTH_SECRET ≥ 32` and every secret named in `assertProductionConfig()`.
5. Make one live Cloudflare Workers AI call and one signed webhook test after rotation.
6. Confirm both participants can pass the connection gate and that Join opens only then.

---

## 8. Known gaps and deliberate non-actions

| Item | Status |
| --- | --- |
| Live migration | Not applied; requires explicit approval. |
| Credential rotation | Blocking live verification. |
| PDF pages 5–17 | Not OCR'd; verbatim policy numbers (e.g. “Score 60”, “8% unlock”) cannot be confirmed yet. Current policy values are the documented source of truth. |
| Alerting (Sentry/Pino sinks) | Structured logging exists; external alerting is future work. |
| Distributed rate limiting | In-process limiter is fine for one instance; shared store needed for multi-replica. |
| Founder-editable settings screens | Live as reviewed runtime drafts. Money fields are read-only; file-backed deployment policy still needs explicit approval. |
| Planner designer v1 | Live as local authoring/export. Publish and pack import remain disabled. |
| Agora Join in browser smoke | Not clicked: it would request real camera/mic. Token and gate contracts are covered by tests. |

A stale external review claimed the project lacks a schema, tests, CI, realtime wiring and uses DeepSeek. None of that matches the current code; it appears to describe an older Phase-1 snapshot. Do not use it as a to-do list.

---

## 9. Decision log

| Commit | Decision |
| --- | --- |
| `251b1b7` | Hardened classroom privacy and trainer hint grants. |
| `a3e7905` | Live-readiness hardening; removed UI dead ends. |
| `b2bf372` | Completed live adapter, realtime outbox and live-readiness DX. |
| `044f9e4` | Trainer-owned student media controls, two-sided connection gate and reward trophies. |

---

## 10. Vocabulary

| Term | Meaning |
| --- | --- |
| PiP | Picture-in-picture floating call panel in the classroom. |
| Outbox | Durable event rows read through the safe `/events` cursor endpoint. |
| Safe payload | Event body after key scrubbing; never carries correctness or trainer notes. |
| Publisher | Agora role that sends audio/video; both people stay publishers. |
| Reaffirm | Re-apply the user's chosen media state after a transition or suspension. |
| Fresh check | A passing connection result younger than 15 minutes. |
| Trophy | Student-safe view of a trainer-issued badge. |
