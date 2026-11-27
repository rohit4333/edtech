-- Mathify schema — PostgreSQL / Supabase, single-file migration.
--
-- Student-safety model (important):
--   * Supabase signs every browser client in as the `authenticated` Postgres
--     role, so table GRANTs cannot distinguish a student from a trainer. The
--     custom app role is read from app_metadata and every RLS policy wraps
--     auth calls in a subquery so they are evaluated once per query. Set the
--     app role in app_metadata (never user_metadata) and refresh tokens after
--     a change.
--   * trainer_notes, quiz_drafts and quiz_templates are denied to students by
--     RESTRICTIVE RLS policies. Answer-key columns (quiz_questions.answer_index,
--     quiz_questions.explanation, quiz_attempts.correct) are additionally
--     revoked from the authenticated Data API role at the column level.
--   * Students read quiz content only through `student_quiz_questions` and
--     `student_quiz_attempts`. Both are SECURITY INVOKER views: RLS filters the
--     rows, and the views never reference answer-key columns. Reveal state and
--     post-reveal explanations are served by the Express API, not the views.
--   * The Express/API service_role bypasses RLS and remains the writer of
--     answer keys, trainer notes and strokes.
--   * CREATE POLICY has no IF NOT EXISTS form in PostgreSQL, so every policy is
--     dropped before it is created; the whole file is safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Identity and profiles
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null,
  password_hash text not null,
  status text not null default 'active',
  title text,
  grade text,
  created_at timestamptz not null default now(),
  constraint users_role_check check (role in ('founder', 'trainer', 'student', 'relationship_manager', 'planner_agent')),
  constraint users_status_check check (status in ('active', 'suspended'))
);

create table if not exists public.trainer_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  pay_per_session numeric(8,2) not null default 300,
  max_hours_per_day smallint not null default 6,
  max_sessions_per_day smallint not null default 6,
  active boolean not null default true
);

create table if not exists public.student_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  mastery smallint not null default 0 check (mastery between 0 and 100),
  streak smallint not null default 0,
  sessions_remaining smallint not null default 0,
  batch text
);

-- ---------------------------------------------------------------------------
-- Packs and payments. Packs are non-refundable by default (refundable = false)
-- and expire exactly 38 days after purchase.
-- ---------------------------------------------------------------------------

create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id),
  label text not null,
  total_sessions smallint not null,
  remaining_sessions smallint not null,
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  refundable boolean not null default false,
  payment_ref text,
  constraint packs_expiry_38d_check
    check (expires_at = purchased_at + interval '38 days')
);

create table if not exists public.razorpay_orders (
  id text primary key,
  student_id uuid not null references public.users(id),
  pack_id text not null,
  sessions smallint not null,
  amount_integer bigint not null,
  currency text not null,
  receipt text not null,
  status text not null default 'created',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  order_id text references public.razorpay_orders(id),
  student_id uuid not null references public.users(id),
  amount_integer bigint not null,
  currency text not null,
  sessions_credited smallint not null,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sessions: strictly one trainer and one student per session.
-- ---------------------------------------------------------------------------

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  trainer_id uuid not null references public.users(id),
  student_id uuid not null references public.users(id),
  pack_id uuid references public.packs(id),
  title text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  current_page smallint not null default 1,
  scheduled_at timestamptz,
  started_at timestamptz,
  ends_at timestamptz,
  elapsed_seconds integer not null default 0,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('trainer', 'student', 'founder')),
  constraint sessions_distinct_parties check (trainer_id <> student_id)
);

-- Upgrade path for databases created before scheduling/cancellation existed.
alter table public.sessions add column if not exists scheduled_at timestamptz;
alter table public.sessions add column if not exists cancelled_at timestamptz;
alter table public.sessions add column if not exists cancelled_by text
  check (cancelled_by in ('trainer', 'student', 'founder'));
create index if not exists sessions_scheduled_at_idx on public.sessions (scheduled_at);

-- A student (and a trainer) can have at most one live session at a time.
create unique index if not exists one_live_student_session
  on public.sessions (student_id) where status = 'live';
create unique index if not exists one_live_trainer_session
  on public.sessions (trainer_id) where status = 'live';
create index if not exists sessions_student_idx on public.sessions (student_id);
create index if not exists sessions_trainer_idx on public.sessions (trainer_id);

create table if not exists public.lesson_pages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  page smallint not null,
  title text not null,
  eyebrow text,
  prompt text not null,
  sketch_label text,
  unique (session_id, page)
);

