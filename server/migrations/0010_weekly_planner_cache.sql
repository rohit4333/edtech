-- Auto-selected LMS weekly planners. No new table is needed: the service-only
-- public.mathify_records store already provides an immutable (collection, key)
-- primary key and a service_role-only grant. This migration records the three
-- collection contracts and keeps the Data API locked out.
--
-- weekly_planner_cache    key = planner:vN:<curriculumSlug>:<gradeSlug>
--                         data = promptVersion, seed, temperature, provider,
--                                generatedAt and the child-safe planner JSON.
-- weekly_planner_archive  key = <cacheKey>:archived:<timestamp>
--                         data = the prior immutable generation plus audit actor.
-- weekly_planner_pointer  key = <curriculumSlug>:<gradeSlug>
--                         data = active version and active cache key only.
--
-- Generated JSON is never updated in place. Regeneration archives the prior
-- record, writes a new version and moves the small pointer. Row-level access is
-- service-role-only; browser tokens receive no grants on these collections.

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'mathify_records' and c.relkind = 'r'
  ) then
    create table public.mathify_records (
      collection text not null,
      key text not null,
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (collection, key)
    );
  end if;
end $$;

alter table public.mathify_records enable row level security;
revoke all on public.mathify_records from public, anon, authenticated;
grant all on public.mathify_records to service_role;

comment on column public.mathify_records.data is
  'Service-only collections. Weekly planner collections: weekly_planner_cache, weekly_planner_archive, weekly_planner_pointer. No Data API exposure.';
