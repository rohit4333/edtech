-- Mathify schema — PostgreSQL / Supabase, single-file migration.
--
-- Student-safety model (important):
--   * Supabase signs every browser client in as the `authenticated` Postgres
--     role, so table GRANTs cannot distinguish a student from a trainer.
--     Students are denied sensitive base tables with RESTRICTIVE RLS policies
--     that test auth.jwt()->>'role', not with GRANTs alone. Row visibility is
--     always decided by auth.uid() / the session participant relationship.
--   * trainer_notes, quiz_drafts, quiz_templates and the answer-key columns of
--     quiz_questions / quiz_attempts are never SELECTable by students. Students
--     read quizzes only through `student_quiz_questions` and
--     `student_quiz_attempts`, which NULL out answer_index, explanation and
--     correct until a quiz_reveals row exists for that question.
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
  constraint users_role_check check (role in ('founder', 'trainer', 'student')),
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
  started_at timestamptz,
  ends_at timestamptz,
  elapsed_seconds integer not null default 0,
  constraint sessions_distinct_parties check (trainer_id <> student_id)
);

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
-- It carries both the live Agora channel fields and the finished playback
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
  mode text not null default 'agora',
  provider text not null default 'agora',
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
alter table public.recordings add column if not exists mode text not null default 'agora';
alter table public.recordings add column if not exists provider text not null default 'agora';
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
  constraint attendance_status_only_check check (status in ('present', 'absent', 'late'))
);

-- Drop the old four-value check (present/absent/no_show/late) on upgrades.
do $$
begin
  alter table public.attendance drop constraint if exists attendance_status_check;
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_status_only_check'
      and conrelid = 'public.attendance'::regclass
  ) then
    alter table public.attendance
      add constraint attendance_status_only_check
      check (status in ('present', 'absent', 'late'));
  end if;
end $$;

create table if not exists public.leaves (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.users(id),
  starts_on date not null,
  ends_on date not null,
  notice_hours integer not null,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected')),
  fine_code text,
  created_at timestamptz not null default now()
);

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
      check (role in ('founder', 'trainer', 'student'));
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
-- Safe student views.
-- Owned by the migration role (RLS is not applied inside these views), so the
-- WHERE clause is the boundary: only the signed-in student's own sessions are
-- visible, and answer material stays NULL until a reveal row exists.
-- ---------------------------------------------------------------------------

create or replace view public.student_quiz_questions
with (security_barrier = true) as
select
  q.id,
  q.quiz_id,
  q.prompt,
  q.options,
  q.hint,
  q.position,
  case
    when (auth.jwt()->>'role') = 'student'
     and exists (select 1 from public.quiz_reveals r where r.question_id = q.id)
     and exists (
       select 1 from public.quizzes z
       join public.sessions s on s.id = z.session_id
       where z.id = q.quiz_id and s.student_id = auth.uid()
     )
    then q.answer_index
  end as answer_index,
  case
    when (auth.jwt()->>'role') = 'student'
     and exists (select 1 from public.quiz_reveals r where r.question_id = q.id)
     and exists (
       select 1 from public.quizzes z
       join public.sessions s on s.id = z.session_id
       where z.id = q.quiz_id and s.student_id = auth.uid()
     )
    then q.explanation
  end as explanation
from public.quiz_questions q
join public.quizzes z on z.id = q.quiz_id
join public.sessions s on s.id = z.session_id
where s.student_id = auth.uid()
  and (auth.jwt()->>'role') = 'student'
  and q.status in ('approved', 'active');

create or replace view public.student_quiz_attempts
with (security_barrier = true) as
select
  a.id,
  a.question_id,
  a.student_id,
  a.option_index,
  a.created_at,
  case
    when (auth.jwt()->>'role') = 'student'
     and exists (select 1 from public.quiz_reveals r where r.question_id = a.question_id)
     and exists (
       select 1 from public.quiz_questions q
       join public.quizzes z on z.id = q.quiz_id
       join public.sessions s on s.id = z.session_id
       where q.id = a.question_id and s.student_id = auth.uid()
     )
    then a.correct
  end as correct