-- Students have no SELECT policy on this table, ever.
create table if not exists public.trainer_notes (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.lesson_pages(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.planner_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  position smallint not null default 0
);

-- ---------------------------------------------------------------------------
-- Quizzes. answer_index / explanation are answer-key material; students only
-- see them through the safe views defined below, after a reveal.
-- ---------------------------------------------------------------------------

create table if not exists public.quiz_templates (
  id text primary key,
  objective text not null,
  difficulty text not null default 'core',
  variant_count smallint not null default 0,
  active boolean not null default true
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  status text not null default 'ready' check (status in ('ready', 'live', 'ended')),
  phase text not null default 'draft'
    check (phase in ('draft', 'answering', 'awaiting_reveal', 'revealed',
                     'reteach', 'recheck', 'complete')),
  current_question_id uuid,
  started_at timestamptz
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  answer_index smallint not null,
  hint text,
  explanation text not null,
  position smallint not null default 0,
  source text not null default 'template'
    check (source in ('template', 'ai_draft', 'manual')),
  template_id text references public.quiz_templates(id),
  status text not null default 'active'
    check (status in ('draft', 'approved', 'active', 'retired'))
);

create table if not exists public.quiz_drafts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  template_id text references public.quiz_templates(id),
  prompt text not null,
  options jsonb not null,
  answer_index smallint not null,
  hint text,
  explanation text not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_reveals (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.quiz_questions(id) on delete cascade,
  revealed_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  student_id uuid not null references public.users(id),
  option_index smallint not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id);
create index if not exists quiz_attempts_question_idx on public.quiz_attempts (question_id);
create index if not exists quiz_attempts_student_idx on public.quiz_attempts (student_id);

-- Covering indexes for the foreign keys flagged by the Supabase advisor.
create index if not exists attendance_session_idx on public.attendance (session_id);
create index if not exists attendance_student_idx on public.attendance (student_id);
create index if not exists attendance_trainer_idx on public.attendance (trainer_id);
create index if not exists leaves_trainer_idx on public.leaves (trainer_id);
create index if not exists packs_student_idx on public.packs (student_id);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_student_idx on public.payments (student_id);
create index if not exists payouts_trainer_idx on public.payouts (trainer_id);
create index if not exists planner_items_session_idx on public.planner_items (session_id);
create index if not exists quiz_canvas_strokes_question_idx
  on public.quiz_canvas_strokes (question_id);
create index if not exists quiz_drafts_quiz_idx on public.quiz_drafts (quiz_id);
create index if not exists quiz_drafts_template_idx on public.quiz_drafts (template_id);
create index if not exists quiz_questions_template_idx on public.quiz_questions (template_id);
create index if not exists quiz_reveals_revealed_by_idx on public.quiz_reveals (revealed_by);
create index if not exists quizzes_current_question_idx on public.quizzes (current_question_id);
create index if not exists razorpay_orders_student_idx on public.razorpay_orders (student_id);
create index if not exists sessions_pack_idx on public.sessions (pack_id);
create index if not exists support_escalations_student_idx
  on public.support_escalations (student_id);
create index if not exists trainer_incidents_session_idx
  on public.trainer_incidents (session_id);
create index if not exists trainer_notes_page_idx on public.trainer_notes (page_id);

-- quizzes.current_question_id is added after quiz_questions so the FK is
-- available on upgrades as well as on a fresh install.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quizzes_current_question_fk'
      and conrelid = 'public.quizzes'::regclass
  ) then
    alter table public.quizzes
      add constraint quizzes_current_question_fk
      foreign key (current_question_id)
      references public.quiz_questions(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Whiteboard strokes and the temporary quiz Wacom overlay.
-- No answer key or correctness data lives in either stroke table.
-- ---------------------------------------------------------------------------

create table if not exists public.board_strokes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  seq bigint not null,
  page smallint not null,
  tool text not null check (tool in ('pen', 'marker', 'eraser')),
  color text not null,
  points jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create table if not exists public.quiz_canvas_strokes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid references public.quiz_questions(id) on delete set null,
  stroke_id text not null,
  seq bigint not null,
  surface text not null default 'quiz-wacom',
  type text not null check (type in ('start', 'point', 'end', 'clear')),
  x numeric(7,6) check (x between 0 and 1),
  y numeric(7,6) check (y between 0 and 1),
  color text,
  width numeric,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index if not exists board_strokes_session_idx on public.board_strokes (session_id);
create index if not exists quiz_canvas_strokes_session_idx
  on public.quiz_canvas_strokes (session_id);

-- Single merged recordings table (replaces the two conflicting definitions).
-- It carries both the live LiveKit room fields and the finished playback
-- fields, so old and new rows are represented by one relation.
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  channel_name text not null,
  uid text not null,
  resource_id text,
  sid text,
  status text not null default 'recording'
    check (status in ('recording', 'stopped')),
  mode text not null default 'livekit',
  provider text not null default 'livekit',
  url text,
  duration_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  ready_at timestamptz
);

create index if not exists recordings_session_idx on public.recordings (session_id);

