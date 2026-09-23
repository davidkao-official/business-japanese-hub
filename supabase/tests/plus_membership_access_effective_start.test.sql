begin;
select plan(8);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000658', 'authenticated', 'authenticated');

update public.plus_membership_plan set active = true
where plan_code = 'plus_early_access_monthly';

select is(public.record_plus_membership_event('access-window','customer-658','subscription-658-a','start-658-a','50000000-0000-0000-0000-000000000658','plus_early_access_monthly','membership_started',now()+interval '1 hour',now()-interval '1 day',now()+interval '2 days'),'applied','future-dated start is accepted as durable paid evidence');
select is((select current_period_start from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000658'),now()+interval '1 hour','projection opens no earlier than the trusted start occurrence');

select is(public.record_plus_membership_event('access-window','customer-658','subscription-658-a','renew-658-a','50000000-0000-0000-0000-000000000658','plus_early_access_monthly','membership_renewed',now()+interval '2 hours',now()+interval '2 hours',now()+interval '4 days'),'applied','overlapping same-stream renewal applies');
select is((select current_period_start from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000658'),now()+interval '1 hour','continuous same-stream renewal preserves the prior effective start');

select is(public.record_plus_membership_event('access-window','customer-658','subscription-658-b','start-658-b','50000000-0000-0000-0000-000000000658','plus_early_access_monthly','membership_started',now()+interval '3 hours',now()-interval '1 day',now()+interval '5 days'),'applied','newer stream replaces the selected stream');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000658'),'subscription-658-b','new stream becomes the selected binding');
select is((select current_period_start from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000658'),now()+interval '3 hours','stream replacement starts a new access window without predecessor carryover');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000658'),'active','future access window remains represented as active evidence');

select * from finish();
rollback;
