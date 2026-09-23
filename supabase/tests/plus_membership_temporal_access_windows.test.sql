begin;

select plan(146);

update public.plus_membership_plan set active = true
where plan_code in ('plus_early_access_monthly', 'plus_standard_monthly');

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000701','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000702','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000703','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000704','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000705','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000706','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000715','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000716','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000717','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000718','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000719','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000720','authenticated','authenticated');

-- A remains paid until B's effective start. Read selection is based on the
-- initial-start key effective by the one DB timestamp passed to the helper.
select is(public.record_plus_membership_event('windows','c701','a701','a701-start','50000000-0000-0000-0000-000000000701','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','701 stream A stays paid across B future start');
select is(public.record_plus_membership_event('windows','c701','b701','b701-start','50000000-0000-0000-0000-000000000701','plus_early_access_monthly','membership_started','2026-09-25','2026-09-25','2026-10-10'),'applied','701 future stream B starts');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000701','2026-09-15'),' {"access_status":"active"}'::jsonb,'701 A covers before B effective start');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000701','2026-09-24'),' {"access_status":"active"}'::jsonb,'701 A remains selected immediately before B start');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000701','2026-09-25'),' {"access_status":"active"}'::jsonb,'701 B is selected at its inclusive effective start');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000701','2026-09-26'),' {"access_status":"active"}'::jsonb,'701 B covers after its effective start');

-- A gap denies access without falling back to older A once B's key is selected.
select is(public.record_plus_membership_event('windows','c702','a702','a702-start','50000000-0000-0000-0000-000000000702','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-10'),'applied','702 stream A starts');
select is(public.record_plus_membership_event('windows','c702','b702','b702-start','50000000-0000-0000-0000-000000000702','plus_early_access_monthly','membership_started','2026-09-15','2026-09-15','2026-10-01'),'applied','702 stream B starts after a gap');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000702','2026-09-12'),' {"access_status":"non-member"}'::jsonb,'702 unpaid A-to-B gap remains closed');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000702','2026-09-16'),' {"access_status":"active"}'::jsonb,'702 B opens access at its own start');

-- The newer B failure clips B; A is not selected again while B is authoritative.
select is(public.record_plus_membership_event('windows','c703','a703','a703-start','50000000-0000-0000-0000-000000000703','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','703 stream A starts');
select is(public.record_plus_membership_event('windows','c703','b703','b703-start','50000000-0000-0000-0000-000000000703','plus_early_access_monthly','membership_started','2026-09-10','2026-09-10','2026-10-01'),'applied','703 newer stream B starts');
select is(public.record_plus_membership_event('windows','c703','b703','b703-failure','50000000-0000-0000-0000-000000000703','plus_early_access_monthly','membership_payment_failed','2026-09-12','2026-09-12','2026-10-01'),'applied','703 B payment failure applies');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000703','2026-09-13'),' {"access_status":"non-member"}'::jsonb,'703 failed B prevents fallback to still-covered A');

-- Same-stream future renewal preserves the initial paid term and its gap.
select is(public.record_plus_membership_event('windows','c704','s704','s704-start','50000000-0000-0000-0000-000000000704','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-10'),'applied','704 initial paid window starts');
select is(public.record_plus_membership_event('windows','c704','s704','s704-renewal','50000000-0000-0000-0000-000000000704','plus_early_access_monthly','membership_renewed','2026-09-05','2026-09-15','2026-09-30'),'applied','704 future renewal is accepted');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s704'),2::bigint,'704 stores two separate paid windows');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000704','2026-09-06'),' {"access_status":"active"}'::jsonb,'704 original paid period stays active before renewal gap');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000704','2026-09-12'),' {"access_status":"non-member"}'::jsonb,'704 unpaid future-renewal gap remains closed');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000704','2026-09-16'),' {"access_status":"active"}'::jsonb,'704 future renewal opens at its effective start');
select is(public.record_plus_membership_event('windows','c704','s704','s704-start','50000000-0000-0000-0000-000000000704','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-10'),'replayed','704 exact start replay remains idempotent');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s704'),2::bigint,'704 replay does not duplicate or erase windows');
select throws_ok(
  $$select public.record_plus_membership_event('windows','c704','s704','s704-start','50000000-0000-0000-0000-000000000704','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-11')$$,
  'P0001', 'membership source event facts conflict for windows/s704-start',
  '704 changed replay facts fail atomically'
);
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s704'),2::bigint,'704 rejected factual replay leaves windows unchanged');