-- Upgrade path for databases created from the earlier split schema.
alter table public.recordings add column if not exists resource_id text;
alter table public.recordings add column if not exists sid text;
alter table public.recordings add column if not exists mode text not null default 'livekit';
alter table public.recordings add column if not exists provider text not null default 'livekit';
alter table public.recordings add column if not exists url text;
alter table public.recordings add column if not exists duration_seconds integer not null default 0;
alter table public.recordings add column if not exists started_at timestamptz not null default now();
alter table public.recordings add column if not exists stopped_at timestamptz;
alter table public.recordings add column if not exists ready_at timestamptz;

-- ---------------------------------------------------------------------------
-- Attendance, leave and payouts.
-- ---------------------------------------------------------------------------

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  trainer_id uuid not null references public.users(id),
  student_id uuid not null references public.users(id),
  status text not null,
  marked_at timestamptz not null default now(),
  constraint attendance_status_only_check check (status in ('present', 'absent', 'late', 'leave', 'unattended'))
);

-- Always replace the old check on upgrades: CREATE TABLE IF NOT EXISTS does not
-- update an existing constraint definition.
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance drop constraint if exists attendance_status_only_check;
alter table public.attendance
  add constraint attendance_status_only_check
  check (status in ('present', 'absent', 'late', 'leave', 'unattended'));

create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users(id),
  student_id uuid references public.users(id),
  session_id uuid references public.sessions(id) on delete set null,
  requested_by uuid references public.users(id),
  requested_by_role text,
  starts_on date not null,
  ends_on date not null,
  notice_hours numeric(8,2) not null,
  period text,
  reason text,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  fine_code text,
  student_status text not null default 'leave',
  pack_penalty boolean not null default false,
  auto_approved boolean not null default false,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.leaves add column if not exists student_id uuid references public.users(id);
alter table public.leaves add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.leaves add column if not exists requested_by uuid references public.users(id);
alter table public.leaves add column if not exists requested_by_role text;
alter table public.leaves add column if not exists period text;
alter table public.leaves add column if not exists reason text;
alter table public.leaves add column if not exists student_status text not null default 'leave';
alter table public.leaves add column if not exists pack_penalty boolean not null default false;
alter table public.leaves add column if not exists auto_approved boolean not null default false;
alter table public.leaves add column if not exists decided_at timestamptz;

-- Replace the old three-value check on upgrades.
alter table public.leaves drop constraint if exists leaves_status_check;
alter table public.leaves
  add constraint leaves_status_check
  check (status in ('requested', 'approved', 'rejected', 'cancelled'));

-- A declared slot is committed to one trainer. Classes inside it are paid at
-- 100%; unutilised hours are paid at 30% of that trainer's session rate.
create table if not exists public.trainer_slots (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users(id),
  day_of_week smallint check (day_of_week between 0 and 6),
  slot_date date,
  start_minute_utc integer not null check (start_minute_utc between 0 and 1440),
  end_minute_utc integer not null check (end_minute_utc between 0 and 1440 and end_minute_utc > start_minute_utc),
  label text,
  created_at timestamptz not null default now(),
  constraint trainer_slots_recurrence_check check (day_of_week is not null or slot_date is not null)
);

-- Append-only presence evidence and the frozen per-session snapshot.
create table if not exists public.presence_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.users(id),
  role text not null check (role in ('trainer', 'student')),
  kind text not null check (kind in ('heartbeat', 'livekit_join', 'livekit_leave')),
  active boolean,
  learning_events integer not null default 0,
  cumulative_learning_events integer not null default 0,
  participant_uid bigint,
  leaving boolean not null default false,
  at timestamptz not null default now()
);

create table if not exists public.presence_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  computed_at timestamptz not null default now(),
  trainer_present_minutes integer not null default 0,
  student_present_minutes integer not null default 0,
  trainer_present boolean not null default false,
  student_present boolean not null default false,
  payout_eligible boolean not null default false,
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists presence_events_session_idx on public.presence_events (session_id, at);
create index if not exists trainer_slots_trainer_idx on public.trainer_slots (trainer_id);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users(id),
  period_start date not null,
  period_end date not null,
  session_count smallint not null default 0,
  hours numeric(6,2) not null default 0,
  bonus numeric(10,2) not null default 0,
  fines numeric(10,2) not null default 0,
  mvt_award numeric(10,2) not null default 0,
  amount numeric(10,2) not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'paid')),
  breakdown jsonb not null default '{}'::jsonb,
  requires_manual_review boolean not null default false
);

alter table public.payouts add column if not exists bonus numeric(10,2) not null default 0;
alter table public.payouts add column if not exists fines numeric(10,2) not null default 0;
alter table public.payouts add column if not exists mvt_award numeric(10,2) not null default 0;
alter table public.payouts add column if not exists amount numeric(10,2) not null default 0;
alter table public.payouts add column if not exists status text not null default 'draft';
alter table public.payouts add column if not exists breakdown jsonb not null default '{}'::jsonb;
alter table public.payouts add column if not exists requires_manual_review boolean not null default false;

