-- Private Supabase Storage bucket for session recordings.
--
-- Object naming contract: <session-uuid>/<filename>, e.g.
--   00000000-0000-4000-8000-000000000000/masterclass.mp4
-- The first path segment is the session id. Uploads/writes stay service-role
-- only; browsers get signed URLs from the server. No anon policy is created.
-- Founder authorization reads app_metadata, never editable profile metadata.

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do update set public = false;

-- storage.objects already has RLS enabled in managed Supabase, and public
-- tables such as sessions are intentionally not granted to the Data API roles.
-- A SECURITY DEFINER helper returns only a boolean, so authenticated Storage
-- reads can be scoped to a session without exposing or granting sessions.
create or replace function public.can_read_recording(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id::text = split_part(object_name, '/', 1)
      and (
        s.student_id = auth.uid()
        or s.trainer_id = auth.uid()
        or coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'founder'
      )
  );
$$;

revoke all on function public.can_read_recording(text) from public, anon;
grant execute on function public.can_read_recording(text) to authenticated;

drop policy if exists p_recordings_session_read on storage.objects;

create policy p_recordings_session_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recordings'
    and public.can_read_recording(objects.name)
  );
