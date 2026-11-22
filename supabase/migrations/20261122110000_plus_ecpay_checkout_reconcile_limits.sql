-- #276 M6: atomic checkout admission and a durable, leased round-robin queue.
create index plus_ecpay_order_user_created on public.plus_membership_ecpay_order
  (user_id, environment, created_at desc);

create or replace function public.create_plus_ecpay_order(
  p_user_id uuid,
  p_plan_code text,
  p_environment text,
  p_consent_revision text
)
returns table (merchant_trade_no text, period_amount_twd integer, exec_times integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plus_membership_plan%rowtype;
  v_merchant_trade_no text;
  v_finance_policy_revision text;
begin
  -- Serialize admission for the same identity/environment across Edge instances.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_environment, 276));
  select p.* into v_plan
  from public.plus_membership_plan p
  where p.plan_code = p_plan_code
  for share;

  if not found or not v_plan.active then
    raise exception 'plus plan not active';
  end if;

  if exists (
    select 1 from public.plus_membership_ecpay_order o
    where o.user_id = p_user_id and o.environment = p_environment
      and o.status in ('active', 'cancel_requested')
  ) then
    raise exception 'plus ecpay order already active';
  end if;

  if exists (
    select 1 from public.plus_membership_ecpay_order o
    where o.user_id = p_user_id and o.environment = p_environment
      and o.created_at > now() - interval '60 seconds'
  ) or (
    select count(*) from public.plus_membership_ecpay_order o
    where o.user_id = p_user_id and o.environment = p_environment
      and o.created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'plus checkout rate limited';
  end if;
  if (
    select count(*) from public.plus_membership_ecpay_order o
    where o.user_id = p_user_id and o.environment = p_environment and o.status = 'pending'
  ) >= 3 then
    raise exception 'plus pending order limit reached';
  end if;

  -- M5 policy is empty until #107/#112 admits an exact offer/consent package.
  select revision into v_finance_policy_revision from public.plus_ecpay_finance_policy
    where environment = p_environment and plan_code = p_plan_code
      and consent_revision = p_consent_revision
    group by revision having count(distinct outcome) = 4
    order by max(approved_at) desc, revision desc limit 1;
  if not found then raise exception 'plus financial policy not admitted'; end if;

  loop
    v_merchant_trade_no := 'BJHP' || upper(substr(md5(gen_random_uuid()::text), 1, 16));
    exit when not exists (
      select 1 from public.plus_membership_ecpay_order o
      where o.merchant_trade_no = v_merchant_trade_no
    );
  end loop;

  merchant_trade_no := v_merchant_trade_no;
  period_amount_twd := v_plan.amount_minor / 100;
  exec_times := 99;

  insert into public.plus_membership_ecpay_order (
    merchant_trade_no, environment, user_id, plan_code,
    period_amount_twd, exec_times, consent_revision, finance_policy_revision
  ) values (
    merchant_trade_no, p_environment, p_user_id, p_plan_code,
    period_amount_twd, exec_times, p_consent_revision, v_finance_policy_revision
  );

  return next;
end;
$$;

alter table public.plus_membership_ecpay_order
  add column last_reconcile_claimed_at timestamptz,
  add column reconcile_lease_until timestamptz,
  add column reconcile_lease_token uuid;

create index plus_ecpay_order_reconcile_queue on public.plus_membership_ecpay_order
  (environment, last_reconcile_claimed_at nulls first, created_at, merchant_trade_no)
  where status in ('pending', 'active', 'cancel_requested');

create function public.claim_plus_ecpay_reconcile_order(p_environment text)
returns setof public.plus_membership_ecpay_order
language plpgsql security definer set search_path = public
as $$
begin
  if p_environment is null or p_environment not in ('stage', 'prod') then
    raise exception 'invalid ecpay environment';
  end if;
  return query
  with candidate as (
    select o.merchant_trade_no from public.plus_membership_ecpay_order o
    where o.environment = p_environment
      and o.status in ('pending', 'active', 'cancel_requested')
      and (o.reconcile_lease_until is null or o.reconcile_lease_until <= clock_timestamp())
      and (o.last_reconcile_claimed_at is null
           or o.last_reconcile_claimed_at <= clock_timestamp() - interval '60 seconds')
    order by o.last_reconcile_claimed_at nulls first, o.created_at, o.merchant_trade_no
    for update skip locked limit 1
  )
  update public.plus_membership_ecpay_order o
    set last_reconcile_claimed_at = clock_timestamp(),
        reconcile_lease_until = clock_timestamp() + interval '120 seconds',
        reconcile_lease_token = gen_random_uuid()
    from candidate c where o.merchant_trade_no = c.merchant_trade_no
    returning o.*;
end;
$$;

create function public.release_plus_ecpay_reconcile_order(p_merchant_trade_no text, p_lease_token uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.plus_membership_ecpay_order
  set reconcile_lease_until = null, reconcile_lease_token = null
  where merchant_trade_no = p_merchant_trade_no and reconcile_lease_token = p_lease_token;
  return found;
end;
$$;

revoke all on function public.claim_plus_ecpay_reconcile_order(text) from public, anon, authenticated;
revoke all on function public.release_plus_ecpay_reconcile_order(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_plus_ecpay_reconcile_order(text) to service_role;
grant execute on function public.release_plus_ecpay_reconcile_order(text, uuid) to service_role;
