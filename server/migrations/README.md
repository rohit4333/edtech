# Mathify SQL migrations

Ordered, human-reviewable SQL. These files are **not** managed by the Supabase
CLI (it is not installed in this workspace); `server/migrate.js` is the runner.
They are part of the `feat/mathify-phase-3-curriculum` live-readiness work being
merged to `main`; the older Phase 1 snapshot has neither this runner nor the SQL
plan.

| File | Purpose |
| --- | --- |
| `0001_baseline.sql` | Full baseline schema, copied from `server/db/schema.sql`. RLS, safe student views, column-level answer-key lockdown and explicit grants. Safe to re-run. |
| `0002_student_curriculum.sql` | Adds `public.student_curriculum` — academic fields only (board, grade, language, school chapter). RLS from `app_metadata`, column-level Data API grant, no contact or identity columns. |
| `0003_live_persistence.sql` | Adds service-only `public.mathify_records` and the `public.mathify_session_events` outbox used by the live adapter. No anon/authenticated write access; participant reads are scoped by session and role checks use `app_metadata`. |
| `0004_ai_chat_logs.sql` | Adds founder-only `trainer_support_logs` and `student_doubt_logs` audit tables for Trainer Desk and Study Buddy. Sanitized prompt/reply and metadata only; no image bytes, contact data, answer keys or trainer notes. RLS reads `app_metadata`; no anon/authenticated Data API grants; service-role writes only. |
| `0006_trainer_onboarding_batches.sql` | Service-only collections for enrollment batches, locked trainer KYC onboarding and append-only founder corrections. No anon/authenticated Data API grants. |
| `0007_student_hint_lockdown.sql` | Revokes the drifted Data API grant on `quiz_questions.hint` and recreates `student_quiz_questions` without `hint`. Hints stay trainer-owned until an explicit trainer grant releases them; role checks use `app_metadata`. |
| `0008_payment_idempotency.sql` | Adds service-only Razorpay payment/order-credit relations and unique payment/order-credit indexes for exactly-once crediting; no anon/authenticated Data API grants. |
| `0009_recordings_storage.sql` | Creates the private `recordings` Storage bucket, a security-definer boolean helper and one `SELECT` policy on `storage.objects`. Objects are named `<session-uuid>/<filename>`; only that session's student, trainer or an `app_metadata` founder can read. No anon policy or table grants; writes stay service-role-only. |
| `0010_weekly_planner_cache.sql` | Documents the service-only `mathify_records` collections for immutable weekly planners: `weekly_planner_cache`, `weekly_planner_archive` and `weekly_planner_pointer`. Generated JSON is never overwritten; regeneration archives the prior version and moves the active pointer. No anon/authenticated Data API grants. |
| `0011_planner_agent.sql` | Adds the staff-only `planner_agent` role to the normalized `users` role check where that relation exists. Documents the service-only `planner_agent_suggestion` collection in `public.mathify_records`: the agent proposes changes to founder-authored plans but cannot replace them. Live auth reads the record store, not the browser table; no anon/authenticated Data API grants. |
| `0012_livekit_only_presence.sql` | Renames persisted Agora-era presence kinds and the `agora_uid` column to LiveKit names after transport removal. Existing evidence is preserved; fresh installs already use the new names. No grants change. |

## Review before applying

```bash
cd server
npm run migrate                 # dry run: ordered list + SHA-256 checksums, no DB contact
npm run migrate -- --apply      # blocked unless both guards are present
```

From the repository root, `npm run migrate` forwards here.

Apply requires **both**:

- `DATABASE_URL` in `server/.env` (never committed)
- `MATHIFY_MIGRATE_CONFIRM=apply`

The runner wraps all files in **one transaction** and records each filename and
checksum in `public.mathify_migrations`. Any SQL error rolls the whole run back.
Missing credentials produce a warning and a dry run; they never crash the
process.

`0002` follows Supabase's 2026-04-28 change: new `public` tables are not exposed
to the Data API automatically, so the academic columns are explicitly granted to
`authenticated` and everything else is revoked. All role checks read
`auth.jwt()->'app_metadata'->>'role'`; `user_metadata` is never trusted.

`server/tests/liveReadiness.test.js` and `server/tests/livePersistence.test.js`
check the transaction wrapper, checksum drift guards, service-only grants and
outbox shape. They are part of 55 Node suites run with plain `node` + `assert`
(no Jest/Vitest/Playwright/Cypress); current results are in `LIVE_QA_REPORT.md`. The first
seven SQL files, including `0007` and `0008`, are review-only in this workspace:
no runner-based live apply occurred during the recorded checks. `0009` is the
exception: after review it was applied and then hardened on the linked Supabase
project on 2026-11-26 through the Supabase MCP as three named migrations,
`0009_recordings_bucket`, `0009_recordings_storage_policy` and
`0009_recordings_storage_security_definer`.

v4.0.0 dry-run context [U+2026-11-26]: `node server/migrate.js --dry-run` returned
`EXITCODE=0` and listed the same seven ordered files (`0001`, `0002`, `0003`,
`0004`, `0006`, `0007`, `0008`) without contacting a database. B-05 remains
`BLOCKED_EXTERNAL`; applying still requires reviewed SQL, `DATABASE_URL`,
`MATHIFY_MIGRATE_CONFIRM=apply` and explicit founder approval. A-09 (this README
omitting `0008`) was fixed by the v3.1.0 documentation pass and is recorded, not
re-applied. [src: E2E_TEST_LOG.md:78]; [src: TPFF_BLOCKERS.md:15,32]

**No runner-based live migration has been applied.** `0010`, `0011` and the new
`0012` remain review-only after the recorded `0009` MCP application. Review the
SQL above, including the planner-agent role check and suggestion collection in
`0011` and the LiveKit-only presence relabel in `0012`, before setting the
confirmation variable.
