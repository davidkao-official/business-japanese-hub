-- Focused pgTAP scenarios for candidate admission and conflict.
begin;

select plan(42);

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000300','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000301','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000302','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000303','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000304','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000305','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000306','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000307','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000308','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000309','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000310','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000311','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000312','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000313','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000314','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000315','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000316','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000317','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000318','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000319','authenticated','authenticated');

update public.plus_membership_plan set active = true
where plan_code in ('plus_early_access_monthly','plus_standard_monthly');

-- An inactive-plan audited start is not a candidate or a conflict with a later trusted start.
update public.plus_membership_plan set active = false where plan_code='plus_standard_monthly';
select is(public.record_plus_membership_event('source-a','c308','s308','inactive308','50000000-0000-0000-0000-000000000308','plus_standard_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'stale','308 inactive-plan start is retained as unqualified audit');
select is((select count(*) from public.plus_membership_event where source_event_id='inactive308'),1::bigint,'308 inactive start evidence remains append-only');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000308'),0::bigint,'308 inactive start grants no state');
update public.plus_membership_plan set active = true where plan_code='plus_standard_monthly';
select is(public.record_plus_membership_event('source-a','c308','s308','valid308','50000000-0000-0000-0000-000000000308','plus_standard_monthly','membership_started','2026-09-02','2026-09-02','2026-10-02'),'applied','308 first trusted start is eligible');
select is((select conflicted from public.plus_membership_stream_summary where source_subscription_id='s308'),false,'308 untrusted audit start does not poison trusted candidate');
select is(public.record_plus_membership_event('source-a','c308','s308','second308','50000000-0000-0000-0000-000000000308','plus_standard_monthly','membership_started','2026-09-03','2026-09-03','2026-10-03'),'conflict','308 second trusted start records conflict without rollback');
select is((select count(*) from public.plus_membership_event where source_subscription_id='s308' and event_type='membership_started'),2::bigint,'308 distinct trusted start conflict keeps evidence');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000308'),0::bigint,'308 conflicted stream fails closed');

-- Equal-time stream starts use event_id as deterministic tie-breaker in both arrival orders.
select is(public.record_plus_membership_event('source-a','c309','s309-a','start309a','50000000-0000-0000-0000-000000000309','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','309 A arrives first');
select is(public.record_plus_membership_event('source-a','c309','s309-b','start309b','50000000-0000-0000-0000-000000000309','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','309 B wins equal-time event-id tie');
select is(public.record_plus_membership_event('source-a','c310','s310-b','start310b','50000000-0000-0000-0000-000000000310','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','310 B arrives first');
select is(public.record_plus_membership_event('source-a','c310','s310-a','start310a','50000000-0000-0000-0000-000000000310','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'stale','310 A loses equal-time event-id tie');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000309'),'s309-b','309 tie selects B');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000310'),'s310-b','310 reverse tie also selects B');

-- A candidate whose paid period ends before its effective start is not admitted.
select is(public.record_plus_membership_event('source-a','c311','s311','future311','50000000-0000-0000-0000-000000000311','plus_early_access_monthly','membership_started','2026-09-20','2026-09-01','2026-09-15'),'stale','311 expired-before-effective-start candidate is rejected');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='s311'),false,'311 no qualified summary for empty paid interval');

-- A start later than its own terminal cutoff loses qualification, so a previously
-- stale C start is reconsidered from durable evidence in either delivery order.
select is(public.record_plus_membership_event('source-a','c316','s316-a','start316a','50000000-0000-0000-0000-000000000316','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','316 A start t10 applies');
select is(public.record_plus_membership_event('source-a','c316','s316-b','start316b','50000000-0000-0000-0000-000000000316','plus_early_access_monthly','membership_started','2026-09-20','2026-09-20','2026-10-20'),'applied','316 B start t20 supersedes A');
select is(public.record_plus_membership_event('source-a','c316','s316-c','start316c','50000000-0000-0000-0000-000000000316','plus_early_access_monthly','membership_started','2026-09-17','2026-09-17','2026-10-17'),'stale','316 C t17 is initially older than selected B t20');
select is(public.record_plus_membership_event('source-a','c316','s316-b','revoke316b','50000000-0000-0000-0000-000000000316','plus_early_access_monthly','membership_revoked','2026-09-15','2026-09-10','2026-10-10'),'applied','316 B terminal t15 invalidates its t20 start and reselects C');
select is(public.record_plus_membership_event('source-a','c317','s317-a','start317a','50000000-0000-0000-0000-000000000317','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','317 A start t10 applies');
select is(public.record_plus_membership_event('source-a','c317','s317-b','start317b','50000000-0000-0000-0000-000000000317','plus_early_access_monthly','membership_started','2026-09-20','2026-09-20','2026-10-20'),'applied','317 B start t20 supersedes A');
select is(public.record_plus_membership_event('source-a','c317','s317-b','revoke317b','50000000-0000-0000-0000-000000000317','plus_early_access_monthly','membership_revoked','2026-09-15','2026-09-10','2026-10-10'),'applied','317 B terminal first invalidates its t20 start');
select is(public.record_plus_membership_event('source-a','c317','s317-c','start317c','50000000-0000-0000-0000-000000000317','plus_early_access_monthly','membership_started','2026-09-17','2026-09-17','2026-10-17'),'applied','317 C t17 selects after B terminal');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000316'),'s316-c','316 final selection is C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000317'),'s317-c','317 reverse final selection is C');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000316'),'active','316 final C access is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000317'),'active','317 final C access is active');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='s316-b'),false,'316 B is unqualified after pre-start terminal');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='s317-b'),false,'317 B is unqualified after pre-start terminal');
select is((select terminal_at from public.plus_membership_stream_summary where source_subscription_id='s316-b'),'2026-09-15'::timestamptz,'316 B terminal cutoff retained');
select is((select terminal_at from public.plus_membership_stream_summary where source_subscription_id='s317-b'),'2026-09-15'::timestamptz,'317 B terminal cutoff retained');

-- A second trusted start conflicts durably regardless of which source arrives first.
select is(public.record_plus_membership_event('source-a','c318','s318','start318a','50000000-0000-0000-0000-000000000318','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','318 first start selects');
select is(public.record_plus_membership_event('source-a','c318','s318','start318b','50000000-0000-0000-0000-000000000318','plus_early_access_monthly','membership_started','2026-09-20','2026-09-20','2026-10-20'),'conflict','318 second start conflicts');
select is(public.record_plus_membership_event('source-a','c319','s319','start319b','50000000-0000-0000-0000-000000000319','plus_early_access_monthly','membership_started','2026-09-20','2026-09-20','2026-10-20'),'applied','319 reverse first start selects');
select is(public.record_plus_membership_event('source-a','c319','s319','start319a','50000000-0000-0000-0000-000000000319','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'conflict','319 reverse second start conflicts');
select is((select conflicted from public.plus_membership_stream_summary where source_subscription_id='s318'),true,'318 conflict is durable');
select is((select conflicted from public.plus_membership_stream_summary where source_subscription_id='s319'),true,'319 reverse conflict is durable');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000318'),0::bigint,'318 conflict removes the derived state');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000319'),0::bigint,'319 reverse conflict removes the derived state');
select is((select count(*) from public.plus_membership_event where source_subscription_id='s318' and event_type='membership_started'),2::bigint,'318 keeps both start facts');
select is((select count(*) from public.plus_membership_event where source_subscription_id='s319' and event_type='membership_started'),2::bigint,'319 keeps both start facts');

select * from finish();
rollback;
