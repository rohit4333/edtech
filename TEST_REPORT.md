# Mathify test report

**Date:** 26 November 2026
**Branch:** `feat/mathify-phase-3-curriculum`
**Scope:** Full Mathify stack — public site, shared assets, student desk, trainer console, 1:1 classroom, curriculum LMS, Express API, Supabase migration plan, Cloudflare-only AI, Razorpay/Agora/Twilio boundaries.
**Mode:** Local/mock by default. No live database migration and no live paid transaction were performed.

## Result

**PASS** — all automated suites, syntax checks, migration dry run, HTTP smoke checks, and in-app browser click-throughs completed successfully.

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Full automated suite | `npm test` from `server/` | Exit `0`. All suites passed, including `liveReadiness: 59 assertions passed`. |
| Live-readiness suite | `node tests/liveReadiness.test.js` | `59 assertions passed`. |
| API smoke | Included in `npm test` | `apiSmoke: passed`. |
| UI scaffold contract | Included in `npm test` | `scaffoldedUI: 12 assertions passed`. |
| Migration dry run | `npm run migrate --silent` | No database contacted. `0001_baseline.sql` 65388 bytes `sha256:02581afb164a`; `0002_student_curriculum.sql` 3995 bytes `sha256:390a1dc4412e`. |
| JS syntax | `node --check` on every changed JS file | All files passed. |
| Whitespace | `git diff --check` | Clean (only line-ending warnings on Windows). |
| HTTP surface smoke | `Invoke-WebRequest` against local API on port 4000 | All reviewed pages/assets returned `200`; `/server/app.js`, `/.git/config`, and other unreviewed paths returned `404`. |
| Browser smoke | In-app Chromium, all public + app surfaces | `0` console errors and `0` failed requests on all 12 surfaces. |

## Automated suite breakdown

All suites are registered in `server/package.json`:

- `payoutService`: 31 assertions
- `attendancePolicy`: 10 assertions
- `leaveService`: 23 assertions
- `masteryGating`: 31 assertions
- `quizGenerator`: 21 assertions
- `quizPromptInjection`: 10 assertions
- `cloudflareClient`: 68 assertions
- `curriculumAuthoring`: 107 assertions
- `curriculumContext`: 116 assertions
- `aiCurriculumIntegration`: 36 assertions
- `studentSerializer`: 19 assertions
- `privacyBoundary`: 134 assertions
- `chatAssistant`: 26 assertions
- `curriculumPersistence`: 25 assertions
- `navContract`: 44 assertions
- `slotService`: 15 assertions
- `presenceService`: 17 assertions
- `apiSmoke`: passed
- `scaffoldedUI`: 12 assertions
- `liveReadiness`: 59 assertions

Expected non-fatal console output during tests:

- `[ai] Cloudflare credentials missing; using deterministic fallback.`
- `[cloudflare] Workers AI credentials missing; using deterministic fallback.`
- `[SECURITY] Trainer-only fields detected in student payload!`
- `[realtime:mock] ...` event log lines

These confirm mock-mode fallback and deliberate privacy rejection, not failures.

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
- Migration SQL is wrapped in one transaction with per-file checksum drift guards; baseline nested `do $$` blocks remain intact.

## Browser click-through results

- All public pages: nav contract intact; mobile menu close script loaded.
- `contact.html`: booking form posts to `/api/contact`; visible status changed to **“Request received. We will contact you shortly.”** with no console errors.
- `lms/index.html`: course count `6`, `detailTitle` present; Review filter reduced list to `1`; Add module increased count `44 → 45` and showed a confirmation; sort changed label to **“Course name”**; no console errors.
- `classroom/index.html`: chat message submitted successfully through the session API and appeared in the shared log; no console errors.
- `student/index.html`: search highlighted `3` matches, notifications popover opened, `8` session actions wired, mobile tabs carry real targets; no console errors.
- `trainer/index.html`: search returned `1 matching student/session row`, `5` mobile tabs carry real targets, Start Class is wired; no console errors.

## Deliberate non-actions

- No Supabase migration was applied. Apply still requires human review plus both `DATABASE_URL` and `MATHIFY_MIGRATE_CONFIRM=apply`.
- No live Cloudflare call was made because the current `.env` token must be rotated first.
- No real Razorpay capture, Agora recording webhook, or Twilio message was sent from tests. Test notification credentials were cleared before HTTP checks.

## Remaining launch gates

1. Rotate the exposed Cloudflare API token, Supabase secret key, and Agora Primary Certificate; replace values in gitignored `server/.env` without sharing them in chat.
2. After rotation, make one live Cloudflare Workers AI call and verify production env validation.
3. Obtain explicit approval before applying reviewed Supabase migrations.
4. Finish founder-editable policy/mastery/trainer-policy settings screens and planner designer v1 if they are required for the launch scope.