-- Failure clips existing coverage and a later exact-plan recovery creates new coverage.
select is(public.record_plus_membership_event('windows','c705','s705','s705-start','50000000-0000-0000-0000-000000000705','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-25'),'applied','705 initial paid window starts');
select is(public.record_plus_membership_event('windows','c705','s705','s705-failure','50000000-0000-0000-0000-000000000705','plus_early_access_monthly','membership_payment_failed','2026-09-10','2026-09-01','2026-09-25'),'applied','705 failure clips current coverage');
select is(public.record_plus_membership_event('windows','c705','s705','s705-recovery','50000000-0000-0000-0000-000000000705','plus_early_access_monthly','membership_reactivated','2026-09-15','2026-09-15','2026-10-01'),'applied','705 later exact-plan recovery adds coverage');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s705'),2::bigint,'705 failure and recovery retain two disjoint windows');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000705','2026-09-12'),' {"access_status":"non-member"}'::jsonb,'705 failed period has no access');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000705','2026-09-16'),' {"access_status":"active"}'::jsonb,'705 recovery window grants access');

-- A failure after admission but before the initial paid period removes that
-- future grant; a later recovery contributes only its own paid interval.
insert into auth.users (id, aud, role) values ('50000000-0000-0000-0000-000000000713','authenticated','authenticated');
select is(public.record_plus_membership_event('windows','c713','s713','s713-start','50000000-0000-0000-0000-000000000713','plus_early_access_monthly','membership_started','2026-09-01','2026-09-10','2026-10-10'),'applied','713 future initial paid period starts');
select is(public.record_plus_membership_event('windows','c713','s713','s713-failure','50000000-0000-0000-0000-000000000713','plus_early_access_monthly','membership_payment_failed','2026-09-05','2026-09-10','2026-10-10'),'applied','713 pre-effective failure applies to the admitted stream');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s713'),'past_due','713 pre-effective failure changes stream state');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s713'),0::bigint,'713 pre-effective failure removes the future initial grant');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000713','2026-09-09'),' {"access_status":"non-member"}'::jsonb,'713 failure creates no access before the initial paid period');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000713','2026-09-11'),' {"access_status":"non-member"}'::jsonb,'713 failed initial period remains unavailable after its start');
select is(public.record_plus_membership_event('windows','c713','s713','s713-recovery','50000000-0000-0000-0000-000000000713','plus_early_access_monthly','membership_reactivated','2026-09-12','2026-09-12','2026-10-12'),'applied','713 later recovery applies');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s713'),'active','713 recovery returns the stream to active');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s713'),1::bigint,'713 recovery adds only its own paid window');
select is((select event.source_event_id from public.plus_membership_access_window as paid_window
  join public.plus_membership_event as event on event.event_id=paid_window.grant_event_id
  where paid_window.source_subscription_id='s713'),'s713-recovery','713 only the recovery event grants coverage');
select is((select window_start from public.plus_membership_access_window where source_subscription_id='s713'),'2026-09-12'::timestamptz,'713 coverage begins at recovery period start');
select is((select window_end from public.plus_membership_access_window where source_subscription_id='s713'),'2026-10-12'::timestamptz,'713 coverage ends at recovery period end');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000713','2026-09-13'),' {"access_status":"active"}'::jsonb,'713 recovered interval grants access');

