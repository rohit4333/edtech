-- Mathify migration 0002 — persisted academic curriculum profile.
--
-- Academic fields only. This table intentionally has NO name, email, phone,
-- social handle or avatar column. The Cloudflare curriculum mapper reads only
-- curriculum / grade / language / school_chapter, so no personal detail can be
-- injected into a prompt even if the caller supplies extra fields.
--
-- Access model (app role always read from app_metadata, never user_metadata):
--   founder  -> all rows
--   student  -> SELECT own row
--   trainer  -> SELECT/UPDATE rows for students on their own 1-on-1 sessions
-- Writes from the Express service_role bypass RLS; the Data API role receives
-- column-level SELECT only, so no client can rewrite a school curriculum.

create table if not exists public.student_curriculum (
  student_id uuid primary key references public.users(id) on delete cascade,
  curriculum text not null,
  grade text not null,
  language text not null default 'English',
  school_chapter text,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  constraint student_curriculum_board_check check (
    curriculum in (
      'CBSE', 'ICSE', 'IB', 'IGCSE', 'Common Core',
      'British National', 'Ontario'
    )
  ),
  constraint student_curriculum_grade_check check (char_length(grade) between 1 and 40),
  constraint student_curriculum_language_check check (char_length(language) between 1 and 40),
  constraint student_curriculum_chapter_check check (
    school_chapter is null or char_length(school_chapter) between 1 and 200
  )
);

alter table public.student_curriculum enable row level security;

create index if not exists student_curriculum_updated_by_idx
  on public.student_curriculum (updated_by);

drop policy if exists p_student_curriculum_founder on public.student_curriculum;
create policy p_student_curriculum_founder on public.student_curriculum for all to authenticated
  using (((select auth.jwt())->'app_metadata'->>'role') = 'founder')
  with check (((select auth.jwt())->'app_metadata'->>'role') = 'founder');

drop policy if exists p_student_curriculum_own_select on public.student_curriculum;
create policy p_student_curriculum_own_select on public.student_curriculum
  for select to authenticated
  using (
    student_id = (select auth.uid())
    and ((select auth.jwt())->'app_metadata'->>'role') = 'student'
  );

drop policy if exists p_student_curriculum_trainer_select on public.student_curriculum;
create policy p_student_curriculum_trainer_select on public.student_curriculum
  for select to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.sessions s
      where s.student_id = student_curriculum.student_id
        and s.trainer_id = (select auth.uid())
    )
  );

drop policy if exists p_student_curriculum_trainer_update on public.student_curriculum;
create policy p_student_curriculum_trainer_update on public.student_curriculum
  for update to authenticated
  using (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.sessions s
      where s.student_id = student_curriculum.student_id
        and s.trainer_id = (select auth.uid())
    )
  )
  with check (
    ((select auth.jwt())->'app_metadata'->>'role') = 'trainer'
    and exists (
      select 1 from public.sessions s
      where s.student_id = student_curriculum.student_id
        and s.trainer_id = (select auth.uid())
    )
  );

-- Baseline grants everything to service_role. New tables must be explicitly
-- exposed after Supabase's 2026-04-28 change; we expose academic columns only.
revoke all on public.student_curriculum from public, anon, authenticated;
grant select (student_id, curriculum, grade, language, school_chapter, updated_at)
  on public.student_curriculum to authenticated;

-- Re-affirm the baseline's anon lockdown for this table.
revoke all on public.student_curriculum from anon;