from public.quiz_attempts a
join public.quiz_questions q on q.id = a.question_id
join public.quizzes z on z.id = q.quiz_id
join public.sessions s on s.id = z.session_id
where a.student_id = auth.uid()
  and s.student_id = auth.uid()
  and (auth.jwt()->>'role') = 'student';

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
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_users_self_or_session_partner on public.users;
create policy p_users_self_or_session_partner on public.users for select to authenticated
  using (
    id = auth.uid()
    or (
      (auth.jwt()->>'role') = 'trainer'
      and exists (select 1 from public.sessions s
                  where s.trainer_id = auth.uid() and s.student_id = users.id)
    )
    or (
      (auth.jwt()->>'role') = 'student'
      and exists (select 1 from public.sessions s
                  where s.student_id = auth.uid() and s.trainer_id = users.id)
    )
  );

drop policy if exists p_users_update_self on public.users;
create policy p_users_update_self on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (auth.jwt()->>'role'));

-- trainer_profiles
drop policy if exists p_trainer_profiles_founder on public.trainer_profiles;
create policy p_trainer_profiles_founder on public.trainer_profiles for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_trainer_profiles_own on public.trainer_profiles;
create policy p_trainer_profiles_own on public.trainer_profiles for all to authenticated
  using (user_id = auth.uid() and (auth.jwt()->>'role') = 'trainer')
  with check (user_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

drop policy if exists p_trainer_profiles_student_view on public.trainer_profiles;
create policy p_trainer_profiles_student_view on public.trainer_profiles
  for select to authenticated
  using (
    (auth.jwt()->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.student_id = auth.uid() and s.trainer_id = user_id)
  );

-- student_profiles
drop policy if exists p_student_profiles_founder on public.student_profiles;
create policy p_student_profiles_founder on public.student_profiles for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_student_profiles_own on public.student_profiles;
create policy p_student_profiles_own on public.student_profiles for all to authenticated
  using (user_id = auth.uid() and (auth.jwt()->>'role') = 'student')
  with check (user_id = auth.uid() and (auth.jwt()->>'role') = 'student');

drop policy if exists p_student_profiles_trainer_view on public.student_profiles;
create policy p_student_profiles_trainer_view on public.student_profiles
  for select to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.trainer_id = auth.uid() and s.student_id = user_id)
  );

-- packs
drop policy if exists p_packs_founder on public.packs;
create policy p_packs_founder on public.packs for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_packs_student_select on public.packs;
create policy p_packs_student_select on public.packs for select to authenticated
  using (student_id = auth.uid() and (auth.jwt()->>'role') = 'student');

drop policy if exists p_packs_trainer_select on public.packs;
create policy p_packs_trainer_select on public.packs for select to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.trainer_id = auth.uid()
                  and s.student_id = packs.student_id)
  );

-- razorpay_orders
drop policy if exists p_razorpay_orders_founder on public.razorpay_orders;
create policy p_razorpay_orders_founder on public.razorpay_orders for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_razorpay_orders_student_select on public.razorpay_orders;
create policy p_razorpay_orders_student_select on public.razorpay_orders
  for select to authenticated
  using (student_id = auth.uid() and (auth.jwt()->>'role') = 'student');

-- payments
drop policy if exists p_payments_founder on public.payments;
create policy p_payments_founder on public.payments for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_payments_student_select on public.payments;
create policy p_payments_student_select on public.payments for select to authenticated
  using (student_id = auth.uid() and (auth.jwt()->>'role') = 'student');

