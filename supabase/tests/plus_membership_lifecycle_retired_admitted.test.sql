-- Replaced admitted streams cannot return through their own future cutoff.
begin;

select plan(25);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000720', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000721', 'authenticated', 'authenticated');

-- User 720: A's scheduled cancellation was received while A was current, then
-- B replaced admitted A before the cutoff. A's later lifecycle evidence is
-- before its scheduled cutoff but must not resurrect the stream B superseded.
select is(public.record_plus_membership_event('source-retired-admitted','customer-720','subscription-720-a','start-720-a10','50000000-0000-0000-0000-000000000720','plus_early_access_monthly','membership_started',now() - interval '30 days',now() - interval '30 days',now() + interval '60 days'),'applied','#165 retired admitted 720 starts A at t10');
select is(public.record_plus_membership_event('source-retired-admitted','customer-720','subscription-720-a','cancel-720-a15','50000000-0000-0000-0000-000000000720','plus_early_access_monthly','membership_canceled',now() - interval '25 days',now() - interval '30 days',now() + interval '60 days',true),'applied','#165 retired admitted 720 records A scheduled cancellation at t15');
select is((select terminal_at from public.plus_membership_subscription where source_subscription_id='subscription-720-a'),now() + interval '60 days','#165 retired admitted 720 stores A cutoff at t100');
select is(public.record_plus_membership_event('source-retired-admitted','customer-720','subscription-720-b','start-720-b20','50000000-0000-0000-0000-000000000720','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '70 days'),'applied','#165 retired admitted 720 B start t20 replaces admitted A');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-720-a'),true,'#165 retired admitted 720 A remains durably admitted');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-720-a'),true,'#165 retired admitted 720 replacement retires A');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000720'),'subscription-720-b','#165 retired admitted 720 selects B');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000720'),'active','#165 retired admitted 720 grants B access');
select is(public.record_plus_membership_event('source-retired-admitted','customer-720','subscription-720-a','start-720-a30','50000000-0000-0000-0000-000000000720','plus_early_access_monthly','membership_reactivated',now() - interval '10 days',now() - interval '10 days',now() + interval '90 days'),'stale','#165 retired admitted 720 A start t30 cannot resurrect before its scheduled cutoff');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000720'),'subscription-720-b','#165 retired admitted 720 late start leaves B current');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000720'),'active','#165 retired admitted 720 late start preserves B active access');

-- User 721: C's scheduled cancellation first arrives noncurrent and retires
-- C's binding. Its earlier start may legitimately select and admit C before
-- the cutoff. B then replaces that admitted C. C's later start must still be stale
-- even though retired_event_id remains C's own cancellation, not B's event.
select is(public.record_plus_membership_event('source-retired-admitted','customer-721','subscription-721-a','start-721-a1','50000000-0000-0000-0000-000000000721','plus_early_access_monthly','membership_started',now() - interval '40 days',now() - interval '40 days',now() + interval '60 days'),'applied','#165 retired admitted 721 starts current A at t1');
select is(public.record_plus_membership_event('source-retired-admitted','customer-721','subscription-721-c','cancel-721-c15','50000000-0000-0000-0000-000000000721','plus_early_access_monthly','membership_canceled',now() - interval '25 days',now() - interval '30 days',now() + interval '60 days',true),'stale','#165 retired admitted 721 accepts noncurrent C cancellation only as own terminal evidence');
select is((select terminal_at from public.plus_membership_subscription where source_subscription_id='subscription-721-c'),now() + interval '60 days','#165 retired admitted 721 stores C cutoff at t100');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-721-c'),true,'#165 retired admitted 721 noncurrent cancellation retires C binding');
select is(public.record_plus_membership_event('source-retired-admitted','customer-721','subscription-721-c','start-721-c10','50000000-0000-0000-0000-000000000721','plus_early_access_monthly','membership_started',now() - interval '30 days',now() - interval '30 days',now() + interval '60 days'),'applied','#165 retired admitted 721 older C start t10 selects C before cutoff');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-721-c'),true,'#165 retired admitted 721 C start admits C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000721'),'subscription-721-c','#165 retired admitted 721 C is current before B');
select is(public.record_plus_membership_event('source-retired-admitted','customer-721','subscription-721-b','start-721-b20','50000000-0000-0000-0000-000000000721','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '70 days'),'applied','#165 retired admitted 721 B start t20 replaces admitted C');
select is((select retired_event_id from public.plus_membership_subscription where source_subscription_id='subscription-721-c'),(select event_id from public.plus_membership_event where source_system='source-retired-admitted' and source_event_id='cancel-721-c15'),'#165 retired admitted 721 retains C own cancellation as retirement authority');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000721'),'subscription-721-b','#165 retired admitted 721 B is current');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000721'),'active','#165 retired admitted 721 B access is active');
select is(public.record_plus_membership_event('source-retired-admitted','customer-721','subscription-721-c','start-721-c30','50000000-0000-0000-0000-000000000721','plus_early_access_monthly','membership_reactivated',now() - interval '10 days',now() - interval '10 days',now() + interval '90 days'),'stale','#165 retired admitted 721 C start t30 cannot resurrect before C cutoff');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000721'),'subscription-721-b','#165 retired admitted 721 late start leaves B current');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000721'),'active','#165 retired admitted 721 late start preserves B access');

select * from finish();
rollback;
