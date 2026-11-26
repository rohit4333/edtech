-- Close the student hint leak introduced by schema.sql drift.
-- The reviewed baseline (0001) never granted `hint` to authenticated clients
-- and never exposed it through `student_quiz_questions`. This migration restores
-- that contract on databases where the drifted view/grant was applied.
--
-- Hints remain trainer-owned until an explicit trainer grant releases them to
-- one student. This file is review-only until a human applies it with
-- DATABASE_URL and MATHIFY_MIGRATE_CONFIRM=apply.

revoke select (hint) on public.quiz_questions from authenticated;

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

grant select on public.student_quiz_questions to authenticated;
revoke all on public.student_quiz_questions from anon;
