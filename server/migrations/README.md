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
outbox shape. They are part of 26 Node suites run with plain `node` + `assert`
(no Jest/Vitest/Playwright/Cypress); results are in `TEST_REPORT.md`. All four
SQL files, including `0004`, are review-only in this workspace: no live apply
occurred and no Supabase call was made during the recorded checks.

**No live migration has been applied.** Review the SQL above before setting the
confirmation variable.
