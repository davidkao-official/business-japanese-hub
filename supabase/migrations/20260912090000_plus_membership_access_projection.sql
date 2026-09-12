-- #139: provider-neutral, server-authoritative Plus membership projection.
-- This is separate from historical book_entitlement ownership records.

create table public.plus_membership_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  membership_status text not null,
  current_period_end timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint plus_membership_access_status_bounded check (
    membership_status in ('active', 'past_due', 'pending', 'canceled', 'expired', 'revoked')
  )
);

comment on table public.plus_membership_access is
  'Server-authoritative provider-neutral projection consumed by proprietary Plus delivery. Not a payment or book-entitlement ledger.';

alter table public.plus_membership_access enable row level security;
revoke all on public.plus_membership_access from public;
revoke all on public.plus_membership_access from anon;
revoke all on public.plus_membership_access from authenticated;
grant select, insert, update on public.plus_membership_access to service_role;

create or replace function public.plus_membership_access_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.plus_membership_access_set_updated_at() from public;
revoke all on function public.plus_membership_access_set_updated_at() from anon;
revoke all on function public.plus_membership_access_set_updated_at() from authenticated;
grant execute on function public.plus_membership_access_set_updated_at() to service_role;

create trigger plus_membership_access_set_updated_at
before update on public.plus_membership_access
for each row execute function public.plus_membership_access_set_updated_at();
