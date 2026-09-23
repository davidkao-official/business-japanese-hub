-- Delivery-order permutations for the per-stream reconciliation writer.
begin;

select plan(111);

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

select ok((select relrowsecurity from pg_class where oid='public.plus_membership_stream_summary'::regclass),'summary table enforces RLS');
select isnt(has_table_privilege('anon','public.plus_membership_stream_summary','select'),true,'anon cannot read stream summaries');
select isnt(has_table_privilege('authenticated','public.plus_membership_stream_summary','select'),true,'authenticated cannot read stream summaries');
select isnt(has_function_privilege('service_role','public.recompute_plus_membership_stream(text,text,text)','execute'),true,'service_role cannot call the internal stream fold directly');
select isnt(has_function_privilege('service_role','public.project_plus_membership_user(uuid)','execute'),true,'service_role cannot call the internal projection helper directly');

-- Renewal and payment failure fold identically when delivered in either order.
select is(public.record_plus_membership_event('source-a','c300','s300','start300','50000000-0000-0000-0000-000000000300','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','300 start changes selected projection');
select is((select reducer_version from public.plus_membership_event where source_event_id='start300'),1,'300 accepted start carries reducer proof version');
select is(public.record_plus_membership_event('source-a','c300','s300','renew300','50000000-0000-0000-0000-000000000300','plus_early_access_monthly','membership_renewed','2026-09-05','2026-09-05','2026-10-05'),'applied','300 renewal applies');
select is(public.record_plus_membership_event('source-a','c300','s300','fail300','50000000-0000-0000-0000-000000000300','plus_early_access_monthly','membership_payment_failed','2026-09-10','2026-09-10','2026-10-10'),'applied','300 failure applies');
select is(public.record_plus_membership_event('source-a','c301','s301','fail301','50000000-0000-0000-0000-000000000301','plus_early_access_monthly','membership_payment_failed','2026-09-10','2026-09-10','2026-10-10'),'stale','301 failure before start is audit only');
select is(public.record_plus_membership_event('source-a','c301','s301','renew301','50000000-0000-0000-0000-000000000301','plus_early_access_monthly','membership_renewed','2026-09-05','2026-09-05','2026-10-05'),'stale','301 renewal before start is audit only');
select is(public.record_plus_membership_event('source-a','c301','s301','start301','50000000-0000-0000-0000-000000000301','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','301 start reconciles buffered history');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000300'),'past_due','300 final access is past_due');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000301'),'past_due','301 final access is past_due');
select is((select source_event_id from public.plus_membership_event where event_id=(select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000300')),'fail300','300 final applied event is its failure');
select is((select source_event_id from public.plus_membership_event where event_id=(select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000301')),'fail301','301 final applied event is its failure');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000300'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000301'),'renewal permutation final horizon matches');

-- A pending B start at t10 with buffered failure at t30 must not beat C at t15.
select is(public.record_plus_membership_event('source-a','c312','s312-b','pending312','50000000-0000-0000-0000-000000000312','plus_early_access_monthly','membership_pending','2026-09-25','2026-09-25','2026-10-25'),'stale','312 provisional B is audit only');
select is(public.record_plus_membership_event('source-a','c312','s312-b','start312','50000000-0000-0000-0000-000000000312','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','312 B start is selected');
select is(public.record_plus_membership_event('source-a','c312','s312-b','fail312','50000000-0000-0000-0000-000000000312','plus_early_access_monthly','membership_payment_failed','2026-09-30','2026-09-30','2026-10-30'),'applied','312 buffered B failure folds after its start');
select is(public.record_plus_membership_event('source-a','c312','s312-c','start312c','50000000-0000-0000-0000-000000000312','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','312 C start t15 outranks B t10 despite B failure t30');
select is(public.record_plus_membership_event('source-a','c313','s313-c','start313c','50000000-0000-0000-0000-000000000313','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','313 C start arrives first');
select is(public.record_plus_membership_event('source-a','c313','s313-b','fail313','50000000-0000-0000-0000-000000000313','plus_early_access_monthly','membership_payment_failed','2026-09-30','2026-09-30','2026-10-30'),'stale','313 B failure remains nonselected');
select is(public.record_plus_membership_event('source-a','c313','s313-b','pending313','50000000-0000-0000-0000-000000000313','plus_early_access_monthly','membership_pending','2026-09-25','2026-09-25','2026-10-25'),'stale','313 B pending remains audit only');
select is(public.record_plus_membership_event('source-a','c313','s313-b','start313','50000000-0000-0000-0000-000000000313','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'stale','313 B historical start does not replace later C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000312'),'s312-c','312 final selection is C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000313'),'s313-c','313 reverse final selection is C');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000312'),'active','312 selected C access stays active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000313'),'active','313 selected C access stays active');

-- The same cross-stream start key wins when B has a later renewal instead of failure.
select is(public.record_plus_membership_event('source-a','c314','s314-b','start314','50000000-0000-0000-0000-000000000314','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','314 B start t10 applies');
select is(public.record_plus_membership_event('source-a','c314','s314-b','renew314','50000000-0000-0000-0000-000000000314','plus_early_access_monthly','membership_renewed','2026-09-20','2026-09-20','2026-10-20'),'applied','314 B renewal t20 applies');
select is(public.record_plus_membership_event('source-a','c314','s314-c','start314c','50000000-0000-0000-0000-000000000314','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','314 C start t15 outranks B start t10');
select is(public.record_plus_membership_event('source-a','c315','s315-c','start315c','50000000-0000-0000-0000-000000000315','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','315 C start arrives first');
select is(public.record_plus_membership_event('source-a','c315','s315-b','renew315','50000000-0000-0000-0000-000000000315','plus_early_access_monthly','membership_renewed','2026-09-20','2026-09-20','2026-10-20'),'stale','315 B renewal remains nonselected');
select is(public.record_plus_membership_event('source-a','c315','s315-b','start315','50000000-0000-0000-0000-000000000315','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'stale','315 B historical start does not replace later C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000314'),'s314-c','314 final selection is C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000315'),'s315-c','315 reverse final selection is C');

-- B's terminal belongs to B only. C's later initial-start key wins in either order.
select is(public.record_plus_membership_event('source-a','c302','s302-b','revoke302','50000000-0000-0000-0000-000000000302','plus_early_access_monthly','membership_revoked','2026-09-20','2026-09-10','2026-10-10'),'stale','302 terminal-only B has no selection authority');
select is(public.record_plus_membership_event('source-a','c302','s302-b','start302','50000000-0000-0000-0000-000000000302','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','302 historical B start is reconciled before own terminal');
select is(public.record_plus_membership_event('source-a','c302','s302-c','start302c','50000000-0000-0000-0000-000000000302','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','302 later C start replaces B');
select is(public.record_plus_membership_event('source-a','c303','s303-b','start303','50000000-0000-0000-0000-000000000303','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','303 B start applies first');
select is(public.record_plus_membership_event('source-a','c303','s303-b','revoke303','50000000-0000-0000-0000-000000000303','plus_early_access_monthly','membership_revoked','2026-09-20','2026-09-10','2026-10-10'),'applied','303 B terminal applies to B');
select is(public.record_plus_membership_event('source-a','c303','s303-c','start303c','50000000-0000-0000-0000-000000000303','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','303 C start selects over terminal B');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000302'),'s302-c','302 ends selected on C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000303'),'s303-c','303 ends selected on C');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s302-b'),'revoked','302 B retains its own terminal state');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s303-b'),'revoked','303 B retains its own terminal state');
select is((select terminal_at from public.plus_membership_stream_summary where source_subscription_id='s302-b'),'2026-09-20'::timestamptz,'302 B terminal cutoff is retained');
select is((select terminal_at from public.plus_membership_stream_summary where source_subscription_id='s303-b'),'2026-09-20'::timestamptz,'303 B terminal cutoff is retained');

-- Scheduled cancellation clamps its own horizon; it cannot outrank C by cutoff time.
select is(public.record_plus_membership_event('source-a','c304','s304-b','cancel304','50000000-0000-0000-0000-000000000304','plus_early_access_monthly','membership_canceled','2026-09-05','2026-09-01','2026-09-20',true),'stale','304 scheduled B terminal has no start authority');
select is(public.record_plus_membership_event('source-a','c304','s304-b','start304','50000000-0000-0000-0000-000000000304','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','304 B start reconciles before scheduled cutoff');
select is(public.record_plus_membership_event('source-a','c304','s304-c','start304c','50000000-0000-0000-0000-000000000304','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','304 later C start wins');
select is(public.record_plus_membership_event('source-a','c305','s305-b','start305','50000000-0000-0000-0000-000000000305','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','305 B start applies first');
select is(public.record_plus_membership_event('source-a','c305','s305-b','cancel305','50000000-0000-0000-0000-000000000305','plus_early_access_monthly','membership_canceled','2026-09-05','2026-09-01','2026-09-20',true),'applied','305 B scheduled cancellation clamps its own stream');
select is(public.record_plus_membership_event('source-a','c305','s305-c','start305c','50000000-0000-0000-0000-000000000305','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-15'),'applied','305 C start wins over scheduled B');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000304'),'s304-c','304 final selection is C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000305'),'s305-c','305 final selection is C');
select is((select access_period_end from public.plus_membership_stream_summary where source_subscription_id='s304-b'),'2026-09-20'::timestamptz,'304 B own cutoff clamps access');
select is((select access_period_end from public.plus_membership_stream_summary where source_subscription_id='s305-b'),'2026-09-20'::timestamptz,'305 B own cutoff clamps access');

-- Provisional and terminal-only B cannot suppress an eligible C or create an access row.
select is(public.record_plus_membership_event('source-a','c306','s306-a','start306a','50000000-0000-0000-0000-000000000306','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','306 A start applies');
select is(public.record_plus_membership_event('source-a','c306','s306-a','revoke306a','50000000-0000-0000-0000-000000000306','plus_early_access_monthly','membership_revoked','2026-09-05','2026-09-01','2026-10-01'),'applied','306 A terminal applies');
select is(public.record_plus_membership_event('source-a','c306','s306-b','pending306b','50000000-0000-0000-0000-000000000306','plus_early_access_monthly','membership_pending','2026-09-10','2026-09-10','2026-10-10'),'stale','306 B pending is audit only');
select is(public.record_plus_membership_event('source-a','c306','s306-b','revoke306b','50000000-0000-0000-0000-000000000306','plus_early_access_monthly','membership_revoked','2026-09-12','2026-09-10','2026-10-10'),'stale','306 unstarted B terminal has no selection authority');
select is(public.record_plus_membership_event('source-a','c306','s306-c','start306c','50000000-0000-0000-0000-000000000306','plus_early_access_monthly','membership_started','2026-09-08','2026-09-08','2026-10-08'),'applied','306 C start remains eligible before B terminal time');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000306'),'s306-c','306 C selected regardless of B terminal clock');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='s306-b'),false,'306 B has no qualified start summary');

-- A fresh terminal-only stream creates no per-user row; a later unrelated start can select.
select is(public.record_plus_membership_event('source-a','c307','s307-b','revoke307','50000000-0000-0000-0000-000000000307','plus_early_access_monthly','membership_revoked','2026-09-05','2026-09-01','2026-10-01'),'stale','307 terminal-only stream returns stale');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000307'),0::bigint,'307 terminal-only stream creates no state');
select is(public.record_plus_membership_event('source-a','c307','s307-c','start307c','50000000-0000-0000-0000-000000000307','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','307 later unrelated confirmed start selects');

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