-- sessions
drop policy if exists p_sessions_founder on public.sessions;
create policy p_sessions_founder on public.sessions for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_sessions_trainer on public.sessions;
create policy p_sessions_trainer on public.sessions for all to authenticated
  using (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer')
  with check (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

drop policy if exists p_sessions_student_select on public.sessions;
create policy p_sessions_student_select on public.sessions for select to authenticated
  using (student_id = auth.uid() and (auth.jwt()->>'role') = 'student');

-- lesson_pages
drop policy if exists p_lesson_pages_founder on public.lesson_pages;
create policy p_lesson_pages_founder on public.lesson_pages for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_lesson_pages_trainer on public.lesson_pages;
create policy p_lesson_pages_trainer on public.lesson_pages for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  );

drop policy if exists p_lesson_pages_student_select on public.lesson_pages;
create policy p_lesson_pages_student_select on public.lesson_pages
  for select to authenticated
  using (
    (auth.jwt()->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = auth.uid())
  );

-- trainer_notes: no student policy plus a restrictive denial.
drop policy if exists p_trainer_notes_founder on public.trainer_notes;
create policy p_trainer_notes_founder on public.trainer_notes for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_trainer_notes_trainer on public.trainer_notes;
create policy p_trainer_notes_trainer on public.trainer_notes for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.lesson_pages lp
      join public.sessions s on s.id = lp.session_id
      where lp.id = page_id and s.trainer_id = auth.uid()
    )
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.lesson_pages lp
      join public.sessions s on s.id = lp.session_id
      where lp.id = page_id and s.trainer_id = auth.uid()
    )
  );

drop policy if exists p_trainer_notes_no_students on public.trainer_notes;
create policy p_trainer_notes_no_students on public.trainer_notes
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

-- planner_items
drop policy if exists p_planner_items_founder on public.planner_items;
create policy p_planner_items_founder on public.planner_items for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_planner_items_trainer on public.planner_items;
create policy p_planner_items_trainer on public.planner_items for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  );

drop policy if exists p_planner_items_student_select on public.planner_items;
create policy p_planner_items_student_select on public.planner_items
  for select to authenticated
  using (
    (auth.jwt()->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = auth.uid())
  );

-- quiz_templates: trainer-visible, student-denied.
drop policy if exists p_quiz_templates_founder on public.quiz_templates;
create policy p_quiz_templates_founder on public.quiz_templates for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_quiz_templates_trainer_select on public.quiz_templates;
create policy p_quiz_templates_trainer_select on public.quiz_templates
  for select to authenticated
  using ((auth.jwt()->>'role') = 'trainer' and active);

drop policy if exists p_quiz_templates_no_students on public.quiz_templates;
create policy p_quiz_templates_no_students on public.quiz_templates
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

-- quizzes
drop policy if exists p_quizzes_founder on public.quizzes;
create policy p_quizzes_founder on public.quizzes for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_quizzes_trainer on public.quizzes;
create policy p_quizzes_trainer on public.quizzes for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  );

drop policy if exists p_quizzes_student_select on public.quizzes;
create policy p_quizzes_student_select on public.quizzes for select to authenticated
  using (
    (auth.jwt()->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = auth.uid())
  );

-- quiz_questions: answer key stays on the base table; students use the view.
drop policy if exists p_quiz_questions_founder on public.quiz_questions;
create policy p_quiz_questions_founder on public.quiz_questions for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_quiz_questions_trainer on public.quiz_questions;
create policy p_quiz_questions_trainer on public.quiz_questions for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = auth.uid()
    )
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = auth.uid()
    )
  );

drop policy if exists p_quiz_questions_no_students on public.quiz_questions;
create policy p_quiz_questions_no_students on public.quiz_questions
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

-- quiz_drafts: trainer/founder only.
drop policy if exists p_quiz_drafts_founder on public.quiz_drafts;
create policy p_quiz_drafts_founder on public.quiz_drafts for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_quiz_drafts_trainer on public.quiz_drafts;
create policy p_quiz_drafts_trainer on public.quiz_drafts for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = auth.uid()
    )
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quizzes z
      join public.sessions s on s.id = z.session_id
      where z.id = quiz_id and s.trainer_id = auth.uid()
    )
  );

drop policy if exists p_quiz_drafts_no_students on public.quiz_drafts;
create policy p_quiz_drafts_no_students on public.quiz_drafts
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

-- quiz_reveals: written by the session trainer; students read via the views.
drop policy if exists p_quiz_reveals_founder on public.quiz_reveals;
create policy p_quiz_reveals_founder on public.quiz_reveals for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_quiz_reveals_trainer on public.quiz_reveals;
create policy p_quiz_reveals_trainer on public.quiz_reveals for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = auth.uid()
    )
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = auth.uid()
    )
  );

