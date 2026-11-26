# Mathify Learning OS

This repository contains the Mathify dashboard website and its API layer. Live teaching is strictly **1-on-1**; there are no group classes.

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

## Run locally

One command installs the API dependencies and serves the UI and API from the same origin:

```powershell
npm install --prefix server
npm start
```

Open `http://localhost:4000/`. The Express app serves the reviewed HTML/CSS/JS surfaces and the API at `/api`; server source, migrations and `.env` files are never exposed. For a separate frontend origin, set `window.MATHIFY_API_BASE` to the API root before the app scripts load.

Copy `server/.env.example` to `server/.env` before adding credentials; `.env` is git-ignored. The default port is `4000`.

Review the ordered SQL plan with:

```powershell
cd server
npm run migrate
```

`npm run migrate` is a dry run and contacts no database. Applying is blocked until both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply` are set deliberately; see `server/migrations/README.md`.

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

## Separate repositories

- Creative campaign assets live in [`nextgen-kit`](https://github.com/rohit4333/nextgen-kit), not here.
- This repository is the Mathify dashboard/API only.