-- Payout-support data: incidents (no-show / late cancel), attendance-bonus
-- qualification by month and the monthly MVT top-three ranking.
create table if not exists public.trainer_incidents (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users(id),
  session_id uuid references public.sessions(id) on delete set null,
  type text not null check (type in ('no_show', 'late_cancel')),
  notice_hours numeric(6,2),
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'applied', 'dismissed')),
  fine_code text,
  occurred_on date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_bonus_months (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users(id),
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  qualified boolean not null default false,
  unique (trainer_id, period)
);

create table if not exists public.mvt_rankings (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  trainer_id uuid not null references public.users(id),
  rank smallint not null check (rank between 1 and 3),
  source text not null default 'manual',
  unique (period, rank)
);

create index if not exists trainer_incidents_trainer_idx
  on public.trainer_incidents (trainer_id);
create index if not exists attendance_bonus_months_trainer_idx
  on public.attendance_bonus_months (trainer_id);
create index if not exists mvt_rankings_trainer_idx on public.mvt_rankings (trainer_id);

-- ---------------------------------------------------------------------------
-- Inbound WhatsApp and founder-only escalations.
-- ---------------------------------------------------------------------------

create table if not exists public.whatsapp_messages (
  id text primary key,
  from_number text not null,
  body text not null,
  received_at timestamptz not null default now()
);

