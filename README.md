# Mathify Learning OS

This repository contains the Mathify dashboard website and its API layer. Live teaching is strictly **1-on-1**; there are no group classes.

> **Branch note:** the live-readiness work lives on `feat/mathify-phase-3-curriculum` and is being merged to `main`. The commands below assume this codebase state, not the older Phase 1 snapshot.

## Surfaces

| Path | What it is |
| --- | --- |
| `index.html` | Public landing page — 1-on-1 tutoring, tutor profile and demo. |
| `apps.html` | Suite hub linking the live dashboards. |
| `home/index.html` | Redirect to the root public home. |
| `student/index.html` | Student dashboard — Mastery, sessions, recordings and wallet. |
| `trainer/index.html` | Trainer console — attendance, timeline, attention queue and live-call panel. |
| `classroom/index.html` | 1:1 live classroom — planner, whiteboard, quizzer, video and notes. |
| `lms/` | LMS surface (partial). |
| `server/` | Express API, mock DB, auth/RBAC, quizzer, Agora, Cloudflare Workers AI and Razorpay seams. |

## Current state (Phase 3 branch)

- 22 Node test suites, including `liveReadiness.test.js`, `livePersistence.test.js`, `liveOperations.test.js` and `apiSmoke.test.js`. Tests use plain `node` + `assert` — no Jest, Vitest, Playwright or Cypress; full results are in `TEST_REPORT.md`.
- `.github/workflows/ci.yml`, a `Dockerfile`, `docker-compose.yml`, `render.yaml` and `railway.json`; root `package.json` provides `start`, `dev`, `test`, `migrate`, `seed` and `reminders`.
- `server/db/schema.sql` plus ordered `0001_baseline.sql`, `0002_student_curriculum.sql` and `0003_live_persistence.sql`, checked by a dry-run/checksum runner. No live migration has been applied.
- Default runtime is the in-memory mock store. `DATABASE_MODE=supabase` selects the completed service-role adapter in `server/db/supabase.js`; production never silently falls back to demo identities.
- AI is Cloudflare Workers AI only (no DeepSeek/OpenAI). AI drafts pass a trainer-only/personal-data moderation gate before review. Agora RTC/RTM tokens are real and server-signed; the contact booking API stores validated requests and notifies configured channels.
- The `lms/` surface is partial.

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

The shared session event stream uses a bounded in-memory cursor log in mock mode and the `mathify_session_events` outbox in live mode; both feed the same server-scrubbed `/events` polling endpoint. Supabase Realtime canvas strokes are optional and carry no answer key. Agora RTC tokens are real and server-signed; the classroom's floating call panel joins only with server-derived channel/uid/token. Face, voice, names, role and whiteboard/Wacom activity are the only shared signals; answer keys, explanations and trainer notes never reach students.

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
