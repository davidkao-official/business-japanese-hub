-- Isolated lifecycle scenario group; all assertions retained from the original suite.
begin;

select plan(46);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000198', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000199', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000200', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated');

-- #164 successor-terminal reconciliation (append-only repair 20260922270). A
-- terminal event on a distinct, never-confirmed successor C that arrives before
-- C's own confirmed start must not leave the prior stream A active, and the two
-- arrival orders must converge on the same terminal result.
update public.plus_membership_plan set active = true where plan_code = 'plus_early_access_monthly';
select is(public.record_plus_membership_event('source-a','customer-198','subscription-198-a','start-198-a','50000000-0000-0000-0000-000000000198','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','#164 successor terminal forward delivery starts stream A');
select is(public.record_plus_membership_event('source-a','customer-198','subscription-198-c','revoke-198-c','50000000-0000-0000-0000-000000000198','plus_early_access_monthly','membership_revoked','2026-09-15T00:00:00Z','2026-09-10T00:00:00Z','2026-10-10T00:00:00Z'),'stale','#164 successor terminal forward delivery buffers the unselected C terminal before its start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000198'),'subscription-198-a','#164 successor terminal forward delivery leaves A current while C is unconfirmed');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000198'),'active','#164 successor terminal forward delivery cannot terminate A from an unconfirmed successor');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-198-c'),true,'#164 successor terminal forward delivery retires only the C binding');
select is((select retired_at is null from public.plus_membership_subscription where source_subscription_id='subscription-198-a'),true,'#164 successor terminal forward delivery leaves the A binding live');
select is(public.record_plus_membership_event('source-a','customer-198','subscription-198-c','start-198-c','50000000-0000-0000-0000-000000000198','plus_early_access_monthly','membership_started','2026-09-10T00:00:00Z','2026-09-10T00:00:00Z','2026-10-10T00:00:00Z'),'applied','#164 successor terminal forward delivery accepts the confirmed C start after its own terminal');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000198'),'subscription-198-c','#164 successor terminal forward delivery selects C as the current stream');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000198'),'revoked','#164 successor terminal forward delivery folds the buffered terminal into C state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000198'),'revoked','#164 successor terminal forward delivery ends C access revoked');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-198-a'),true,'#164 successor terminal forward delivery retires the replaced A binding');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-198-c'),2::bigint,'#164 successor terminal forward delivery keeps both durable C events');

