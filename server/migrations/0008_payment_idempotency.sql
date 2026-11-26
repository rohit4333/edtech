-- Review-only idempotency hardening for Razorpay pack credits.
--
-- The service writes today through the service-only mathify_records store from
-- 0003. That store already has a primary key on (collection, key), which the
-- live adapter uses as the payment-identity claim. This migration makes the
-- contract explicit and adds dedicated payment/order-credit relations for a
-- future normalized adapter. Every statement is repeatable; apply requires
-- DATABASE_URL and MATHIFY_MIGRATE_CONFIRM=apply after human review.
--
-- No anon or authenticated grant is created. RLS is enabled on both new
-- relations and no client policy is added: only the service_role holds the
-- secret key that can write them. If a founder read policy is ever added, its
-- role check must read auth.jwt()->'app_metadata'->>'role'.

create table if not exists public.mathify_razorpay_payments (
  payment_id text primary key,
  order_id text not null unique,
  student_id text not null,
  amount integer not null,
  currency text not null,
  sessions integer not null,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mathify_razorpay_payments enable row level security;
revoke all on public.mathify_razorpay_payments from public, anon, authenticated;
grant all on public.mathify_razorpay_payments to service_role;

create table if not exists public.mathify_razorpay_order_credits (
  order_id text primary key,
  payment_id text not null unique
    references public.mathify_razorpay_payments (payment_id),
  student_id text not null,
  sessions integer not null,
  credited_at timestamptz not null default now()
);

alter table public.mathify_razorpay_order_credits enable row level security;
revoke all on public.mathify_razorpay_order_credits from public, anon, authenticated;
grant all on public.mathify_razorpay_order_credits to service_role;

-- Defensive indexes on the JSONB record store the current adapter uses. Each
-- payment key may exist once, each order may carry a credited state once, and
-- no two credited orders may point at the same payment. Partial indexes keep
-- uncredited/created orders free to be retried.
create unique index if not exists mathify_records_payment_identity_uidx
  on public.mathify_records (key)
  where collection = 'payments';

create unique index if not exists mathify_records_credited_order_uidx
  on public.mathify_records (key)
  where collection = 'razorpay_orders' and data->>'status' = 'credited';

create unique index if not exists mathify_records_credited_payment_uidx
  on public.mathify_records ((data->>'paymentId'))
  where collection = 'razorpay_orders' and data->>'status' = 'credited';