create table if not exists public.support_escalations (
  id text primary key,
  from_number text not null,
  student_id uuid references public.users(id),
  student_name text,
  message text not null,
  summary text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved')),
  notifications jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- AI chat founder audit logs. Sanitized prompt/reply and metadata only; image
-- bytes, answer keys, trainer notes and contact details are never persisted.
create table if not exists public.trainer_support_logs (
  id text primary key,
  actor_id text not null,
  role text not null check (role in ('trainer', 'founder')),
  question text not null,
  reply text not null,
  source text not null check (source in ('ai', 'fallback', 'validation')),
  reason text,
  model text,
  image_used boolean not null default false,
  image_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.student_doubt_logs (
  id text primary key,
  actor_id text not null,
  role text not null check (role in ('student', 'founder')),
  question text not null,
  reply text not null,
  source text not null check (source in ('ai', 'fallback', 'validation')),
  reason text,
  model text,
  image_used boolean not null default false,
  image_type text,
  created_at timestamptz not null default now()
);

create index if not exists trainer_support_logs_created_at_idx
  on public.trainer_support_logs (created_at desc);
create index if not exists student_doubt_logs_created_at_idx
  on public.student_doubt_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Constraint upgrades for databases that predate the named checks.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_role_check' and conrelid = 'public.users'::regclass
  ) then
    alter table public.users add constraint users_role_check
      check (role in ('founder', 'trainer', 'student', 'relationship_manager', 'planner_agent'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_status_check' and conrelid = 'public.users'::regclass
  ) then
    alter table public.users add constraint users_status_check
      check (status in ('active', 'suspended'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_distinct_parties' and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions add constraint sessions_distinct_parties
      check (trainer_id <> student_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'packs_expiry_38d_check' and conrelid = 'public.packs'::regclass
  ) then
    -- NOT VALID keeps the migration runnable on legacy rows; all new writes
    -- are still forced onto the exact purchased_at + 38 days value.
    alter table public.packs add constraint packs_expiry_38d_check
      check (expires_at = purchased_at + interval '38 days') not valid;
    begin
      alter table public.packs validate constraint packs_expiry_38d_check;
    exception when others then
      raise notice 'packs_expiry_38d_check left NOT VALID: existing rows need cleanup';
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Safe student views. SECURITY INVOKER makes RLS on the base tables apply to
-- the querying student. The views never reference answer-key columns, so no
-- answer, explanation or pre-reveal correctness can leak through them.
-- ---------------------------------------------------------------------------

drop view if exists public.student_quiz_questions;
create view public.student_quiz_questions
with (security_invoker = true, security_barrier = true) as
select
  q.id,
  q.quiz_id,
  q.prompt,
  q.options,
  q.position,
  q.status,
  q.source
from public.quiz_questions q
join public.quizzes z on z.id = q.quiz_id
join public.sessions s on s.id = z.session_id
where s.student_id = (select auth.uid())
  and ((select auth.jwt())->'app_metadata'->>'role') = 'student'
  and q.status in ('approved', 'active');

drop view if exists public.student_quiz_attempts;
create view public.student_quiz_attempts
with (security_invoker = true, security_barrier = true) as
select
  a.id,
  a.question_id,
  a.student_id,
  a.option_index,
  a.created_at
from public.quiz_attempts a
join public.quiz_questions q on q.id = a.question_id
join public.quizzes z on z.id = q.quiz_id
join public.sessions s on s.id = z.session_id
where a.student_id = (select auth.uid())
  and s.student_id = (select auth.uid())
  and ((select auth.jwt())->'app_metadata'->>'role') = 'student';

-- ---------------------------------------------------------------------------
-- Session partner identity. Only the display name crosses the 1:1 boundary;
-- no id, email, phone, social handle, title or profile field is exposed.
-- The view is security-definer so its explicit predicate is the only filter.
-- ---------------------------------------------------------------------------

drop view if exists public.session_participant_names;
create view public.session_participant_names
with (security_barrier = true) as
select u.name
from public.users u
where
  u.id = (select auth.uid())
  or ((select auth.jwt())->'app_metadata'->>'role') = 'founder'
  or (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.trainer_id = (select auth.uid()) and s.student_id = u.id)
  )
  or (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.student_id = (select auth.uid()) and s.trainer_id = u.id)
  );

-- ---------------------------------------------------------------------------
-- Enable RLS on every application table (including any table added later).
-- ---------------------------------------------------------------------------

do $$
declare tbl text;
begin
  for tbl in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS policies. Founders see/manage everything; trainers are confined to their
-- own sessions and rows derived from them; students are confined to their own.
-- ---------------------------------------------------------------------------

-- users
drop policy if exists p_users_founder on public.users;
create policy p_users_founder on public.users for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_users_self_or_session_partner on public.users;
create policy p_users_self_only on public.users for select to authenticated
  using (id = (select auth.uid()));

-- Session partners read each other through public.session_participant_names,
-- which exposes a name and nothing else. Direct user/profile reads are revoked
-- at the privilege layer below, so emails, phone numbers and pay rates cannot
-- cross the trainer/student boundary.

drop policy if exists p_users_update_self on public.users;
create policy p_users_update_self on public.users for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = ((select auth.jwt())->'app_metadata'->>'role'));

-- trainer_profiles
drop policy if exists p_trainer_profiles_founder on public.trainer_profiles;
create policy p_trainer_profiles_founder on public.trainer_profiles for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_trainer_profiles_own on public.trainer_profiles;
create policy p_trainer_profiles_own on public.trainer_profiles for all to authenticated
  using (user_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer')
  with check (user_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

-- Students never read trainer_profiles: pay rates are business-private.

-- student_profiles
drop policy if exists p_student_profiles_founder on public.student_profiles;
create policy p_student_profiles_founder on public.student_profiles for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_student_profiles_own on public.student_profiles;
create policy p_student_profiles_own on public.student_profiles for all to authenticated
  using (user_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student')
  with check (user_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student');

-- Trainers never read student_profiles directly; attendance and progress are
-- served by the Express service_role through serializer allowlists.

-- packs
drop policy if exists p_packs_founder on public.packs;
create policy p_packs_founder on public.packs for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_packs_student_select on public.packs;
create policy p_packs_student_select on public.packs for select to authenticated
  using (student_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student');

drop policy if exists p_packs_trainer_select on public.packs;
create policy p_packs_trainer_select on public.packs for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.trainer_id = (select auth.uid())
                  and s.student_id = packs.student_id)
  );

-- razorpay_orders
drop policy if exists p_razorpay_orders_founder on public.razorpay_orders;
create policy p_razorpay_orders_founder on public.razorpay_orders for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_razorpay_orders_student_select on public.razorpay_orders;
create policy p_razorpay_orders_student_select on public.razorpay_orders
  for select to authenticated
  using (student_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student');

-- payments
drop policy if exists p_payments_founder on public.payments;
create policy p_payments_founder on public.payments for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_payments_student_select on public.payments;
create policy p_payments_student_select on public.payments for select to authenticated
  using (student_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student');

-- sessions
drop policy if exists p_sessions_founder on public.sessions;
create policy p_sessions_founder on public.sessions for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_sessions_trainer on public.sessions;
create policy p_sessions_trainer on public.sessions for all to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer')
  with check (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_sessions_student_select on public.sessions;
create policy p_sessions_student_select on public.sessions for select to authenticated
  using (student_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student');

-- lesson_pages
drop policy if exists p_lesson_pages_founder on public.lesson_pages;
create policy p_lesson_pages_founder on public.lesson_pages for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_lesson_pages_trainer on public.lesson_pages;
create policy p_lesson_pages_trainer on public.lesson_pages for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  );

drop policy if exists p_lesson_pages_student_select on public.lesson_pages;
create policy p_lesson_pages_student_select on public.lesson_pages
  for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = (select auth.uid()))
  );

-- trainer_notes: no student policy plus a restrictive denial.
drop policy if exists p_trainer_notes_founder on public.trainer_notes;
create policy p_trainer_notes_founder on public.trainer_notes for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_trainer_notes_trainer on public.trainer_notes;
create policy p_trainer_notes_trainer on public.trainer_notes for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.lesson_pages lp
      join public.sessions s on s.id = lp.session_id
      where lp.id = page_id and s.trainer_id = (select auth.uid())
    )
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.lesson_pages lp
      join public.sessions s on s.id = lp.session_id
      where lp.id = page_id and s.trainer_id = (select auth.uid())
    )
  );

drop policy if exists p_trainer_notes_no_students on public.trainer_notes;
create policy p_trainer_notes_no_students on public.trainer_notes
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

-- planner_items
drop policy if exists p_planner_items_founder on public.planner_items;
create policy p_planner_items_founder on public.planner_items for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_planner_items_trainer on public.planner_items;
create policy p_planner_items_trainer on public.planner_items for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  );

drop policy if exists p_planner_items_student_select on public.planner_items;
create policy p_planner_items_student_select on public.planner_items
  for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = (select auth.uid()))
  );

