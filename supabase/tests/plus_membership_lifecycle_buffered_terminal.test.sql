-- Independent scenario: identical fixture IDs in other files roll back there.
begin;

select plan(6);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000205', 'authenticated', 'authenticated');

-- Buffered immediate terminal evidence outranks a later active event when the
-- older confirming start finally makes this stream current.
select is(public.record_plus_membership_event('source-a','customer-205','subscription-205-a','start-205-a','50000000-0000-0000-0000-000000000205','plus_early_access_monthly','membership_started',now() - interval '30 days',now() - interval '30 days',now() + interval '30 days'),'applied','#164 buffered terminal setup starts the current stream');
select is(public.record_plus_membership_event('source-a','customer-205','subscription-205-c','revoke-205-c','50000000-0000-0000-0000-000000000205','plus_early_access_monthly','membership_revoked',now() - interval '10 days',now() - interval '20 days',now() + interval '20 days'),'stale','#164 buffered immediate terminal is durable before C confirmation');
select is(public.record_plus_membership_event('source-a','customer-205','subscription-205-c','renew-205-c','50000000-0000-0000-0000-000000000205','plus_early_access_monthly','membership_renewed',now() - interval '5 days',now() - interval '20 days',now() + interval '30 days'),'stale','#164 later buffered active evidence cannot undo C terminal authority');
select is(public.record_plus_membership_event('source-a','customer-205','subscription-205-c','start-205-c','50000000-0000-0000-0000-000000000205','plus_early_access_monthly','membership_started',now() - interval '15 days',now() - interval '20 days',now() + interval '20 days'),'applied','#164 confirming C start applies before folding its durable evidence');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000205'),'revoked','#164 immediate terminal dominates later buffered active evidence in access projection');
select is((select retired_event_id from public.plus_membership_subscription where source_subscription_id='subscription-205-c'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='revoke-205-c'),'#164 buffered terminal retires only C binding');

select * from finish();
rollback;
