begin;

select plan(67);

update public.plus_membership_plan set active = true
where plan_code = 'plus_early_access_monthly';

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000701','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000702','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000703','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000704','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000705','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000706','authenticated','authenticated');

-- A remains paid until B's effective start. Read selection is based on the
-- initial-start key effective by the one DB timestamp passed to the helper.
select is(public.record_plus_membership_event('windows','c701','a701','a701-start','50000000-0000-0000-0000-000000000701','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-09-20'),'applied','701 stream A starts');
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