-- A valid recovery before the initial paid start restores only coverage from
-- that trusted start, never from the earlier recovery receipt.
insert into auth.users (id, aud, role) values ('50000000-0000-0000-0000-000000000714','authenticated','authenticated');
select is(public.record_plus_membership_event('windows','c714','s714','s714-start','50000000-0000-0000-0000-000000000714','plus_early_access_monthly','membership_started','2026-09-01','2026-09-10','2026-10-10'),'applied','714 future initial paid period starts');
select is(public.record_plus_membership_event('windows','c714','s714','s714-failure','50000000-0000-0000-0000-000000000714','plus_early_access_monthly','membership_payment_failed','2026-09-05','2026-09-10','2026-10-10'),'applied','714 pre-effective failure applies');
select is(public.record_plus_membership_event('windows','c714','s714','s714-recovery','50000000-0000-0000-0000-000000000714','plus_early_access_monthly','membership_reactivated','2026-09-07','2026-09-07','2026-10-07'),'applied','714 pre-effective recovery applies after failure');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s714'),'active','714 recovery returns stream to active');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s714'),1::bigint,'714 recovery creates one paid window');
select is((select event.source_event_id from public.plus_membership_access_window as paid_window
  join public.plus_membership_event as event on event.event_id=paid_window.grant_event_id
  where paid_window.source_subscription_id='s714'),'s714-recovery','714 recovery event alone grants coverage');
select is((select window_start from public.plus_membership_access_window where source_subscription_id='s714'),'2026-09-10'::timestamptz,'714 recovered window is clamped to initial effective start');
select is((select window_end from public.plus_membership_access_window where source_subscription_id='s714'),'2026-10-07'::timestamptz,'714 recovery keeps its own paid period end');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000714','2026-09-09'),' {"access_status":"non-member"}'::jsonb,'714 recovery cannot open access before trusted paid start');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000714','2026-09-10'),' {"access_status":"active"}'::jsonb,'714 recovered coverage opens at the trusted paid start');

-- A matching-plan failure at the initial start time dominates regardless of
-- event ID or delivery order; only a strictly later recovery can reopen access.
select is(public.record_plus_membership_event('windows','c715','s715','z-start--715','50000000-0000-0000-0000-000000000715','plus_early_access_monthly','membership_started','2026-09-01','2026-09-10','2026-10-10'),'applied','715 future paid period starts');
select is(public.record_plus_membership_event('windows','c715','s715','a-failed-715','50000000-0000-0000-0000-000000000715','plus_early_access_monthly','membership_payment_failed','2026-09-01','2026-09-10','2026-10-10'),'applied','715 same-time failure is delivered after its start');
select ok((select failure.event_id < start.event_id
  from public.plus_membership_event as failure
  join public.plus_membership_event as start on start.source_subscription_id=failure.source_subscription_id
  where failure.source_event_id='a-failed-715' and start.source_event_id='z-start--715'),'715 failure ID sorts before start ID');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s715'),'past_due','715 same-time failure leaves the stream past due');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s715'),0::bigint,'715 same-time failure removes future paid coverage');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000715','2026-09-11'),' {"access_status":"non-member"}'::jsonb,'715 same-time failure denies the future paid period');

select lives_ok($$select public.record_plus_membership_event('windows','c716','s716','a-failure-716','50000000-0000-0000-0000-000000000716','plus_early_access_monthly','membership_payment_failed','2026-09-01','2026-09-01','2026-10-01')$$,'716 failure arrives before its start');
select lives_ok($$select public.record_plus_membership_event('windows','c716','s716','z-recover-716','50000000-0000-0000-0000-000000000716','plus_early_access_monthly','membership_reactivated','2026-09-01','2026-09-01','2026-10-01')$$,'716 same-time recovery arrives before its start');
select lives_ok($$select public.record_plus_membership_event('windows','c716','s716','zz-renew--716','50000000-0000-0000-0000-000000000716','plus_early_access_monthly','membership_renewed','2026-09-01','2026-09-01','2026-10-01')$$,'716 same-time renewal arrives before its start');
select is(public.record_plus_membership_event('windows','c716','s716','m-start---716','50000000-0000-0000-0000-000000000716','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','716 start arrives after its same-time follow-ups');
select ok((select failure.event_id < start.event_id and start.event_id < recovery.event_id
  and recovery.event_id < renewal.event_id
  from public.plus_membership_event as failure
  join public.plus_membership_event as start on start.source_subscription_id=failure.source_subscription_id
  join public.plus_membership_event as recovery on recovery.source_subscription_id=failure.source_subscription_id
  join public.plus_membership_event as renewal on renewal.source_subscription_id=failure.source_subscription_id
  where failure.source_event_id='a-failure-716'
    and start.source_event_id='m-start---716'
    and recovery.source_event_id='z-recover-716'
    and renewal.source_event_id='zz-renew--716'),'716 same-time event IDs order failure, start, recovery, renewal');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s716'),'past_due','716 same-time failure dominates the recovery by timestamp');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s716'),0::bigint,'716 same-time recovery and renewal cannot reopen the paid window');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000716','2026-09-02'),' {"access_status":"non-member"}'::jsonb,'716 same-time recovery leaves access closed');
