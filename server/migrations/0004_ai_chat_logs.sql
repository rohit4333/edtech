-- Founder audit logs for the Cloudflare Workers AI chat features.
--
-- Data flow: the Worker (or the local Express bridge) calls Workers AI with a
-- sanitized question and, for the student bot, an in-memory maths image. It
-- writes only the sanitized prompt, safe reply and metadata here through the
-- service-role key. Images, answer keys, trainer notes and contact details are
-- never stored. Role checks read app_metadata, never user_metadata.
--
-- Supabase no longer auto-exposes new public tables to the Data API. These
-- tables are intentionally NOT granted to anon or authenticated; founders read
-- them through the Express service_role only.

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

comment on table public.trainer_support_logs is
  'Founder-only audit trail for Mathify Trainer Desk. No image bytes or contact data.';
comment on table public.student_doubt_logs is
  'Founder-only audit trail for Mathify Study Buddy. No image bytes or contact data.';

create index if not exists trainer_support_logs_created_at_idx
  on public.trainer_support_logs (created_at desc);
create index if not exists trainer_support_logs_actor_idx
  on public.trainer_support_logs (actor_id);
create index if not exists student_doubt_logs_created_at_idx
  on public.student_doubt_logs (created_at desc);
create index if not exists student_doubt_logs_actor_idx
  on public.student_doubt_logs (actor_id);

alter table public.trainer_support_logs enable row level security;
alter table public.student_doubt_logs enable row level security;

drop policy if exists p_trainer_support_logs_founder_read on public.trainer_support_logs;
create policy p_trainer_support_logs_founder_read on public.trainer_support_logs
  for select to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_student_doubt_logs_founder_read on public.student_doubt_logs;
create policy p_student_doubt_logs_founder_read on public.student_doubt_logs
  for select to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

revoke all on public.trainer_support_logs from anon, authenticated;
revoke all on public.student_doubt_logs from anon, authenticated;
grant all on public.trainer_support_logs, public.student_doubt_logs to service_role;