-- quiz_templates: trainer-visible, student-denied.
drop policy if exists p_quiz_templates_founder on public.quiz_templates;
create policy p_quiz_templates_founder on public.quiz_templates for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_quiz_templates_trainer_select on public.quiz_templates;
create policy p_quiz_templates_trainer_select on public.quiz_templates
  for select to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'trainer' and active);

drop policy if exists p_quiz_templates_no_students on public.quiz_templates;
create policy p_quiz_templates_no_students on public.quiz_templates
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

-- quizzes
drop policy if exists p_quizzes_founder on public.quizzes;
create policy p_quizzes_founder on public.quizzes for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_quizzes_trainer on public.quizzes;
create policy p_quizzes_trainer on public.quizzes for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  );

drop policy if exists p_quizzes_student_select on public.quizzes;
create policy p_quizzes_student_select on public.quizzes for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = (select auth.uid()))
  );

-- quiz_questions: students may read approved/active rows for their own quizzes;
-- the answer-key columns are revoked from the Data API role below.
drop policy if exists p_quiz_questions_founder on public.quiz_questions;
create policy p_quiz_questions_founder on public.quiz_questions for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_quiz_questions_trainer on public.quiz_questions;
create policy p_quiz_questions_trainer on public.quiz_questions for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = (select auth.uid())
    )
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = (select auth.uid())
    )
  );

drop policy if exists p_quiz_questions_no_students on public.quiz_questions;
drop policy if exists p_quiz_questions_student_select on public.quiz_questions;
create policy p_quiz_questions_student_select on public.quiz_questions
  for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and status in ('approved', 'active')
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.student_id = (select auth.uid())
    )
  );

-- quiz_drafts: trainer/founder only.
drop policy if exists p_quiz_drafts_founder on public.quiz_drafts;
create policy p_quiz_drafts_founder on public.quiz_drafts for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_quiz_drafts_trainer on public.quiz_drafts;
create policy p_quiz_drafts_trainer on public.quiz_drafts for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = (select auth.uid())
    )
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = (select auth.uid())
    )
  );

drop policy if exists p_quiz_drafts_no_students on public.quiz_drafts;
create policy p_quiz_drafts_no_students on public.quiz_drafts
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

-- quiz_reveals: written by the session trainer; students read via the views.
drop policy if exists p_quiz_reveals_founder on public.quiz_reveals;
create policy p_quiz_reveals_founder on public.quiz_reveals for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_quiz_reveals_trainer on public.quiz_reveals;
create policy p_quiz_reveals_trainer on public.quiz_reveals for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = (select auth.uid())
    )
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = (select auth.uid())
    )
  );

-- quiz_attempts: students may read their own attempts; `correct` is revoked
-- from the Data API role below.
drop policy if exists p_quiz_attempts_founder on public.quiz_attempts;
create policy p_quiz_attempts_founder on public.quiz_attempts for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_quiz_attempts_trainer on public.quiz_attempts;
create policy p_quiz_attempts_trainer on public.quiz_attempts for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = (select auth.uid())
    )
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = (select auth.uid())
    )
  );

drop policy if exists p_quiz_attempts_no_students on public.quiz_attempts;
drop policy if exists p_quiz_attempts_student_select on public.quiz_attempts;
create policy p_quiz_attempts_student_select on public.quiz_attempts
  for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and student_id = (select auth.uid())
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.student_id = (select auth.uid())
    )
  );

-- board_strokes
drop policy if exists p_board_strokes_founder on public.board_strokes;
create policy p_board_strokes_founder on public.board_strokes for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_board_strokes_trainer on public.board_strokes;
create policy p_board_strokes_trainer on public.board_strokes for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  );

drop policy if exists p_board_strokes_student_select on public.board_strokes;
create policy p_board_strokes_student_select on public.board_strokes
  for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = (select auth.uid()))
  );

drop policy if exists p_board_strokes_no_student_writes on public.board_strokes;
create policy p_board_strokes_no_student_writes on public.board_strokes
  as restrictive for insert to authenticated
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