select is(public.record_plus_membership_event('windows','c716','s716','later-recovery-716','50000000-0000-0000-0000-000000000716','plus_early_access_monthly','membership_reactivated','2026-09-02','2026-09-02','2026-10-02'),'applied','716 strictly later recovery reopens access');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s716'),'active','716 later recovery returns the stream to active');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s716'),1::bigint,'716 later recovery alone adds coverage');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000716','2026-09-03'),' {"access_status":"active"}'::jsonb,'716 later recovery grants access');

-- A same-time plan switch makes the matching plan for failure the folded B plan,
-- even when B's failure ID sorts before the original A start.
select is(public.record_plus_membership_event('windows','c717','s717','mstart---717','50000000-0000-0000-0000-000000000717','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','717 A starts');
select is(public.record_plus_membership_event('windows','c717','s717','zrenew---717','50000000-0000-0000-0000-000000000717','plus_standard_monthly','membership_renewed','2026-09-01','2026-09-01','2026-10-15'),'applied','717 same-time renewal switches the folded plan to B');
select is(public.record_plus_membership_event('windows','c717','s717','afail----717','50000000-0000-0000-0000-000000000717','plus_standard_monthly','membership_payment_failed','2026-09-01','2026-09-01','2026-10-15'),'applied','717 same-time B failure arrives after the plan switch');
select ok((select failure.event_id < start.event_id and start.event_id < renewal.event_id
  from public.plus_membership_event as failure
  join public.plus_membership_event as start on start.source_subscription_id=failure.source_subscription_id
  join public.plus_membership_event as renewal on renewal.source_subscription_id=failure.source_subscription_id
  where failure.source_event_id='afail----717' and start.source_event_id='mstart---717'
    and renewal.source_event_id='zrenew---717'),'717 failure ID sorts before A start and B renewal');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s717'),'past_due','717 B failure is applied after the same-time plan switch');
select is((select plan_code from public.plus_membership_stream_summary where source_subscription_id='s717'),'plus_standard_monthly','717 folded plan is B when failure is applied');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s717'),0::bigint,'717 B failure removes A and B same-time windows');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000717','2026-09-02'),' {"access_status":"non-member"}'::jsonb,'717 same-time B failure denies access');
select is(public.record_plus_membership_event('windows','c717','s717','later-recovery-717','50000000-0000-0000-0000-000000000717','plus_standard_monthly','membership_reactivated','2026-09-02','2026-09-02','2026-10-02'),'applied','717 strictly later B recovery reopens access');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s717'),'active','717 later B recovery makes the stream active');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000717','2026-09-03'),' {"access_status":"active"}'::jsonb,'717 later B recovery grants access');

select lives_ok($$select public.record_plus_membership_event('windows','c718','s718','afail----718','50000000-0000-0000-0000-000000000718','plus_standard_monthly','membership_payment_failed','2026-09-01','2026-09-01','2026-10-15')$$,'718 B failure arrives before A start');
select is(public.record_plus_membership_event('windows','c718','s718','mstart---718','50000000-0000-0000-0000-000000000718','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','718 A start follows the buffered B failure');
select lives_ok($$select public.record_plus_membership_event('windows','c718','s718','zrenew---718','50000000-0000-0000-0000-000000000718','plus_standard_monthly','membership_renewed','2026-09-01','2026-09-01','2026-10-15')$$,'718 B same-time renewal arrives after A start');
select ok((select failure.event_id < start.event_id and start.event_id < renewal.event_id
  from public.plus_membership_event as failure
  join public.plus_membership_event as start on start.source_subscription_id=failure.source_subscription_id
  join public.plus_membership_event as renewal on renewal.source_subscription_id=failure.source_subscription_id
  where failure.source_event_id='afail----718' and start.source_event_id='mstart---718'
    and renewal.source_event_id='zrenew---718'),'718 failure ID sorts before A start and B renewal');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s718'),'past_due','718 buffered B failure dominates the later same-time renewal');
select is((select plan_code from public.plus_membership_stream_summary where source_subscription_id='s718'),'plus_standard_monthly','718 fold applies failure against switched plan B');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s718'),0::bigint,'718 same-time B failure removes same-time windows');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000718','2026-09-02'),' {"access_status":"non-member"}'::jsonb,'718 buffered B failure denies access');

