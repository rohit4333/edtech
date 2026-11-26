-- Live persistence seam for the Express service_role.
--
-- The reviewed normalized relations in 0001/0002 remain the source of truth for
-- identity, sessions, quizzes and privacy boundaries. This migration adds the
-- two service-only tables the Node data adapter needs before the full
-- normalized mapping lands: a generic record store for the remaining app state
-- and a session-scoped event outbox so quiz/session events survive a process
-- restart and can be read by any API instance.
--
-- No anon or authenticated client gets direct access. Every row is written by
-- the Express service_role, which is the only holder of the secret key.

create table if not exists public.mathify_records (
  collection text not null,
  key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, key)
);

alter table public.mathify_records enable row level security;
revoke all on public.mathify_records from public, anon, authenticated;
grant all on public.mathify_records to service_role;

create table if not exists public.mathify_session_events (
  seq bigint generated always as identity primary key,
  session_id text not null,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mathify_session_events_session_seq_idx
  on public.mathify_session_events (session_id, seq);

alter table public.mathify_session_events enable row level security;

-- Direct Data API reads are limited to the two verified session participants.
-- Writes are restricted to non-student roles. Role checks use app_metadata only;
-- user_metadata is never trusted. The classroom bridge still uses the
-- server-scrubbed /api/sessions/:id/events endpoint, not this raw table.
drop policy if exists p_mathify_events_participants on public.mathify_session_events;
create policy p_mathify_events_participants on public.mathify_session_events
  for select to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id::text = session_id
        and (s.trainer_id = (select auth.uid()) or s.student_id = (select auth.uid()))
    )
  );

drop policy if exists p_mathify_events_no_students_write on public.mathify_session_events;
create policy p_mathify_events_no_students_write on public.mathify_session_events
  as restrictive for insert, update, delete to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

revoke all on public.mathify_session_events from public, anon, authenticated;
grant select on public.mathify_session_events to authenticated;
grant all on public.mathify_session_events to service_role;
