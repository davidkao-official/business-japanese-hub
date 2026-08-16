-- 0003_compliance_finance.sql
-- Entitlement migration (§9), refund/revoke audit columns, finance + compliance surfaces (#9/#25).
--
-- Contract: docs/payments/decision-record.md (§7 refund, §9 entitlement migration, §14 finance
-- roles/audit, §15 security, §17/#25 Japan tax-status boundary); docs/accounts-and-entitlement.md.
-- Shared TS contract: src/lib/payments/contract.ts (+ tax-config.ts for the Japan tax gate semantics).
-- Operator reference: docs/payments/implementation-contract.md.

-- ---------------------------------------------------------------------------
-- 1. book_entitlement — provider-neutral target shape (§9). No destructive ops.
-- ---------------------------------------------------------------------------

-- Source order/payment reference (provider-neutral); nullable first, FK to orders (created in 0002).
alter table public.book_entitlement
  add column if not exists source_order_id uuid references public.orders (id);

-- Active/revoked lifecycle; existing grants become 'active'.
alter table public.book_entitlement
  add column if not exists status text not null default 'active'
    check (status in ('active', 'revoked'));

alter table public.book_entitlement
  add column if not exists revoked_at timestamptz;

alter table public.book_entitlement
  add column if not exists revocation_reason text;

-- Backfill (the NOT NULL DEFAULT above already backfills; this is explicit + documents intent).
update public.book_entitlement set status = 'active' where status is null;

-- Relax the provider CHECK to a provider-neutral form: keeps 'manual'/'ecpay' valid and adds the
-- known future provider placeholders, so invalid values still fail at the DB (§9.3).
alter table public.book_entitlement drop constraint if exists book_entitlement_provider_check;
alter table public.book_entitlement
  add constraint book_entitlement_provider_check
  check (provider in ('manual', 'ecpay', 'newebpay', 'stripe', 'paypal'));

-- ---------------------------------------------------------------------------
-- 2. grant_entitlement — recreate with the extended signature (security preserved).
-- ---------------------------------------------------------------------------
-- The argument list changes (4 -> 8 args), which is a NEW function identity in Postgres, so the
-- old 4-arg function is dropped first to avoid leaving a stale write point behind.
drop function if exists public.grant_entitlement(uuid, text, text, text);

create or replace function public.grant_entitlement(
  p_user_id           uuid,
  p_book_id           text,
  p_provider          text,
  p_provider_ref      text        default null,
  p_source_order_id   uuid        default null,
  p_status            text        default 'active',
  p_revoked_at        timestamptz default null,
  p_revocation_reason text        default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.book_entitlement
    (user_id, book_id, provider, provider_ref, source_order_id, status, revoked_at, revocation_reason)
  values
    (p_user_id, p_book_id, p_provider, p_provider_ref, p_source_order_id,
     coalesce(p_status, 'active'), p_revoked_at, p_revocation_reason)
  on conflict (user_id, book_id) do update
    set provider          = excluded.provider,
        provider_ref      = case when excluded.provider_ref is not null
                                 then excluded.provider_ref
                                 else book_entitlement.provider_ref end,
        source_order_id   = case when excluded.source_order_id is not null
                                 then excluded.source_order_id
                                 else book_entitlement.source_order_id end,
        status            = excluded.status,
        revoked_at        = excluded.revoked_at,
        revocation_reason = excluded.revocation_reason,
        granted_at        = case when excluded.provider_ref is not null
                                 then now()
                                 else book_entitlement.granted_at end;
$$;

-- Conflict behavior (ON CONFLICT (user_id, book_id) DO UPDATE), documented:
--   * `provider` is always set to the incoming grant source (matches the historical 4-arg re-grant).
--   * `status` / `revoked_at` / `revocation_reason` are ALWAYS applied from the incoming call, so a
--     revocation and a revoked->active reactivation both work.
--   * `provider_ref` / `source_order_id` / `granted_at` are refreshed ONLY when the incoming call
--     supplies a non-NULL `provider_ref` — the "legitimate refresh" signal. A pure status flip (e.g.
--     manual reactivation) passes NULL and preserves existing provenance. This is defense in depth:
--     decision-record §13 already guarantees orchestration calls grant ONLY for the FIRST qualifying
--     successful payment (duplicate_success never calls grant), so a stray duplicate can never clobber
--     granted_at / provider_ref / source_order_id here either.

-- Postgres grants EXECUTE to PUBLIC by default; close every client-reachable role and keep the write
-- point reachable only by service_role (operator / future provider callback verification).
revoke all on function public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text) from public;
revoke all on function public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text) from authenticated;
grant execute on function public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. order_compliance — Order-linked immutable compliance evidence (#9 + #25)
-- ---------------------------------------------------------------------------
create table if not exists public.order_compliance (
  id                   uuid        primary key default gen_random_uuid(),
  order_id             uuid        not null references public.orders (id),
  jurisdiction         text        not null check (jurisdiction in ('TW', 'JP')),
  locale               text        not null,
  notice_version       text        not null,
  consent_version      text        not null,
  consent_granted      boolean     not null,
  notice_text_snapshot text        not null,
  consent_text_snapshot text       not null,
  consent_timestamp    timestamptz not null,
  created_at           timestamptz not null default now(),
  -- One compliance evidence record per order.
  unique (order_id)
);

comment on table public.order_compliance is
  'Order-linked immutable compliance evidence (notice/consent snapshots), persisted in the same transaction as Order creation (#25).';

-- Server-only (immutable evidence; write path is the checkout Edge Function via service_role).
alter table public.order_compliance enable row level security;
revoke all on public.order_compliance from public;
revoke all on public.order_compliance from anon;
revoke all on public.order_compliance from authenticated;
grant select, insert on public.order_compliance to service_role;

-- ---------------------------------------------------------------------------
-- 4. finance_roles — server-enforced finance access (§14)
-- ---------------------------------------------------------------------------
create table if not exists public.finance_roles (
  user_id uuid not null references auth.users (id),
  role    text not null check (role in ('finance_viewer', 'finance_admin')),
  primary key (user_id, role)
);

comment on table public.finance_roles is
  'Server-enforced finance role grants (finance_viewer / finance_admin). Source of truth for the finance Edge Function authorization; never trust a client-claimed role.';

-- Server-only; the finance Edge Function reads roles via service_role.
alter table public.finance_roles enable row level security;
revoke all on public.finance_roles from public;
revoke all on public.finance_roles from anon;
revoke all on public.finance_roles from authenticated;
grant select on public.finance_roles to service_role;

-- ---------------------------------------------------------------------------
-- 5. admin_audit_log — operator finance actions (§14)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  actor        uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    text not null,
  before_state jsonb,
  after_state  jsonb,
  created_at   timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Audit trail for finance/operator actions (refund requests, reconciliation overrides). before/after state captured for reversibility (§14).';

-- Server-only (finance_admin writes via service_role).
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public;
revoke all on public.admin_audit_log from anon;
revoke all on public.admin_audit_log from authenticated;
grant select, insert on public.admin_audit_log to service_role;

-- ---------------------------------------------------------------------------
-- 6. platform_tax_config — Japan consumption-tax status boundary (#25; fail-closed)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_tax_config (
  id         bigint generated always as identity primary key,
  key        text        not null unique,
  value      text        not null,
  updated_at timestamptz not null default now()
);

comment on table public.platform_tax_config is
  'Platform configuration boundary. japan_consumption_tax_status defaults to "unresolved" (fail-closed: never apply consumption tax until explicitly resolved to taxable/exempt).';

-- Seed: default unresolved; only taxable | exempt resolves it. The seed never sets taxable.
insert into public.platform_tax_config (key, value)
values ('japan_consumption_tax_status', 'unresolved')
on conflict (key) do nothing;

-- Server-only (fail-closed: clients must not read/override the authoritative status).
alter table public.platform_tax_config enable row level security;
revoke all on public.platform_tax_config from public;
revoke all on public.platform_tax_config from anon;
revoke all on public.platform_tax_config from authenticated;
grant select, insert, update on public.platform_tax_config to service_role;
