-- Focused pgTAP scenarios for cross-stream selection and terminal scope.
begin;

select plan(70);

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

-- Superseded stream events cannot regain selection authority from later event clocks.
select is(public.record_plus_membership_event('source-a','c308','s308-a','start308a','50000000-0000-0000-0000-000000000308','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','308 A start applies');
select is(public.record_plus_membership_event('source-a','c308','s308-b','start308b','50000000-0000-0000-0000-000000000308','plus_early_access_monthly','membership_started','2026-09-20','2026-09-20','2026-10-20'),'applied','308 newer B start replaces A');
select is(public.record_plus_membership_event('source-a','c308','s308-a','renew308a','50000000-0000-0000-0000-000000000308','plus_early_access_monthly','membership_renewed','2026-09-25','2026-09-25','2026-10-25'),'stale','308 late A renewal cannot outrank B initial start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000308'),'s308-b','308 selected stream remains B');
select is(public.record_plus_membership_event('source-a','c309','s309-b','start309b','50000000-0000-0000-0000-000000000309','plus_early_access_monthly','membership_started','2026-09-20','2026-09-20','2026-10-20'),'applied','309 B start arrives first');
select is(public.record_plus_membership_event('source-a','c309','s309-a','start309a','50000000-0000-0000-0000-000000000309','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'stale','309 older A start stays nonselected');
select is(public.record_plus_membership_event('source-a','c309','s309-a','renew309a','50000000-0000-0000-0000-000000000309','plus_early_access_monthly','membership_renewed','2026-09-25','2026-09-25','2026-10-25'),'stale','309 later A renewal cannot outrank B initial start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000309'),'s309-b','309 reverse delivery also selects B');

-- Own immediate terminal evidence dominates later active facts in either delivery order.
select is(public.record_plus_membership_event('source-a','c310','s310','start310','50000000-0000-0000-0000-000000000310','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','310 confirmed start applies');
select is(public.record_plus_membership_event('source-a','c310','s310','revoke310','50000000-0000-0000-0000-000000000310','plus_early_access_monthly','membership_revoked','2026-09-15','2026-09-10','2026-10-10'),'applied','310 own terminal applies');
select is(public.record_plus_membership_event('source-a','c310','s310','renew310','50000000-0000-0000-0000-000000000310','plus_early_access_monthly','membership_renewed','2026-09-20','2026-09-20','2026-10-20'),'stale','310 later renewal cannot restore terminal stream');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s310'),'revoked','310 folded summary keeps terminal state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000310'),'revoked','310 access projection remains terminal');
select is(public.record_plus_membership_event('source-a','c311','s311','renew311','50000000-0000-0000-0000-000000000311','plus_early_access_monthly','membership_renewed','2026-09-20','2026-09-20','2026-10-20'),'stale','311 buffered renewal has no start authority');
select is(public.record_plus_membership_event('source-a','c311','s311','revoke311','50000000-0000-0000-0000-000000000311','plus_early_access_monthly','membership_revoked','2026-09-15','2026-09-10','2026-10-10'),'stale','311 terminal-only stream has no selected authority');
select is(public.record_plus_membership_event('source-a','c311','s311','start311','50000000-0000-0000-0000-000000000311','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-10'),'applied','311 delayed start folds terminal before buffered renewal');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s311'),'revoked','311 reverse delivery converges on terminal summary');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000311'),'revoked','311 reverse delivery keeps access terminal');

select * from finish();
rollback;
