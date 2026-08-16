-- 0005_compliance_snapshot.sql
-- Immutable consumer-jurisdiction + Japan tax-status snapshot on the Order (#25 remediation).
--
-- Reviewer findings (#27): (1) consumer jurisdiction must NOT be derived from the
-- UI locale; (2) Japan tax treatment must NOT be derived from currency or a
-- client-side DEFAULT_TAX_CONFIG. This migration freezes the authoritative
-- consumer jurisdiction + Japan consumption-tax status on the Order row at
-- creation, so:
--   * currency/provider never determine jurisdiction or tax treatment;
--   * an Order created for a JP consumer always carries the server-authoritative
--     platform_tax_config value AT PURCHASE;
--   * a later operator change to platform_tax_config can never rewrite a
--     historical order's snapshot (historical receipts keep their semantics).
--
-- Shared TS contract: src/lib/payments/contract.ts (Jurisdiction /
-- ResolvedJurisdiction / OrderComplianceSnapshot / OrderStatusResponse.compliance).
-- Operator reference: docs/payments/implementation-contract.md.

-- ---------------------------------------------------------------------------
-- 1. orders — immutable jurisdiction + Japan tax-status snapshot.
--    `unresolved` jurisdiction is the fail-closed default and is only ever
--    present on pre-launch backfilled rows; the checkout Edge Function creates
--    orders only after a resolved jurisdiction + (for JP) resolved tax status.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists jurisdiction text;
alter table public.orders add column if not exists japan_tax_status_snapshot text;

-- Fail-closed backfill for any pre-existing rows (pre-first-sale: none expected).
update public.orders set jurisdiction = 'unresolved' where jurisdiction is null;
update public.orders set japan_tax_status_snapshot = 'unresolved' where japan_tax_status_snapshot is null;

alter table public.orders alter column jurisdiction set not null;
alter table public.orders alter column japan_tax_status_snapshot set not null;

alter table public.orders drop constraint if exists orders_jurisdiction_check;
alter table public.orders add constraint orders_jurisdiction_check
  check (jurisdiction in ('TW', 'JP', 'unresolved'));
alter table public.orders drop constraint if exists orders_japan_tax_status_snapshot_check;
alter table public.orders add constraint orders_japan_tax_status_snapshot_check
  check (japan_tax_status_snapshot in ('unresolved', 'taxable', 'exempt'));

-- ---------------------------------------------------------------------------
-- 2. Extend the immutability trigger to lock the compliance snapshot too, so a
--    later platform_tax_config change can never rewrite an order's snapshot.
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
     or new.item_name_snapshot <> old.item_name_snapshot
     or new.jurisdiction <> old.jurisdiction
     or new.japan_tax_status_snapshot <> old.japan_tax_status_snapshot then
    raise exception
      'orders: amount_minor/currency/published_revision/item_name_snapshot/jurisdiction/japan_tax_status_snapshot are immutable after creation';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_immutable_fields_check on public.orders;
create trigger orders_immutable_fields_check
  before update on public.orders
  for each row
  execute function public.orders_immutable_fields_check();

comment on table public.orders is
  'Purchase intent ledger. amount_minor/currency/published_revision/item_name_snapshot/jurisdiction/japan_tax_status_snapshot are immutable after creation (orders_immutable_fields_check trigger); orchestration only updates status/paid_at/refunded_at.';
