# Mathify Learning OS

This repository contains the Mathify dashboard website and its API layer. Live teaching is strictly **1-on-1**; there are no group classes.

> **Branch note:** the live-readiness work is on `main`; this branch, `feat/student-rtc-control-permission`, adds trainer-controlled student media access, a two-sided connection gate and reward trophies. The commands below assume this codebase state, not the older Phase 1 snapshot.

> **Full project guide:** [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) explains what, why, how, where and when for every part of Mathify.

## Surfaces

| Path | What it is |
| --- | --- |
| `index.html` | Public landing page — 1-on-1 tutoring, tutor profile and demo. |
| `apps.html` | Suite hub linking the live dashboards. |
| `home/index.html` | Redirect to the root public home. |
| `student/index.html` | Student dashboard — Mastery, sessions, recordings, reward trophies and wallet. |
| `trainer/index.html` | Trainer console — attendance, timeline, attention queue and live-call panel. |
| `classroom/index.html` | 1:1 live classroom — planner, whiteboard, quizzer, video and notes. |
| `lms/` | LMS surface (partial) with local planner designer. |
| `founder/` | Founder settings drafts — policy, mastery and trainer policy; money widgets are read-only. |
| `server/` | Express API, mock DB, auth/RBAC, quizzer, Agora, Cloudflare Workers AI and Razorpay seams. |

## Current state

- 24 Node test suites, including `liveReadiness.test.js`, `livePersistence.test.js`, `liveOperations.test.js`, `rtcControls.test.js`, `engagementControls.test.js` and `apiSmoke.test.js`. Tests use plain `node` + `assert` — no Jest, Vitest, Playwright or Cypress; full results are in `TEST_REPORT.md`.
- `.github/workflows/ci.yml`, a `Dockerfile`, `docker-compose.yml`, `render.yaml` and `railway.json`; root `package.json` provides `start`, `dev`, `test`, `migrate`, `seed` and `reminders`.
- `server/db/schema.sql` plus ordered `0001_baseline.sql`, `0002_student_curriculum.sql` and `0003_live_persistence.sql`, checked by a dry-run/checksum runner. No live migration has been applied.
- Default runtime is the in-memory mock store. `DATABASE_MODE=supabase` selects the completed service-role adapter in `server/db/supabase.js`; production never silently falls back to demo identities.
- AI is Cloudflare Workers AI only (no DeepSeek/OpenAI). AI drafts pass a trainer-only/personal-data moderation gate before review. Agora RTC/RTM tokens are real and server-signed; the contact booking API stores validated requests and notifies configured channels.
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

`npm run migrate` is a dry run and contacts no database. Applying is blocked until both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply` are set deliberately; see `server/migrations/README.md`. No live migration has been applied.

## Realtime and live mode

The shared session event stream uses a bounded in-memory cursor log in mock mode and the `mathify_session_events` outbox in live mode; both feed the same server-scrubbed `/events` polling endpoint. The safe channel is opened when a session loads, not only during a quiz, so media-control and connection changes reach both people at any time. Supabase Realtime canvas strokes are optional and carry no answer key. Agora RTC tokens are real and server-signed; the classroom's floating call panel joins only with server-derived channel/uid/token. Face, voice, names, role and whiteboard/Wacom activity are the only shared signals; answer keys, explanations and trainer notes never reach students.

### Classroom media and connection rules

- Students start with microphone and camera controls. The trainer's **Access** button grants or revokes that ability; a student is rejected by the server with `403` if they try to change the flag themselves.
- Revoking always forces the student's local tracks on **before** the buttons are locked. If a browser cannot actually enable a track (permission denied, stopped track, offline tab), the classroom says so instead of claiming audio/video are on. The server state remains authoritative and is re-read on the next load or event.
- Quiz and whiteboard transitions, tab focus and a light in-call keep-alive reaffirm the chosen media state on every device type — laptop/PC, Android/iPad tablet and Android/iOS phone. A silent mobile suspension cannot leave a camera or mic off mid-lesson.
- A 1:1 call cannot start until **both** verified participants pass a fresh connection check: at least `15 Mbps` download, `10 Mbps` upload and under `250 ms` latency. Results expire after 15 minutes. `Check speed` is a manual control beside Join; Join stays disabled until both people are ready, and the RTC token endpoint fails closed with `NETWORK_BELOW_MINIMUM`. Raw measurements are peer-private; events carry only pass/fail and readiness.
- Trainers can award fixed-catalog reward badges during a session. The server owns label and points; the student dashboard renders them as **trophies** with a running point total. Badge notifications carry no trainer identity or notes.

## Demo logins

| Role | Email | Password |
| --- | --- | --- |
| Founder | `founder@mathify.app` | `mathify-demo` |
| Trainer | `trainer@mathify.app` | `mathify-demo` |
| Student | `student@mathify.app` | `mathify-demo` |

## Design rules

- Paper & Ink + coral: `--paper #FDFAF3`, `--ink #0E1420`, `--coral #FF5B2E`.
- Coral buttons use ink text.
- Poppins UI, mono eyebrows/counters, hairlines, small radii.
- Trainer instructions, quiz answer keys and correctness are never sent to students before reveal.
- Public pages keep the shared nav and legal footer links: pricing, terms, privacy, refund and contact.

## Separate repositories

- Creative campaign assets live in [`nextgen-kit`](https://github.com/rohit4333/nextgen-kit), not here.
- This repository is the Mathify dashboard/API only.
