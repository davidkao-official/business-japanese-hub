-- Sidecar pgTAP for temporal Plus authorization.
begin;

select plan(42);

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000360','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000361','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000362','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000363','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000364','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000365','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000366','authenticated','authenticated');

update public.plus_membership_plan set active = true
where plan_code in ('plus_early_access_monthly','plus_standard_monthly');

select ok(to_regclass('public.plus_membership_access_window') is not null,'temporal window table exists');
select isnt(has_table_privilege('anon','public.plus_membership_access_window','select'),true,'anon cannot read paid windows');
select isnt(has_table_privilege('authenticated','public.plus_membership_access_window','select'),true,'authenticated cannot read paid windows');
select ok(has_table_privilege('service_role','public.plus_membership_access_window','select'),'service role may inspect derived windows');
select ok(has_function_privilege('service_role','public.resolve_plus_membership_access(uuid)','execute'),'service role may resolve temporal access');
select isnt(has_function_privilege('anon','public.resolve_plus_membership_access(uuid)','execute'),true,'anon cannot resolve temporal access');
select isnt(has_function_privilege('authenticated','public.resolve_plus_membership_access(uuid)','execute'),true,'authenticated cannot resolve temporal access');
select isnt(has_function_privilege('service_role','public.rebuild_plus_membership_access_windows(text,text,text)','execute'),true,'service role cannot call internal rebuild');

-- A future successor cannot erase still-valid present coverage.
select is(public.record_plus_membership_event('source-a','c360','s360-a','start360a','50000000-0000-0000-0000-000000000360','plus_early_access_monthly','membership_started',now()-interval '2 days',now()-interval '2 days',now()+interval '2 days'),'applied','360 current A applies');
select is(public.record_plus_membership_event('source-a','c360','s360-b','start360b','50000000-0000-0000-0000-000000000360','plus_early_access_monthly','membership_started',now()+interval '1 day',now()+interval '1 day',now()+interval '10 days'),'applied','360 future B is durable');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000360')->>'access','active','360 future B does not displace current A');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s360-a'),1::bigint,'360 A keeps one paid window');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s360-b'),1::bigint,'360 B future window is materialized');

-- A genuine gap stays a gap; older expired A does not fabricate coverage.
select is(public.record_plus_membership_event('source-a','c361','s361-a','start361a','50000000-0000-0000-0000-000000000361','plus_early_access_monthly','membership_started',now()-interval '4 days',now()-interval '4 days',now()-interval '1 day'),'applied','361 expired A is durable');
select is(public.record_plus_membership_event('source-a','c361','s361-b','start361b','50000000-0000-0000-0000-000000000361','plus_early_access_monthly','membership_started',now()+interval '1 day',now()+interval '1 day',now()+interval '5 days'),'applied','361 future B is durable');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000361')->>'access','non-member','361 A-B unpaid gap remains non-member');

-- A same-stream future renewal cannot overwrite current paid coverage.
select is(public.record_plus_membership_event('source-a','c362','s362','start362','50000000-0000-0000-0000-000000000362','plus_early_access_monthly','membership_started',now()-interval '2 days',now()-interval '2 days',now()+interval '1 day'),'applied','362 current start applies');
select is(public.record_plus_membership_event('source-a','c362','s362','renew362','50000000-0000-0000-0000-000000000362','plus_early_access_monthly','membership_renewed',now()+interval '3 days',now()+interval '3 days',now()+interval '8 days'),'applied','362 future renewal is durable');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000362')->>'access','active','362 future renewal does not erase current interval');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s362'),2::bigint,'362 keeps separate current and future windows');
select ok((select bool_and(access_end > access_start) from public.plus_membership_access_window where source_subscription_id='s362'),'362 never collapses the gap into an invalid window');

