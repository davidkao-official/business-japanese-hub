-- Independent scenario: identical fixture IDs in other files roll back there.
begin;

select plan(6);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated');

-- A delivered-after-cutoff period-end cancellation is terminal authority for
-- its own old stream without manufacturing a separate expiration event.
select is(public.record_plus_membership_event('source-a','customer-204','subscription-204-a','start-204-a','50000000-0000-0000-0000-000000000204','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() - interval '1 day'),'applied','#164 scheduled terminal setup starts the old stream');
select is(public.record_plus_membership_event('source-a','customer-204','subscription-204-a','cancel-204-a','50000000-0000-0000-0000-000000000204','plus_early_access_monthly','membership_canceled',now() - interval '2 days',now() - interval '20 days',now() - interval '1 day',true),'applied','#164 scheduled terminal becomes durable terminal authority at its effective end without expiry');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-204-a' and event_type='membership_expired'),0::bigint,'#164 scheduled terminal needs no separate expiry evidence');
select is(public.record_plus_membership_event('source-a','customer-204','subscription-204-b','start-204-b','50000000-0000-0000-0000-000000000204','plus_early_access_monthly','membership_started',now(),now(),now() + interval '30 days'),'applied','#164 scheduled terminal permits a successor after its effective end');
select is(public.record_plus_membership_event('source-a','customer-204','subscription-204-a','late-precutoff-start-204-a','50000000-0000-0000-0000-000000000204','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '20 days',now() - interval '1 day'),'stale','#164 scheduled old-stream evidence cannot replace its successor after terminal reconciliation');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000204'),'subscription-204-b','#164 scheduled terminal reconciliation leaves successor projection unchanged');

select * from finish();
rollback;