-- An off-current B failure clips only B-granted windows after the stream has
-- switched B then back to A. These fixtures vary both delivery and ID order.
select lives_ok($$select public.record_plus_membership_event('windows','c719','s719','m-start---719','50000000-0000-0000-0000-000000000719','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-05')$$,'719 A initial period arrives first');
select lives_ok($$select public.record_plus_membership_event('windows','c719','s719','b-renew---719','50000000-0000-0000-0000-000000000719','plus_standard_monthly','membership_renewed','2026-09-06','2026-09-06','2026-10-20')$$,'719 same-time B renewal arrives first');
select lives_ok($$select public.record_plus_membership_event('windows','c719','s719','z-renew---719','50000000-0000-0000-0000-000000000719','plus_early_access_monthly','membership_renewed','2026-09-06','2026-09-06','2026-09-12')$$,'719 same-time A renewal switches the stream back');
select lives_ok($$select public.record_plus_membership_event('windows','c719','s719','a-failure--719','50000000-0000-0000-0000-000000000719','plus_standard_monthly','membership_payment_failed','2026-09-10','2026-09-06','2026-10-20')$$,'719 later B failure arrives after switching back to A');
select ok((select b.event_id < a.event_id from public.plus_membership_event as b
  join public.plus_membership_event as a on a.source_subscription_id=b.source_subscription_id
  where b.source_event_id='b-renew---719' and a.source_event_id='z-renew---719'),'719 B renewal ID sorts before same-time A renewal');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s719'),'active','719 off-current B failure preserves active A status');
select is((select plan_code from public.plus_membership_stream_summary where source_subscription_id='s719'),'plus_early_access_monthly','719 stream remains on A after B failure');
select ok(
  exists(select 1 from public.plus_membership_access_window as w join public.plus_membership_event as e on e.event_id=w.grant_event_id where w.source_subscription_id='s719' and e.source_event_id='b-renew---719' and w.window_end='2026-09-10')
  and exists(select 1 from public.plus_membership_access_window as w join public.plus_membership_event as e on e.event_id=w.grant_event_id where w.source_subscription_id='s719' and e.source_event_id='z-renew---719' and w.window_end='2026-09-12'),
  '719 B window is clipped while the A window keeps its paid end');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000719','2026-09-11'),' {"access_status":"active"}'::jsonb,'719 A access remains active before its paid end');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000719','2026-09-12'),' {"access_status":"non-member"}'::jsonb,'719 A access closes at its exact paid end');

select lives_ok($$select public.record_plus_membership_event('windows','c720','s720','f-fail---720','50000000-0000-0000-0000-000000000720','plus_standard_monthly','membership_payment_failed','2026-09-10','2026-09-05','2026-10-20')$$,'720 B failure is delivered first');
select lives_ok($$select public.record_plus_membership_event('windows','c720','s720','a-renew----720','50000000-0000-0000-0000-000000000720','plus_early_access_monthly','membership_renewed','2026-09-07','2026-09-07','2026-09-12')$$,'720 later A renewal arrives before earlier B renewal');
select lives_ok($$select public.record_plus_membership_event('windows','c720','s720','z-renew----720','50000000-0000-0000-0000-000000000720','plus_standard_monthly','membership_renewed','2026-09-05','2026-09-15','2026-10-20')$$,'720 earlier B renewal arrives after A renewal');
select lives_ok($$select public.record_plus_membership_event('windows','c720','s720','m-start---720','50000000-0000-0000-0000-000000000720','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-05')$$,'720 A start arrives after buffered follow-ups');
select ok((select a.event_id < b.event_id from public.plus_membership_event as a
  join public.plus_membership_event as b on b.source_subscription_id=a.source_subscription_id
  where a.source_event_id='a-renew----720' and b.source_event_id='z-renew----720'),'720 A renewal ID sorts before earlier B renewal');
