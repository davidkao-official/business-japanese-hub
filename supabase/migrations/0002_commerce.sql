-- 0002_commerce.sql
-- Commerce ledger: catalog price seam + orders / payments / refunds / payment_events.
--
-- Contract: docs/payments/decision-record.md (§8 Money, §8.3 catalog seam, §12 data
-- model, §13 idempotency, §15 security); shared TS contract: src/lib/payments/contract.ts.
-- Operator reference: docs/payments/implementation-contract.md.
--
-- Design intent
-- -------------
-- Every table in this migration is SERVER-ONLY. There is intentionally NO client
-- (anon / authenticated) RLS policy and NO anon/authenticated table privilege:
-- the DB must never let an authenticated client read another user's order, or any
-- payment / refund / event / finance row. Only service_role (Edge Functions,
-- operator scripts, future provider callback verification) reaches these tables —
-- service_role bypasses RLS and keeps its Supabase-default table privileges.
--
-- `catalog` is the authoritative server-side price seam (§8.3): browser / anon /
-- authenticated can never read or write it. Its no-read boundary is two layers:
-- ① no anon/authenticated/PUBLIC privileges, ② RLS enabled with no client policy.
-- Only service_role SELECT is granted explicitly; the publish/operator script
-- (`scripts/update-catalog.ts`) upserts via service_role's default privileges.

-- ---------------------------------------------------------------------------
-- 1. catalog — authoritative server-side price seam (§8.3)
-- ---------------------------------------------------------------------------
create table if not exists public.catalog (
  -- content-model `Book.id`; NO FK — book metadata lives in the static bundle.
  book_id            text        primary key,
  slug               text        not null,
  currency           text        not null check (currency ~ '^[A-Z]{3}$'),
  -- Canonical Money.amount in minor units (integer; Number.MAX_SAFE_INTEGER cap).
  amount_minor       bigint      not null check (
    amount_minor >= 0 and amount_minor <= 9007199254740991
  ),
  -- Immutable published snapshot id (e.g. "keigo-essentials@e1-r1").
  published_revision text        not null,
  -- Release time of the published snapshot (checkout reads released_at <= now()).
  released_at        timestamptz not null,
  updated_at         timestamptz not null default now()
);

comment on table public.catalog is
  'Authoritative server-side price seam (decision-record §8.3). Read/written by service_role only; anon/authenticated have NO access.';

-- No-read boundary for browser / anon / authenticated: no privileges + RLS with no
-- client policy. REVOKE from PUBLIC too (belt-and-suspenders; no-op when absent).
revoke all on public.catalog from public;
revoke all on public.catalog from anon;
revoke all on public.catalog from authenticated;
alter table public.catalog enable row level security;
-- NOTE: deliberately NO `create policy` on catalog. RLS with zero policies means
-- even an accidental future GRANT to a client role exposes no rows.
-- service_role SELECT is the only explicit grant; service_role retains its
-- Supabase-default INSERT/UPDATE privileges used by scripts/update-catalog.ts.
grant select on public.catalog to service_role;

-- ---------------------------------------------------------------------------
-- 2. orders — one purchase intent; amount/currency/revision immutable
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id),
  -- Stable `Book.id` from the content model; not a DB FK (static bundle holds metadata).
  book_id            text        not null,
  -- Historical book title snapshot at purchase time (§12).
  item_name_snapshot text        not null,
  -- Immutable catalog snapshot id actually sold (§8.3).
  published_revision text        not null,
  -- Immutable canonical Money.amount (minor units).
  amount_minor       bigint      not null check (
    amount_minor >= 0 and amount_minor <= 9007199254740991
  ),
  currency           text        not null check (currency ~ '^[A-Z]{3}$'),
  status             text        not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'cancelled')),
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  refunded_at        timestamptz
);

comment on table public.orders is
  'Purchase intent ledger. amount_minor/currency/published_revision/item_name_snapshot are immutable after creation (orders_immutable_fields_check trigger); orchestration only updates status/paid_at/refunded_at.';

create index if not exists orders_user_idx on public.orders (user_id);

-- ---------------------------------------------------------------------------
-- 3. Orders immutability: block any change to the four locked fields.
--    Security-definer trigger function; orchestration may only touch
--    status / paid_at / refunded_at.
-- ---------------------------------------------------------------------------
create or replace function public.orders_immutable_fields_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_minor <> old.amount_minor
     or new.currency <> old.currency
     or new.published_revision <> old.published_revision
     or new.item_name_snapshot <> old.item_name_snapshot then
    raise exception
      'orders: amount_minor/currency/published_revision/item_name_snapshot are immutable after creation';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_immutable_fields_check on public.orders;
create trigger orders_immutable_fields_check
  before update on public.orders
  for each row
  execute function public.orders_immutable_fields_check();

-- SECURITY DEFINER trigger function: not an RPC endpoint, but Supabase default
-- privileges grant EXECUTE to anon/authenticated for new functions. Close every
-- client-reachable role; only service_role (which fires the trigger on its own
-- DML and retains EXECUTE via the explicit grant below) may invoke it.
revoke all on function public.orders_immutable_fields_check() from public;
revoke all on function public.orders_immutable_fields_check() from anon;
revoke all on function public.orders_immutable_fields_check() from authenticated;
grant execute on function public.orders_immutable_fields_check() to service_role;

