begin;

select plan(21);

select has_function(
  'public', 'request_full_refund', array['uuid','uuid','text'],
  'atomic refund-request RPC exists'
);
select has_function(
  'public', 'finalize_refund_success_audited',
  array['uuid','uuid','text','text','timestamp with time zone','uuid'],
  'audited authoritative refund finalizer exists'
);
select ok(
  not has_function_privilege('anon', 'public.request_full_refund(uuid,uuid,text)', 'execute'),
  'anon cannot request refunds directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.request_full_refund(uuid,uuid,text)', 'execute'),
  'authenticated users cannot request refunds directly'
);
select ok(
  has_function_privilege('service_role', 'public.request_full_refund(uuid,uuid,text)', 'execute'),
  'service_role can request refunds'
);
select ok(
  not has_function_privilege('authenticated', 'public.finalize_refund_success_audited(uuid,uuid,text,text,timestamptz,uuid)', 'execute'),
  'authenticated users cannot assert refund success'
);
select ok(to_regclass('public.refunds_payment_uidx') is not null,
  'the database permits only one full-refund fact per Payment');
select ok(to_regclass('public.refunds_provider_refund_ref_uidx') is not null,
  'provider refund references are unique per provider');

insert into auth.users (id, aud, role, email)
values ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'refund@example.com');

insert into public.orders (
  id, user_id, book_id, item_name_snapshot, published_revision,
  amount_minor, currency, status, jurisdiction, japan_tax_status_snapshot,
  customer_email_snapshot, customer_locale_snapshot
) values
  (
    '71000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'refund-book', 'Refund Book', 'refund-book@r1', 1999, 'USD', 'paid',
    'TW', 'unresolved', 'refund@example.com', 'en'
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    'failed-book', 'Failed Book', 'failed-book@r1', 1999, 'USD', 'pending',
    'TW', 'unresolved', 'refund@example.com', 'en'
  ),
  (
    '71000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000001',
    'rollback-book', 'Rollback Book', 'rollback-book@r1', 1999, 'USD', 'paid',
    'TW', 'unresolved', 'refund@example.com', 'en'
  );

insert into public.payments (
  id, order_id, provider, provider_merchant_ref, amount_minor, currency, status
) values
  (
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'paypal', 'REFUND-REQUEST', 1999, 'USD', 'succeeded'
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002',
    'paypal', 'FAILED-REQUEST', 1999, 'USD', 'failed'
  ),
  (
    '72000000-0000-0000-0000-000000000003',
    '71000000-0000-0000-0000-000000000003',
    'paypal', 'ROLLBACK-REQUEST', 1999, 'USD', 'succeeded'
  );

select is(
  public.request_full_refund(
    '72000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'buyer_request'
  )->>'outcome',
  'created'::text,
  'the first request creates the full-refund fact atomically'
);
select is(
  (select count(*) from public.refunds where payment_id = '72000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the request creates exactly one Refund'
);
select is(
  (select count(*) from public.admin_audit_log
    where action = 'refund.requested'
      and entity_id = (
        select id::text from public.refunds
         where payment_id = '72000000-0000-0000-0000-000000000001'
      )),
  1::bigint,
  'the request and its audit evidence share the Refund identity'
);
select is(
  public.request_full_refund(
    '72000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'replay'
  )->>'outcome',
  'existing'::text,
  'a retry returns the existing Refund instead of dispatching another one'
);
select results_eq(
  $$ select count(*)::bigint, (select count(*) from public.admin_audit_log where action = 'refund.requested')::bigint
       from public.refunds where payment_id = '72000000-0000-0000-0000-000000000001' $$,
  $$ values (1::bigint, 1::bigint) $$,
  'a retry creates neither a duplicate Refund nor duplicate audit evidence'
);
select is(
  public.request_full_refund(
    '72000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    'not_paid'
  )->>'outcome',
  'not_refundable'::text,
  'a failed Payment cannot enter the refund pipeline'
);

create function pg_temp.reject_refund_request_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'refund.requested' and new.entity_id is not null then
    raise exception 'injected audit failure';
  end if;
  return new;
end;
$$;
create trigger reject_refund_request_audit
  before insert on public.admin_audit_log
  for each row execute function pg_temp.reject_refund_request_audit();

select throws_ok(
  $$ select public.request_full_refund(
    '72000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000001',
    'inject_failure'
  ) $$,
  'P0001',
  'injected audit failure',
  'an audit failure aborts the whole refund request'
);
select is(
  (select count(*) from public.refunds where payment_id = '72000000-0000-0000-0000-000000000003'),
  0::bigint,
  'an audit failure leaves no half-created Refund'
);

select lives_ok(
  $$ update public.refunds
        set status = 'succeeded', completed_at = '2026-08-16T12:00:00Z'
      where payment_id = '72000000-0000-0000-0000-000000000001' $$,
  'an open Refund may advance to authoritative success'
);
select throws_ok(
  $$ update public.refunds set status = 'processing'
      where payment_id = '72000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'refunds: succeeded status is terminal',
  'a stale writer cannot downgrade succeeded to processing'
);
select throws_ok(
  $$ update public.refunds set status = 'failed'
      where payment_id = '72000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'refunds: succeeded status is terminal',
  'a stale writer cannot downgrade succeeded to failed'
);

insert into public.refunds (
  id, payment_id, provider, amount_minor, currency, status, requested_by
) values (
  '73000000-0000-0000-0000-000000000003',
  '72000000-0000-0000-0000-000000000003',
  'paypal', 1999, 'USD', 'failed',
  '70000000-0000-0000-0000-000000000001'
);
select public.grant_entitlement(
  '70000000-0000-0000-0000-000000000001',
  'rollback-book', 'paypal', 'CAPTURE-RECOVERED',
  '71000000-0000-0000-0000-000000000003'
);
select throws_ok(
  $$ update public.refunds set status = 'processing'
      where id = '73000000-0000-0000-0000-000000000003' $$,
  'P0001',
  'refunds: failed status cannot return to an open state',
  'a failed Refund cannot re-enter the automatic retry queue'
);
select is(
  public.finalize_refund_success_audited(
    '73000000-0000-0000-0000-000000000003', null,
    'REFUND-RECOVERED', 'COMPLETED', '2026-08-16T12:05:00Z',
    '70000000-0000-0000-0000-000000000001'
  )->>'refund_status',
  'succeeded'::text,
  'authoritative finalization may repair failed to succeeded'
);

select * from finish();
rollback;