select is((select membership_status from public.plus_membership_stream_summary where source_subscription_id='s720'),'active','720 off-current B failure preserves active A status');
select ok(
  not exists(select 1 from public.plus_membership_access_window as w join public.plus_membership_event as e on e.event_id=w.grant_event_id where w.source_subscription_id='s720' and e.source_event_id='z-renew----720')
  and exists(select 1 from public.plus_membership_access_window as w join public.plus_membership_event as e on e.event_id=w.grant_event_id where w.source_subscription_id='s720' and e.source_event_id='a-renew----720' and w.window_end='2026-09-12'),
  '720 chronological B-to-A fold removes future B while preserving A');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000720','2026-09-11'),' {"access_status":"active"}'::jsonb,'720 A access remains active before its paid end');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000720','2026-09-12'),' {"access_status":"non-member"}'::jsonb,'720 A access closes at its exact paid end');

-- A failure removes a buffered future renewal as well as clipping elapsed coverage.
insert into auth.users (id, aud, role) values ('50000000-0000-0000-0000-000000000708','authenticated','authenticated');
select is(public.record_plus_membership_event('windows','c708','s708','s708-start','50000000-0000-0000-0000-000000000708','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-30'),'applied','708 initial paid window starts');
select is(public.record_plus_membership_event('windows','c708','s708','s708-renewal','50000000-0000-0000-0000-000000000708','plus_early_access_monthly','membership_renewed','2026-09-05','2026-09-15','2026-10-01'),'applied','708 future renewal window is recorded');
select is(public.record_plus_membership_event('windows','c708','s708','s708-failure','50000000-0000-0000-0000-000000000708','plus_early_access_monthly','membership_payment_failed','2026-09-10','2026-09-10','2026-10-01'),'applied','708 later failure clips and removes unpaid future coverage');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s708'),1::bigint,'708 only the clipped earlier window remains');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000708','2026-09-16'),' {"access_status":"non-member"}'::jsonb,'708 removed future renewal cannot grant access');