-- ---------------------------------------------------------------------------
-- 4. payments — payment attempts; provider refs live here (MerchantTradeNo/TradeNo)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                       uuid        primary key default gen_random_uuid(),
  order_id                 uuid        not null references public.orders (id),
  -- Approved adapter only (ecpay today); widen as adapters are approved.
  provider                 text        not null check (provider in ('ecpay')),
  -- Provider merchant reference (ECPay MerchantTradeNo); unique per attempt, never reused.
  provider_merchant_ref    text        not null,
  -- Provider payment reference (ECPay TradeNo); null until known.
  provider_payment_ref     text,
  amount_minor             bigint      not null check (
    amount_minor >= 0 and amount_minor <= 9007199254740991
  ),
  currency                 text        not null check (currency ~ '^[A-Z]{3}$'),
  method                   text        not null default 'credit',
  status                   text        not null default 'created'
    check (status in ('created', 'pending', 'verification_pending', 'succeeded', 'failed', 'duplicate_success', 'refunded')),
  provider_status_code     text,
  -- Sanitized provider status message (log redaction; never raw secrets / card data).
  provider_status_message  text,
  created_at               timestamptz not null default now(),
  paid_at                  timestamptz,
  last_verified_at         timestamptz,
  provider_fee_amount_minor bigint,
  reconciliation_status    text
    check (reconciliation_status is null or reconciliation_status in ('matched', 'mismatch')),
  -- Idempotency: one attempt per (provider, provider_merchant_ref); one transaction
  -- per (provider, provider_payment_ref) once known (partial unique, §13).
  unique (provider, provider_merchant_ref)
);

comment on table public.payments is
  'Payment attempts. provider_merchant_ref is unique per provider; provider_payment_ref is unique per provider once known (partial unique index).';

create index if not exists payments_order_idx on public.payments (order_id);

-- Provider transaction idempotency: UNIQUE(provider, provider_payment_ref) when non-null.
create unique index if not exists payments_provider_payment_ref_uidx
  on public.payments (provider, provider_payment_ref)
  where provider_payment_ref is not null;

-- ---------------------------------------------------------------------------
-- 5. refunds — source of truth for refunds (§7); MVP full refund only
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id                    uuid        primary key default gen_random_uuid(),
  payment_id            uuid        not null references public.payments (id),
  provider              text        not null,
  provider_refund_ref   text,
  amount_minor          bigint      not null,
  currency              text        not null,
  status                text        not null default 'requested'
    check (status in ('requested', 'processing', 'succeeded', 'failed')),
  reason_code           text,
  requested_by          uuid        references auth.users (id),
  provider_status_code  text,
  requested_at          timestamptz not null default now(),
  completed_at          timestamptz
);

comment on table public.refunds is
  'Source of truth for refunds (decision-record §7). MVP full refund only; provider-confirmed refund lands here as status=succeeded.';

create index if not exists refunds_payment_idx on public.refunds (payment_id);

-- ---------------------------------------------------------------------------
-- 6. payment_events — reliability ledger (§12); UNIQUE(provider, event_fingerprint)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                    uuid        primary key default gen_random_uuid(),
  provider              text        not null,
  payment_id            uuid        references public.payments (id),
  provider_merchant_ref text        not null,
  -- SHA-256 of the canonical verified payload; idempotent callback receipt.
  event_fingerprint     text        not null,
  event_type            text        not null,
  signature_valid       boolean     not null,
  -- Allowlisted financial/status fields only — never a raw provider payload dump.
  sanitized_payload_json jsonb      not null,
  received_at           timestamptz not null default now(),
  processed_at          timestamptz,
  processing_result     text,
  unique (provider, event_fingerprint)
);

comment on table public.payment_events is
  'Reliability ledger for verified provider callbacks; UNIQUE(provider, event_fingerprint) makes duplicate callbacks a no-op.';

create index if not exists payment_events_payment_idx on public.payment_events (payment_id);

-- ---------------------------------------------------------------------------
-- 7. Server-only security posture for the whole commerce ledger.
--    Explicit per-table so the contract tests can assert each one.
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
revoke all on public.orders from public;
revoke all on public.orders from anon;
revoke all on public.orders from authenticated;
grant select, insert, update on public.orders to service_role;

alter table public.payments enable row level security;
revoke all on public.payments from public;
revoke all on public.payments from anon;
revoke all on public.payments from authenticated;
grant select, insert, update on public.payments to service_role;

alter table public.refunds enable row level security;
revoke all on public.refunds from public;
revoke all on public.refunds from anon;
revoke all on public.refunds from authenticated;
grant select, insert, update on public.refunds to service_role;

alter table public.payment_events enable row level security;
revoke all on public.payment_events from public;
revoke all on public.payment_events from anon;
revoke all on public.payment_events from authenticated;
grant select, insert, update on public.payment_events to service_role;