-- Failure clips established coverage; later recovery creates new coverage.
select is(public.record_plus_membership_event('source-a','c363','s363','start363','50000000-0000-0000-0000-000000000363','plus_early_access_monthly','membership_started',now()-interval '2 days',now()-interval '2 days',now()+interval '2 days'),'applied','363 start applies');
select is(public.record_plus_membership_event('source-a','c363','s363','fail363','50000000-0000-0000-0000-000000000363','plus_early_access_monthly','membership_payment_failed',now()-interval '1 hour',now()-interval '1 hour',now()+interval '2 days'),'applied','363 failure applies');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000363')->>'access','non-member','363 failure clips present coverage');
select is((select max(access_end) from public.plus_membership_access_window where source_subscription_id='s363'),(select occurred_at from public.plus_membership_event where source_event_id='fail363'),'363 paid window ends at failure time');
select is(public.record_plus_membership_event('source-a','c363','s363','restore363','50000000-0000-0000-0000-000000000363','plus_early_access_monthly','membership_restored',now()-interval '30 minutes',now()-interval '30 minutes',now()+interval '2 days'),'applied','363 recovery applies');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000363')->>'access','active','363 recovery creates new current coverage');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s363'),2::bigint,'363 stores clipped grant plus recovery grant');

-- Own scheduled terminal cutoff clips only this stream.
select is(public.record_plus_membership_event('source-a','c364','s364','start364','50000000-0000-0000-0000-000000000364','plus_early_access_monthly','membership_started',now()-interval '2 days',now()-interval '2 days',now()+interval '2 days'),'applied','364 start applies');
select is(public.record_plus_membership_event('source-a','c364','s364','cancel364','50000000-0000-0000-0000-000000000364','plus_early_access_monthly','membership_canceled',now()-interval '1 day',now()-interval '2 days',now()+interval '1 hour',true),'applied','364 scheduled cancellation applies');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000364')->>'access','active','364 remains active before own cutoff');
select is((select max(access_end) from public.plus_membership_access_window where source_subscription_id='s364'),(select period_end from public.plus_membership_event where source_event_id='cancel364'),'364 own cutoff clamps its windows');

-- Once newer B is effective, B failure must not resurrect A.
select is(public.record_plus_membership_event('source-a','c365','s365-a','start365a','50000000-0000-0000-0000-000000000365','plus_early_access_monthly','membership_started',now()-interval '4 days',now()-interval '4 days',now()+interval '4 days'),'applied','365 older A applies');
select is(public.record_plus_membership_event('source-a','c365','s365-b','start365b','50000000-0000-0000-0000-000000000365','plus_early_access_monthly','membership_started',now()-interval '2 days',now()-interval '2 days',now()+interval '4 days'),'applied','365 newer B applies');
select is(public.record_plus_membership_event('source-a','c365','s365-b','fail365b','50000000-0000-0000-0000-000000000365','plus_early_access_monthly','membership_payment_failed',now()-interval '1 hour',now()-interval '1 hour',now()+interval '4 days'),'applied','365 B failure applies');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000365')->>'access','non-member','365 failed B does not resurrect still-paid A');

-- A conflicted newer stream is disqualified, so the older qualified stream is selected.
select is(public.record_plus_membership_event('source-a','c366','s366-a','start366a','50000000-0000-0000-0000-000000000366','plus_early_access_monthly','membership_started',now()-interval '4 days',now()-interval '4 days',now()+interval '4 days'),'applied','366 A applies');
select is(public.record_plus_membership_event('source-a','c366','s366-b','start366b1','50000000-0000-0000-0000-000000000366','plus_early_access_monthly','membership_started',now()-interval '2 days',now()-interval '2 days',now()+interval '4 days'),'applied','366 first B start applies');
select is(public.record_plus_membership_event('source-a','c366','s366-b','start366b2','50000000-0000-0000-0000-000000000366','plus_early_access_monthly','membership_started',now()-interval '1 day',now()-interval '1 day',now()+interval '5 days'),'conflict','366 second trusted B start records conflict');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000366')->>'access','active','366 conflicted B falls back to qualified A');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s366-b'),0::bigint,'366 conflict removes B windows');
select is(public.record_plus_membership_event('source-a','c366','s366-a','start366a','50000000-0000-0000-0000-000000000366','plus_early_access_monthly','membership_started',now()-interval '4 days',now()-interval '4 days',now()+interval '4 days'),'replayed','366 exact immutable event replay remains replayed');

select * from finish();
rollback;
