-- LiveKit-only presence and recording labels.
--
-- Agora transport has been removed. Databases created from the earlier baseline
-- still carry the legacy presence kind check and the `agora_uid` column, so this
-- migration renames the persisted evidence without discarding it. Fresh installs
-- already use these names in 0001_baseline.sql / schema.sql.

-- The old check rejects 'livekit_*' values, so drop it before relabelling rows.
alter table public.presence_events drop constraint if exists presence_events_kind_check;

update public.presence_events set kind = 'livekit_join' where kind = 'agora_join';
update public.presence_events set kind = 'livekit_leave' where kind = 'agora_leave';

-- Rename the legacy uid column only when it exists; a fresh install already has
-- participant_uid and must not fail on an absent agora_uid.
do $livekit_presence$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'presence_events'
      and column_name = 'agora_uid'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'presence_events'
      and column_name = 'participant_uid'
  ) then
    alter table public.presence_events rename column agora_uid to participant_uid;
  end if;
end $livekit_presence$;

alter table public.presence_events add constraint presence_events_kind_check
  check (kind in ('heartbeat', 'livekit_join', 'livekit_leave'));

update public.recordings set mode = 'livekit' where mode = 'agora';
update public.recordings set provider = 'livekit' where provider = 'agora';
