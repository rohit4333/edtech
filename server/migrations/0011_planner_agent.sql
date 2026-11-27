-- Planner Agent desk. One additional staff identity with its own credentials.
-- It shares the founder's planner view across all subjects, but has no people,
-- payment, payout or policy powers. It cannot replace a founder-authored plan;
-- it files a suggestion that only the founder can accept.
--
-- No new table is needed. Both the identity and the suggestions live in the
-- service-only public.mathify_records store introduced by 0010:
--
--   users                    key = user id, data = profile + salted password
--   planner_agent_suggestion key = suggestion id, data = target + proposed plan
--
-- The role check is widened only where the normalized users relation exists;
-- live authentication reads the service-only record store, not a browser table.

do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'users' and c.relkind = 'r'
  ) then
    alter table public.users drop constraint if exists users_role_check;
    alter table public.users add constraint users_role_check
      check (role in ('founder', 'trainer', 'student', 'relationship_manager', 'planner_agent'));
  end if;
end $$;

alter table public.mathify_records enable row level security;
revoke all on public.mathify_records from public, anon, authenticated;
grant all on public.mathify_records to service_role;

comment on column public.mathify_records.data is
  'Service-only collections. Includes weekly planner records and planner_agent_suggestion proposals. No Data API exposure.';