-- quiz_attempts: base `correct` is never selectable by students; view only.
drop policy if exists p_quiz_attempts_founder on public.quiz_attempts;
create policy p_quiz_attempts_founder on public.quiz_attempts for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_quiz_attempts_trainer on public.quiz_attempts;
create policy p_quiz_attempts_trainer on public.quiz_attempts for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = auth.uid()
    )
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (
      select 1 from public.quiz_questions q
      join public.quizzes z on z.id = q.quiz_id
      join public.sessions s on s.id = z.session_id
      where q.id = question_id and s.trainer_id = auth.uid()
    )
  );

drop policy if exists p_quiz_attempts_no_students on public.quiz_attempts;
create policy p_quiz_attempts_no_students on public.quiz_attempts
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

-- board_strokes
drop policy if exists p_board_strokes_founder on public.board_strokes;
create policy p_board_strokes_founder on public.board_strokes for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_board_strokes_trainer on public.board_strokes;
create policy p_board_strokes_trainer on public.board_strokes for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  );

drop policy if exists p_board_strokes_student_select on public.board_strokes;
create policy p_board_strokes_student_select on public.board_strokes
  for select to authenticated
  using (
    (auth.jwt()->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = auth.uid())
  );

drop policy if exists p_board_strokes_no_student_writes on public.board_strokes;
create policy p_board_strokes_no_student_writes on public.board_strokes
  as restrictive for insert to authenticated
  with check ((auth.jwt()->>'role') <> 'student');

drop policy if exists p_board_strokes_no_student_updates on public.board_strokes;
create policy p_board_strokes_no_student_updates on public.board_strokes
  as restrictive for update to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

drop policy if exists p_board_strokes_no_student_deletes on public.board_strokes;
create policy p_board_strokes_no_student_deletes on public.board_strokes
  as restrictive for delete to authenticated
  using ((auth.jwt()->>'role') <> 'student');

-- quiz_canvas_strokes: participants may read, only trainer/founder may write.
drop policy if exists p_quiz_canvas_founder on public.quiz_canvas_strokes;
create policy p_quiz_canvas_founder on public.quiz_canvas_strokes for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_quiz_canvas_trainer on public.quiz_canvas_strokes;
create policy p_quiz_canvas_trainer on public.quiz_canvas_strokes for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  );

drop policy if exists p_quiz_canvas_student_select on public.quiz_canvas_strokes;
create policy p_quiz_canvas_student_select on public.quiz_canvas_strokes
  for select to authenticated
  using (
    (auth.jwt()->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = auth.uid())
  );

drop policy if exists p_quiz_canvas_no_student_insert on public.quiz_canvas_strokes;
create policy p_quiz_canvas_no_student_insert on public.quiz_canvas_strokes
  as restrictive for insert to authenticated
  with check ((auth.jwt()->>'role') <> 'student');

drop policy if exists p_quiz_canvas_no_student_update on public.quiz_canvas_strokes;
create policy p_quiz_canvas_no_student_update on public.quiz_canvas_strokes
  as restrictive for update to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

drop policy if exists p_quiz_canvas_no_student_delete on public.quiz_canvas_strokes;
create policy p_quiz_canvas_no_student_delete on public.quiz_canvas_strokes
  as restrictive for delete to authenticated
  using ((auth.jwt()->>'role') <> 'student');

-- recordings
drop policy if exists p_recordings_founder on public.recordings;
create policy p_recordings_founder on public.recordings for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_recordings_trainer on public.recordings;
create policy p_recordings_trainer on public.recordings for all to authenticated
  using (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  )
  with check (
    (auth.jwt()->>'role') = 'trainer'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.trainer_id = auth.uid())
  );

drop policy if exists p_recordings_student_select on public.recordings;
create policy p_recordings_student_select on public.recordings for select to authenticated
  using (
    (auth.jwt()->>'role') = 'student'
    and exists (select 1 from public.sessions s
                where s.id = session_id and s.student_id = auth.uid())
  );