drop policy if exists p_board_strokes_no_student_updates on public.board_strokes;
create policy p_board_strokes_no_student_updates on public.board_strokes
  as restrictive for update to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

drop policy if exists p_board_strokes_no_student_deletes on public.board_strokes;
create policy p_board_strokes_no_student_deletes on public.board_strokes
  as restrictive for delete to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

-- quiz_canvas_strokes: participants may read, only trainer/founder may write.
drop policy if exists p_quiz_canvas_founder on public.quiz_canvas_strokes;
create policy p_quiz_canvas_founder on public.quiz_canvas_strokes for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_quiz_canvas_trainer on public.quiz_canvas_strokes;
create policy p_quiz_canvas_trainer on public.quiz_canvas_strokes for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  );

drop policy if exists p_quiz_canvas_student_select on public.quiz_canvas_strokes;
create policy p_quiz_canvas_student_select on public.quiz_canvas_strokes
  for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = (select auth.uid()))
  );

drop policy if exists p_quiz_canvas_no_student_insert on public.quiz_canvas_strokes;
create policy p_quiz_canvas_no_student_insert on public.quiz_canvas_strokes
  as restrictive for insert to authenticated
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

drop policy if exists p_quiz_canvas_no_student_update on public.quiz_canvas_strokes;
create policy p_quiz_canvas_no_student_update on public.quiz_canvas_strokes
  as restrictive for update to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

drop policy if exists p_quiz_canvas_no_student_delete on public.quiz_canvas_strokes;
create policy p_quiz_canvas_no_student_delete on public.quiz_canvas_strokes
  as restrictive for delete to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

-- recordings
drop policy if exists p_recordings_founder on public.recordings;
create policy p_recordings_founder on public.recordings for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_recordings_trainer on public.recordings;
create policy p_recordings_trainer on public.recordings for all to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = (select auth.uid()))
  );

drop policy if exists p_recordings_student_select on public.recordings;
create policy p_recordings_student_select on public.recordings for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = (select auth.uid()))
  );