select is(public.record_plus_membership_event('source-a','customer-199','subscription-199-a','start-199-a','50000000-0000-0000-0000-000000000199','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','#164 successor terminal reverse delivery starts stream A');
select is(public.record_plus_membership_event('source-a','customer-199','subscription-199-c','start-199-c','50000000-0000-0000-0000-000000000199','plus_early_access_monthly','membership_started','2026-09-10T00:00:00Z','2026-09-10T00:00:00Z','2026-10-10T00:00:00Z'),'applied','#164 successor terminal reverse delivery selects C before its terminal');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000199'),'subscription-199-c','#164 successor terminal reverse delivery keeps C current');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-199-a'),true,'#164 successor terminal reverse delivery retires the replaced A binding');
select is(public.record_plus_membership_event('source-a','customer-199','subscription-199-c','revoke-199-c','50000000-0000-0000-0000-000000000199','plus_early_access_monthly','membership_revoked','2026-09-15T00:00:00Z','2026-09-10T00:00:00Z','2026-10-10T00:00:00Z'),'applied','#164 successor terminal reverse delivery applies the C terminal after its start');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000199'),'revoked','#164 successor terminal reverse delivery state is revoked');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000199'),'revoked','#164 successor terminal reverse delivery access is revoked');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000198'),(select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000199'),'#164 successor terminal arrival order converges on one state');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000198'),'subscription-198-c','#164 successor terminal forward delivery ends on its own confirmed successor');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000199'),'subscription-199-c','#164 successor terminal reverse delivery ends on its own confirmed successor');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000198'),(select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000199'),'#164 successor terminal arrival order converges on one projection');

-- #164 replacement watermark (append-only repair 20260922270). A successor
-- accepted over a stream retired below its own later renewal must order from
-- its own accepted key, and the buffered fold must use that ordering.
select is(public.record_plus_membership_event('source-a','customer-200','subscription-200-a','start-200-a','50000000-0000-0000-0000-000000000200','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','#164 replacement watermark forward delivery starts stream A');
select is(public.record_plus_membership_event('source-a','customer-200','subscription-200-a','renew-200-a','50000000-0000-0000-0000-000000000200','plus_early_access_monthly','membership_renewed','2026-09-20T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z'),'applied','#164 replacement watermark forward delivery advances A to t20');
select is(public.record_plus_membership_event('source-a','customer-200','subscription-200-a','revoke-200-a','50000000-0000-0000-0000-000000000200','plus_early_access_monthly','membership_revoked','2026-09-10T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'stale','#164 replacement watermark forward delivery keeps the earlier A terminal stale for the reducer');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000200'),'2026-09-20T00:00:00Z'::timestamptz,'#164 replacement watermark forward delivery leaves the reducer clock at A t20');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-200-a'),true,'#164 replacement watermark forward delivery retires A on its own terminal');
select is(public.record_plus_membership_event('source-a','customer-200','subscription-200-c','fail-200-c','50000000-0000-0000-0000-000000000200','plus_early_access_monthly','membership_payment_failed','2026-09-18T00:00:00Z','2026-09-15T00:00:00Z','2026-10-15T00:00:00Z'),'stale','#164 replacement watermark forward delivery buffers the C failure before its start');
select is((select terminal_at is null from public.plus_membership_subscription where source_subscription_id='subscription-200-c'),true,'#164 replacement watermark forward delivery leaves nonterminal C terminal authority unset');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000200'),'subscription-200-a','#164 replacement watermark forward delivery leaves the buffered failure unapplied');
select is(public.record_plus_membership_event('source-a','customer-200','subscription-200-c','start-200-c','50000000-0000-0000-0000-000000000200','plus_early_access_monthly','membership_started','2026-09-15T00:00:00Z','2026-09-15T00:00:00Z','2026-10-15T00:00:00Z'),'applied','#164 replacement watermark forward delivery accepts C after the retired A terminal');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000200'),'subscription-200-c','#164 replacement watermark forward delivery selects C as current');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000200'),'past_due','#164 replacement watermark forward delivery folds the buffered failure on C ordering');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000200'),'past_due','#164 replacement watermark forward delivery ends C access past_due');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000200'),'2026-09-18T00:00:00Z'::timestamptz,'#164 replacement watermark forward delivery adopts the buffered failure watermark');

select is(public.record_plus_membership_event('source-a','customer-201','subscription-201-a','start-201-a','50000000-0000-0000-0000-000000000201','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','#164 replacement watermark reverse delivery starts stream A');
select is(public.record_plus_membership_event('source-a','customer-201','subscription-201-a','renew-201-a','50000000-0000-0000-0000-000000000201','plus_early_access_monthly','membership_renewed','2026-09-20T00:00:00Z','2026-09-20T00:00:00Z','2026-10-20T00:00:00Z'),'applied','#164 replacement watermark reverse delivery advances A to t20');
select is(public.record_plus_membership_event('source-a','customer-201','subscription-201-a','revoke-201-a','50000000-0000-0000-0000-000000000201','plus_early_access_monthly','membership_revoked','2026-09-10T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'stale','#164 replacement watermark reverse delivery keeps the earlier A terminal stale for the reducer');
select is(public.record_plus_membership_event('source-a','customer-201','subscription-201-c','start-201-c','50000000-0000-0000-0000-000000000201','plus_early_access_monthly','membership_started','2026-09-15T00:00:00Z','2026-09-15T00:00:00Z','2026-10-15T00:00:00Z'),'applied','#164 replacement watermark reverse delivery accepts C after the retired A terminal');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000201'),'2026-09-15T00:00:00Z'::timestamptz,'#164 replacement watermark reverse delivery resets the reducer clock to accepted C t15');
select is(public.record_plus_membership_event('source-a','customer-201','subscription-201-c','fail-201-c','50000000-0000-0000-0000-000000000201','plus_early_access_monthly','membership_payment_failed','2026-09-18T00:00:00Z','2026-09-15T00:00:00Z','2026-10-15T00:00:00Z'),'applied','#164 replacement watermark reverse delivery applies C payment failure at t18');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000201'),'past_due','#164 replacement watermark reverse delivery state is past_due');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000201'),'past_due','#164 replacement watermark reverse delivery access is past_due');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000200'),(select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000201'),'#164 replacement watermark arrival orders converge on one state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000200'),(select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000201'),'#164 replacement watermark arrival orders converge on one projection');

select * from finish();
rollback;