-- Terminal cutoffs and disqualification are stream-local and correctable.
select is(public.record_plus_membership_event('windows','c706','a706','a706-start','50000000-0000-0000-0000-000000000706','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','706 A starts');
select is(public.record_plus_membership_event('windows','c706','b706','b706-start','50000000-0000-0000-0000-000000000706','plus_early_access_monthly','membership_started','2026-09-20','2026-09-20','2026-10-01'),'applied','706 newer B starts');
select is(public.record_plus_membership_event('windows','c706','b706','b706-terminal','50000000-0000-0000-0000-000000000706','plus_early_access_monthly','membership_revoked','2026-09-15','2026-09-20','2026-10-01'),'applied','706 pre-start terminal invalidates B and reselects A');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000706','2026-09-22'),' {"access_status":"active"}'::jsonb,'706 invalid B allows qualified A to be selected again');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='b706'),false,'706 B remains unqualified after own pre-start terminal');

-- Own immediate and scheduled terminal cutoffs clip durable windows.
insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000709','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000710','authenticated','authenticated');
select is(public.record_plus_membership_event('windows','c709','s709','s709-start','50000000-0000-0000-0000-000000000709','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','709 initial paid window starts');
select is(public.record_plus_membership_event('windows','c709','s709','s709-terminal','50000000-0000-0000-0000-000000000709','plus_early_access_monthly','membership_revoked','2026-09-10','2026-09-01','2026-10-01'),'applied','709 immediate terminal applies');
select is((select window_end from public.plus_membership_access_window where source_subscription_id='s709'),'2026-09-10'::timestamptz,'709 immediate terminal clips the paid window');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000709','2026-09-11'),' {"access_status":"non-member"}'::jsonb,'709 terminal window is closed');
select is(public.record_plus_membership_event('windows','c710','s710','s710-start','50000000-0000-0000-0000-000000000710','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','710 initial paid window starts');
select is(public.record_plus_membership_event('windows','c710','s710','s710-cancel','50000000-0000-0000-0000-000000000710','plus_early_access_monthly','membership_canceled','2026-09-05','2026-09-01','2026-09-15',true),'applied','710 scheduled cancellation applies');
select is((select window_end from public.plus_membership_access_window where source_subscription_id='s710'),'2026-09-15'::timestamptz,'710 scheduled cutoff clips the paid window');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000710','2026-09-14'),' {"access_status":"active"}'::jsonb,'710 coverage remains through the scheduled cutoff');
select is(public._resolve_plus_membership_access_at('50000000-0000-0000-0000-000000000710','2026-09-15'),' {"access_status":"non-member"}'::jsonb,'710 scheduled cutoff is exclusive');

-- Legacy start evidence stays unknown even if a later v1 event is received.
insert into auth.users (id, aud, role) values ('50000000-0000-0000-0000-000000000711','authenticated','authenticated');
insert into public.plus_membership_subscription (source_system,source_customer_id,source_subscription_id,user_id)
values ('windows','c711','s711','50000000-0000-0000-0000-000000000711');
insert into public.plus_membership_event (
 event_id,source_system,source_customer_id,source_subscription_id,source_event_id,user_id,
 plan_code,event_type,occurred_at,period_start,period_end,membership_status,
 plan_active_when_observed,activation_eligible_when_observed
) values (
 'legacy-711','windows','c711','s711','legacy-start-711','50000000-0000-0000-0000-000000000711',
 'plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01',
 'active',true,true
);
select is(public.record_plus_membership_event('windows','c711','s711','v1-start-711','50000000-0000-0000-0000-000000000711','plus_early_access_monthly','membership_started','2026-09-02','2026-09-02','2026-10-02'),'stale','711 legacy ambiguity prevents a new initial grant');
select is((select reducer_version from public.plus_membership_event where source_event_id='v1-start-711'),1,'711 new receipt keeps its v1 proof marker');
select is((select count(*) from public.plus_membership_access_window where source_subscription_id='s711'),0::bigint,'711 legacy-ambiguous stream emits no paid windows');

-- The public service RPC samples the database clock itself and selects A while B is future.
insert into auth.users (id, aud, role) values ('50000000-0000-0000-0000-000000000712','authenticated','authenticated');
select is(public.record_plus_membership_event('windows','c712','a712','a712-start','50000000-0000-0000-0000-000000000712','plus_early_access_monthly','membership_started',now()-interval '1 day',now()-interval '1 day',now()+interval '10 days'),'applied','712 A is paid at current DB time');
select is(public.record_plus_membership_event('windows','c712','b712','b712-start','50000000-0000-0000-0000-000000000712','plus_early_access_monthly','membership_started',now()+interval '2 days',now()+interval '2 days',now()+interval '12 days'),'applied','712 B is future-dated');
select is(public.resolve_plus_membership_access('50000000-0000-0000-0000-000000000712'),' {"access_status":"active"}'::jsonb,'712 public RPC authorizes current A while B is future');

select ok(has_table_privilege('service_role','public.plus_membership_access_window','select'),'service role can inspect derived windows');
select ok(not has_table_privilege('authenticated','public.plus_membership_access_window','select'),'browser cannot read derived windows');
select ok(has_function_privilege('service_role','public.resolve_plus_membership_access(uuid)','execute'),'service role can call temporal access RPC');
select ok(not has_function_privilege('authenticated','public.resolve_plus_membership_access(uuid)','execute'),'browser cannot call temporal access RPC');
select ok(not has_function_privilege('anon','public._resolve_plus_membership_access_at(uuid,timestamp with time zone)','execute'),'anonymous role cannot call fixed-time helper');
select ok(not has_function_privilege('service_role','public._resolve_plus_membership_access_at(uuid,timestamp with time zone)','execute'),'fixed-time helper is not an API');
select ok(not has_table_privilege('authenticated','public.plus_membership_access_window','insert'),'browser cannot insert paid windows');
select ok(not has_table_privilege('authenticated','public.plus_membership_access_window','update'),'browser cannot update paid windows');
select ok(not has_table_privilege('authenticated','public.plus_membership_access_window','delete'),'browser cannot delete paid windows');
select ok(not has_table_privilege('service_role','public.plus_membership_access_window','insert'),'service role cannot directly insert paid windows');
select ok(not has_table_privilege('service_role','public.plus_membership_access_window','update'),'service role cannot directly update paid windows');
select ok(not has_table_privilege('service_role','public.plus_membership_access_window','delete'),'service role cannot directly delete paid windows');

select * from finish();
rollback;
