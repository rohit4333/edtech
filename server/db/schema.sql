-- Mathify Phase 1 schema. Target: PostgreSQL / Supabase.
-- The Express API is the only writer of quiz_answers, trainer_notes and board strokes.
-- Student-facing SELECTs must never join trainer_notes, quiz_drafts, or
-- quiz_questions.answer_index / explanation before the trainer reveals them.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null check (role in ('founder', 'trainer', 'student')),
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  title text,
  grade text,
  created_at timestamptz not null default now()
);

create table if not exists trainer_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  pay_per_session numeric(8,2) not null default 300,
  max_hours_per_day smallint not null default 6,
  max_sessions_per_day smallint not null default 6,
  active boolean not null default true
);

create table if not exists student_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  mastery smallint not null default 0 check (mastery between 0 and 100),
  streak smallint not null default 0,
  batch text
);

create table if not exists packs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id),
  label text not null,
  total_sessions smallint not null,
  remaining_sessions smallint not null,
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  refundable boolean not null default false,
  payment_ref text
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  trainer_id uuid not null references users(id),
  student_id uuid not null references users(id),
  pack_id uuid references packs(id),
  title text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  current_page smallint not null default 1,
  started_at timestamptz,
  ends_at timestamptz,
  elapsed_seconds integer not null default 0,
  constraint one_trainer_per_session check (trainer_id is not null),
  constraint one_student_per_session check (student_id is not null)
);

-- Strict 1:1: a student cannot have two live sessions at once.
create unique index if not exists one_live_student_session
  on sessions (student_id) where status = 'live';

create table if not exists lesson_pages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  page smallint not null,
  title text not null,
  eyebrow text,
  prompt text not null,
  sketch_label text,
  unique (session_id, page)
);

-- Separate table on purpose: student SELECTs never touch it.
create table if not exists trainer_notes (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references lesson_pages(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists planner_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  position smallint not null default 0
);

create table if not exists quiz_templates (
  id text primary key,
  objective text not null,
  difficulty text not null default 'core',
  variant_count smallint not null default 0,
  active boolean not null default true
);

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  status text not null default 'ready' check (status in ('ready', 'live', 'ended')),
  phase text not null default 'draft' check (phase in ('draft', 'answering', 'awaiting_reveal', 'revealed', 'reteach', 'recheck', 'complete')),
  current_question_id uuid,
  started_at timestamptz
);

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  answer_index smallint not null,
  hint text,
  explanation text not null,
  position smallint not null default 0,
  source text not null default 'template' check (source in ('template', 'ai_draft', 'manual')),
  template_id text references quiz_templates(id),
  status text not null default 'active' check (status in ('draft', 'approved', 'active', 'retired'))
);

create table if not exists quiz_drafts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  template_id text references quiz_templates(id),
  prompt text not null,
  options jsonb not null,
  answer_index smallint not null,
  hint text,
  explanation text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists quiz_reveals (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  revealed_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  student_id uuid not null references users(id),
  option_index smallint not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists board_strokes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  seq bigint not null,
  page smallint not null,
  tool text not null check (tool in ('pen', 'marker', 'eraser')),
  color text not null,
  points jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  provider text not null default 'agora',
  url text not null,
  duration_seconds integer not null default 0,
  ready_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  trainer_id uuid not null references users(id),
  student_id uuid not null references users(id),
  status text not null check (status in ('present', 'absent', 'no_show', 'late')),
  marked_at timestamptz not null default now()
);

create table if not exists leaves (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references users(id),
  starts_on date not null,
  ends_on date not null,
  notice_hours integer not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  fine_code text,
  created_at timestamptz not null default now()
);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references users(id),
  period_start date not null,
  period_end date not null,
  session_count smallint not null default 0,
  hours numeric(6,2) not null default 0,
  amount numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid'))
);

-- Suggested Supabase RLS policy names:
-- trainer_select_own_session: trainer_id = auth.uid()
-- student_select_own_session: student_id = auth.uid()
-- no_student_trainer_notes: no policy for students on trainer_notes
-- no_student_answer_key: expose answer_index/explanation only when a quiz_reveals row exists
-- no_student_quiz_drafts: no policy for students on quiz_drafts or quiz_templates