-- attendance
drop policy if exists p_attendance_founder on public.attendance;
create policy p_attendance_founder on public.attendance for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_attendance_trainer on public.attendance;
create policy p_attendance_trainer on public.attendance for all to authenticated
  using (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer')
  with check (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

drop policy if exists p_attendance_student_select on public.attendance;
create policy p_attendance_student_select on public.attendance for select to authenticated
  using (student_id = auth.uid() and (auth.jwt()->>'role') = 'student');

-- leaves
drop policy if exists p_leaves_founder on public.leaves;
create policy p_leaves_founder on public.leaves for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_leaves_trainer on public.leaves;
create policy p_leaves_trainer on public.leaves for all to authenticated
  using (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer')
  with check (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

-- payouts and payout-support tables: trainer sees only their own rows.
drop policy if exists p_payouts_founder on public.payouts;
create policy p_payouts_founder on public.payouts for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_payouts_trainer_select on public.payouts;
create policy p_payouts_trainer_select on public.payouts for select to authenticated
  using (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

drop policy if exists p_payouts_no_students on public.payouts;
create policy p_payouts_no_students on public.payouts
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

drop policy if exists p_trainer_incidents_founder on public.trainer_incidents;
create policy p_trainer_incidents_founder on public.trainer_incidents for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_trainer_incidents_trainer_select on public.trainer_incidents;
create policy p_trainer_incidents_trainer_select on public.trainer_incidents
  for select to authenticated
  using (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

drop policy if exists p_trainer_incidents_no_students on public.trainer_incidents;
create policy p_trainer_incidents_no_students on public.trainer_incidents
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

drop policy if exists p_attendance_bonus_founder on public.attendance_bonus_months;
create policy p_attendance_bonus_founder on public.attendance_bonus_months
  for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_attendance_bonus_trainer_select on public.attendance_bonus_months;
create policy p_attendance_bonus_trainer_select on public.attendance_bonus_months
  for select to authenticated
  using (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

drop policy if exists p_attendance_bonus_no_students on public.attendance_bonus_months;
create policy p_attendance_bonus_no_students on public.attendance_bonus_months
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

drop policy if exists p_mvt_rankings_founder on public.mvt_rankings;
create policy p_mvt_rankings_founder on public.mvt_rankings for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_mvt_rankings_trainer_select on public.mvt_rankings;
create policy p_mvt_rankings_trainer_select on public.mvt_rankings for select to authenticated
  using (trainer_id = auth.uid() and (auth.jwt()->>'role') = 'trainer');

drop policy if exists p_mvt_rankings_no_students on public.mvt_rankings;
create policy p_mvt_rankings_no_students on public.mvt_rankings
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') <> 'student')
  with check ((auth.jwt()->>'role') <> 'student');

-- whatsapp_messages: founder-only inbox.
drop policy if exists p_whatsapp_founder on public.whatsapp_messages;
create policy p_whatsapp_founder on public.whatsapp_messages for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_whatsapp_founders_only on public.whatsapp_messages;
create policy p_whatsapp_founders_only on public.whatsapp_messages
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

-- support_escalations: founder-only, even when student_id matches the caller.
drop policy if exists p_support_founder on public.support_escalations;
create policy p_support_founder on public.support_escalations for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

drop policy if exists p_support_founders_only on public.support_escalations;
create policy p_support_founders_only on public.support_escalations
  as restrictive for all to authenticated
  using ((auth.jwt()->>'role') = 'founder')
  with check ((auth.jwt()->>'role') = 'founder');

-- ---------------------------------------------------------------------------
-- Privileges. Everyone signed in gets table privileges; RLS is the filter.
-- Sensitive tables additionally carry the RESTRICTIVE student-deny policies
-- above. anon gets nothing, and the safe views are granted explicitly.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.student_quiz_questions, public.student_quiz_attempts to authenticated;

revoke all on all tables in schema public from anon;
revoke all on public.trainer_notes, public.quiz_templates, public.quiz_drafts,
  public.quiz_questions, public.quiz_attempts, public.payouts,
  public.trainer_incidents, public.attendance_bonus_months, public.mvt_rankings,
  public.whatsapp_messages, public.support_escalations from anon;
revoke all on public.student_quiz_questions, public.student_quiz_attempts from anon;
