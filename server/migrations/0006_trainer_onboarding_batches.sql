-- Trainer onboarding and enrollment batches. Service-only JSON records.
-- The Data API receives no anon/authenticated grants. Role checks in RLS use
-- auth.jwt()->'app_metadata'->>'role' only.

create table if not exists public.mathify_records (
  collection text not null,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, key)
);

alter table public.mathify_records enable row level security;
revoke all on public.mathify_records from public, anon, authenticated;
grant all on public.mathify_records to service_role;

-- batch: one student, at most one trainer, strictly 1-on-1.
-- trainer_onboarding: locked KYC identity + documents; trainer-editable personal/bank.
-- trainer_onboarding_correction: append-only founder audit, never updated or deleted.
-- trainer_kyc_document: image metadata only in live mode. Bytes belong in the
-- private Supabase Storage bucket `trainer-kyc`; never expose that bucket to anon.
-- Sessions created by allotment use the existing service-only sessions collection.

comment on column public.mathify_records.data is
  'Collections: batch, trainer_onboarding, trainer_onboarding_correction, trainer_kyc_document. No Data API exposure.';