-- attendance
drop policy if exists p_attendance_founder on public.attendance;
create policy p_attendance_founder on public.attendance for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_attendance_trainer on public.attendance;
create policy p_attendance_trainer on public.attendance for all to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer')
  with check (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_attendance_student_select on public.attendance;
create policy p_attendance_student_select on public.attendance for select to authenticated
  using (student_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student');

-- leaves
drop policy if exists p_leaves_founder on public.leaves;
create policy p_leaves_founder on public.leaves for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_leaves_trainer on public.leaves;
create policy p_leaves_trainer on public.leaves for all to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer')
  with check (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_leaves_student_select on public.leaves;
create policy p_leaves_student_select on public.leaves for select to authenticated
  using (student_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'student');

drop policy if exists p_leaves_student_insert on public.leaves;
create policy p_leaves_student_insert on public.leaves for insert to authenticated
  with check (
    requested_by = (select auth.uid()) and
    student_id = (select auth.uid()) and
    ((select auth.jwt())->'app_metadata'->>'role') = 'student'
  );

-- payouts and payout-support tables: trainer sees only their own rows.
-- trainer slots: owner and founder only
drop policy if exists p_trainer_slots_owner on public.trainer_slots;
create policy p_trainer_slots_owner on public.trainer_slots for all to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer')
  with check (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_trainer_slots_founder on public.trainer_slots;
create policy p_trainer_slots_founder on public.trainer_slots for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

-- presence evidence: participants see their own rows, founder sees all
drop policy if exists p_presence_events_participant on public.presence_events;
create policy p_presence_events_participant on public.presence_events for select to authenticated
  using (
    user_id = (select auth.uid()) or
    ((select auth.jwt())->'app_metadata'->>'role') = 'founder' or
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.trainer_id = (select auth.uid())
    )
  );

drop policy if exists p_presence_snapshots_participant on public.presence_snapshots;
create policy p_presence_snapshots_participant on public.presence_snapshots for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'founder' or
    exists (
      select 1 from public.sessions s
      where s.id = session_id and
        (s.trainer_id = (select auth.uid()) or s.student_id = (select auth.uid()))
    )
  );

drop policy if exists p_payouts_founder on public.payouts;
create policy p_payouts_founder on public.payouts for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_payouts_trainer_select on public.payouts;
create policy p_payouts_trainer_select on public.payouts for select to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_payouts_no_students on public.payouts;
create policy p_payouts_no_students on public.payouts
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

drop policy if exists p_trainer_incidents_founder on public.trainer_incidents;
create policy p_trainer_incidents_founder on public.trainer_incidents for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_trainer_incidents_trainer_select on public.trainer_incidents;
create policy p_trainer_incidents_trainer_select on public.trainer_incidents
  for select to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_trainer_incidents_no_students on public.trainer_incidents;
create policy p_trainer_incidents_no_students on public.trainer_incidents
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

drop policy if exists p_attendance_bonus_founder on public.attendance_bonus_months;
create policy p_attendance_bonus_founder on public.attendance_bonus_months
  for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_attendance_bonus_trainer_select on public.attendance_bonus_months;
create policy p_attendance_bonus_trainer_select on public.attendance_bonus_months
  for select to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_attendance_bonus_no_students on public.attendance_bonus_months;
create policy p_attendance_bonus_no_students on public.attendance_bonus_months
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

drop policy if exists p_mvt_rankings_founder on public.mvt_rankings;
create policy p_mvt_rankings_founder on public.mvt_rankings for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_mvt_rankings_trainer_select on public.mvt_rankings;
create policy p_mvt_rankings_trainer_select on public.mvt_rankings for select to authenticated
  using (trainer_id = (select auth.uid()) and ((select auth.jwt())->'app_metadata'->>'role') = 'trainer');

drop policy if exists p_mvt_rankings_no_students on public.mvt_rankings;
create policy p_mvt_rankings_no_students on public.mvt_rankings
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') <> 'student')
  with check (((select auth.jwt())->'app_metadata'->>'role') <> 'student');

-- whatsapp_messages: founder-only inbox.
drop policy if exists p_whatsapp_founder on public.whatsapp_messages;
create policy p_whatsapp_founder on public.whatsapp_messages for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_whatsapp_founders_only on public.whatsapp_messages;
create policy p_whatsapp_founders_only on public.whatsapp_messages
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

-- support_escalations: founder-only, even when student_id matches the caller.
drop policy if exists p_support_founder on public.support_escalations;
create policy p_support_founder on public.support_escalations for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_support_founders_only on public.support_escalations;
create policy p_support_founders_only on public.support_escalations
  as restrictive for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

-- AI chat audit logs: founder reads only. Writes come from the Worker's
-- service-role key, so no insert policy is granted to browser roles.
drop policy if exists p_trainer_support_logs_founder_read on public.trainer_support_logs;
create policy p_trainer_support_logs_founder_read on public.trainer_support_logs
  for select to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_student_doubt_logs_founder_read on public.student_doubt_logs;
create policy p_student_doubt_logs_founder_read on public.student_doubt_logs
  for select to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

-- ---------------------------------------------------------------------------
-- Privileges. Everyone signed in gets table privileges; RLS is the filter.
-- Sensitive tables carry RESTRICTIVE student-deny policies above, and answer-key
-- columns are revoked at the column level so they cannot leak through RLS row
-- visibility. anon gets nothing, and the safe views are granted explicitly.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;

-- Signed-in Data API clients reach only the trainer sketch-sync table and the
-- safe student views. Every other table is written and read through the
-- Express service_role, so broad table grants would expose business data to
-- every account through PostgREST and pg_graphql.
revoke all on all tables in schema public from authenticated;
grant select, insert on public.quiz_canvas_strokes to authenticated;
grant select on public.student_quiz_questions, public.student_quiz_attempts,
  public.session_participant_names to authenticated;

-- Supabase applies default table grants to anon on new tables. No public page
-- talks to Postgres directly, so anon gets nothing. Presence evidence is
-- append-only from the Express service_role; clients may only read it.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke all on public.trainer_slots, public.presence_events,
  public.presence_snapshots, public.trainer_support_logs,
  public.student_doubt_logs from authenticated;
-- These tables are read/written only through the service_role. Keeping them
-- out of the authenticated Data/GraphQL API avoids exposing slot commitments,
-- raw presence evidence and AI chat transcripts to every signed-in account.

-- Answer-key columns are never readable or writable through the Data API by
-- anon/authenticated clients. Table-wide SELECT would override column grants,
-- so these two tables are granted at the column level only. The Express
-- service_role keeps full access and remains the only writer of answer keys.
revoke all on public.quiz_questions from public, anon, authenticated;
revoke all on public.quiz_attempts from public, anon, authenticated;
grant select (id, quiz_id, prompt, options, position, status, source,
              template_id) on public.quiz_questions to authenticated;
grant select (id, question_id, student_id, option_index, created_at)
  on public.quiz_attempts to authenticated;

revoke all on all tables in schema public from anon;
revoke all on public.trainer_notes, public.quiz_templates, public.quiz_drafts,
  public.quiz_questions, public.quiz_attempts, public.payouts,
  public.trainer_incidents, public.attendance_bonus_months, public.mvt_rankings,
  public.whatsapp_messages, public.support_escalations,
  public.trainer_support_logs, public.student_doubt_logs from anon;
revoke all on public.student_quiz_questions, public.student_quiz_attempts,
  public.session_participant_names from anon;

-- rls_auto_enable is an event-trigger function, not a client RPC. Closing its
-- EXECUTE privilege removes the anon/authenticated Data API surface flagged by
-- Supabase's security advisor without changing trigger behaviour.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
