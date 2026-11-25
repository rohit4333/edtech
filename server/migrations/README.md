# Mathify SQL migrations

Ordered, human-reviewable SQL. These files are **not** managed by the Supabase
CLI (it is not installed in this workspace); `server/migrate.js` is the runner.

| File | Purpose |
| --- | --- |
| `0001_baseline.sql` | Full baseline schema, copied from `server/db/schema.sql`. RLS, safe student views, column-level answer-key lockdown and explicit grants. Safe to re-run. |
| `0002_student_curriculum.sql` | Adds `public.student_curriculum` — academic fields only (board, grade, language, school chapter). RLS from `app_metadata`, column-level Data API grant, no contact or identity columns. |

## Review before applying

```bash
cd server
npm run migrate                 # dry run: ordered list + SHA-256 checksums, no DB contact
npm run migrate -- --apply      # blocked unless both guards are present
```

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

**No live migration has been applied.** Review the SQL above before setting the
confirmation variable.
