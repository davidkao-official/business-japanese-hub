begin;
select plan(51);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000640', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000641', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000642', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000643', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000644', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000645', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000646', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000647', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000648', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000649', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000650', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000651', 'authenticated', 'authenticated');

update public.plus_membership_plan set active = true
where plan_code = 'plus_early_access_monthly';

-- B pending, buffered failure at t30, then B's initial start at t10; C starts
-- at t15. C must win regardless of whether failure applied before C arrives.
select is(public.record_plus_membership_event('stream-order','cust-640','B-640','pending-B-640','50000000-0000-0000-0000-000000000640','plus_early_access_monthly','membership_pending',now(),now(),now()+interval '60 days'),'applied','failure permutation starts provisional B');
select is(public.record_plus_membership_event('stream-order','cust-640','B-640','fail-B-640','50000000-0000-0000-0000-000000000640','plus_early_access_monthly','membership_payment_failed',now()+interval '30 minutes',now(),now()+interval '90 days'),'stale','failure permutation buffers B failure');
select is(public.record_plus_membership_event('stream-order','cust-640','B-640','start-B-640','50000000-0000-0000-0000-000000000640','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '40 days'),'applied','failure permutation confirms B at t10');
select is(public.record_plus_membership_event('stream-order','cust-640','C-640','start-C-640','50000000-0000-0000-0000-000000000640','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '45 days'),'applied','failure permutation lets C t15 beat B applied failure t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000640'),'C-640','failure permutation selects C');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000640'),'active','failure permutation leaves C active');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000640'),now()+interval '45 days','failure permutation uses C horizon');
select is((select initial_start_occurred_at from public.plus_membership_subscription where source_subscription_id='B-640'),now()+interval '10 minutes','failure permutation retains B initial start key');
select ok((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='B-640'),'failure permutation retires replaced admitted B');

select is(public.record_plus_membership_event('stream-order','cust-641','B-641','pending-B-641','50000000-0000-0000-0000-000000000641','plus_early_access_monthly','membership_pending',now(),now(),now()+interval '60 days'),'applied','reverse failure permutation starts provisional B');
select is(public.record_plus_membership_event('stream-order','cust-641','B-641','start-B-641','50000000-0000-0000-0000-000000000641','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '40 days'),'applied','reverse failure permutation confirms B at t10');
select is(public.record_plus_membership_event('stream-order','cust-641','B-641','fail-B-641','50000000-0000-0000-0000-000000000641','plus_early_access_monthly','membership_payment_failed',now()+interval '30 minutes',now()+interval '10 minutes',now()+interval '70 days'),'applied','reverse failure permutation applies B failure at t30');
select is(public.record_plus_membership_event('stream-order','cust-641','C-641','start-C-641','50000000-0000-0000-0000-000000000641','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '45 days'),'applied','reverse failure permutation lets C t15 beat B applied failure t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000641'),'C-641','reverse failure permutation selects C');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000641'),'active','reverse failure permutation leaves C active');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000641'),now()+interval '45 days','reverse failure permutation uses C horizon');

-- Same permutation with a buffered renewal, proving plan/access horizon folding
-- cannot replace the source subscription's initial-start selection authority.
select is(public.record_plus_membership_event('stream-order','cust-642','B-642','pending-B-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_pending',now(),now(),now()+interval '60 days'),'applied','renewal permutation starts provisional B');
select is(public.record_plus_membership_event('stream-order','cust-642','B-642','renew-B-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_renewed',now()+interval '30 minutes',now()+interval '30 minutes',now()+interval '90 days'),'stale','renewal permutation buffers B renewal');
select is(public.record_plus_membership_event('stream-order','cust-642','B-642','start-B-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '40 days'),'applied','renewal permutation confirms B at t10');
select is(public.record_plus_membership_event('stream-order','cust-642','C-642','start-C-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '45 days'),'applied','renewal permutation lets C t15 beat B applied renewal t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000642'),'C-642','renewal permutation selects C');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000642'),now()+interval '45 days','renewal permutation uses C horizon');

-- Immediate and scheduled terminal facts are scoped to B. A different paid
-- stream beginning after B's initial start may win even before B's terminal
-- event/cutoff time.
select is(public.record_plus_membership_event('stream-order','cust-643','B-643','start-B-643','50000000-0000-0000-0000-000000000643','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','immediate terminal setup starts B');
select is(public.record_plus_membership_event('stream-order','cust-643','B-643','revoke-B-643','50000000-0000-0000-0000-000000000643','plus_early_access_monthly','membership_revoked',now()+interval '30 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','immediate terminal retires B');
select is(public.record_plus_membership_event('stream-order','cust-643','C-643','start-C-643','50000000-0000-0000-0000-000000000643','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','immediate B terminal does not block later-started C');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000643'),'C-643','immediate terminal case selects C');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000643'),'active','immediate terminal case grants C access');
select ok((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='B-643'),'immediate terminal remains recorded on B');

select is(public.record_plus_membership_event('stream-order','cust-644','B-644','start-B-644','50000000-0000-0000-0000-000000000644','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','scheduled cutoff setup starts B');
select is(public.record_plus_membership_event('stream-order','cust-644','B-644','cancel-B-644','50000000-0000-0000-0000-000000000644','plus_early_access_monthly','membership_canceled',now()+interval '20 minutes',now()+interval '10 minutes',now()+interval '30 minutes',true),'applied','scheduled cutoff records B terminal_at');
select is(public.record_plus_membership_event('stream-order','cust-644','C-644','start-C-644','50000000-0000-0000-0000-000000000644','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','scheduled cutoff does not block later-started C before cutoff');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000644'),'C-644','scheduled cutoff case selects C');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000644'),'active','scheduled cutoff case grants C access');
select ok((select terminal_at is not null from public.plus_membership_subscription where source_subscription_id='B-644'),'scheduled terminal evidence remains scoped to B');

-- A provisional successor inherits A's initial start key rather than A's later
-- immediate terminal event time. C t15 may therefore compete above A start t10.
select is(public.record_plus_membership_event('stream-order','cust-645','A-645','start-A-645','50000000-0000-0000-0000-000000000645','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','provisional case starts predecessor A');
select is(public.record_plus_membership_event('stream-order','cust-645','A-645','revoke-A-645','50000000-0000-0000-0000-000000000645','plus_early_access_monthly','membership_revoked',now()+interval '30 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','provisional case retires A');
select is(public.record_plus_membership_event('stream-order','cust-645','B-645','pending-B-645','50000000-0000-0000-0000-000000000645','plus_early_access_monthly','membership_pending',now()+interval '35 minutes',now()+interval '35 minutes',now()+interval '95 minutes'),'applied','provisional case selects B with inherited A start authority');
select is((select predecessor_barrier_occurred_at from public.plus_membership_subscription where source_subscription_id='B-645'),now()+interval '10 minutes','provisional case stores predecessor start key');
select is(public.record_plus_membership_event('stream-order','cust-645','C-645','start-C-645','50000000-0000-0000-0000-000000000645','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','provisional case lets C t15 beat inherited A start t10');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000645'),'C-645','provisional case selects C');

-- Terminal-first historical confirmation folds its own terminal, while a
-- distinct stream still competes against B's durable initial start.
select is(public.record_plus_membership_event('stream-order','cust-646','B-646','revoke-B-646','50000000-0000-0000-0000-000000000646','plus_early_access_monthly','membership_revoked',now()+interval '30 minutes',now(),now()+interval '80 minutes'),'stale','terminal-first case buffers B terminal');
select is(public.record_plus_membership_event('stream-order','cust-646','B-646','start-B-646','50000000-0000-0000-0000-000000000646','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '60 minutes'),'applied','terminal-first case confirms historical B start');
select is(public.record_plus_membership_event('stream-order','cust-646','C-646','start-C-646','50000000-0000-0000-0000-000000000646','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','terminal-first case lets C compete by B initial start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000646'),'C-646','terminal-first case selects C');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000646'),'active','terminal-first case preserves C access');

-- Same-time initial starts use the event identity tie-break. A second distinct
-- start identity on one source subscription is rejected before audit mutation.
select is(public.record_plus_membership_event('stream-order','cust-647','A-647','start-A-647','50000000-0000-0000-0000-000000000647','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '60 minutes'),'applied','tie case starts A');
select is(public.record_plus_membership_event('stream-order','cust-647','B-647','start-B-647','50000000-0000-0000-0000-000000000647','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '60 minutes'),'applied','tie case event-id winner B replaces A');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000647'),'B-647','tie case selects deterministic event-id winner');
select throws_ok($$select public.record_plus_membership_event('stream-order','cust-647','B-647','second-start-B-647','50000000-0000-0000-0000-000000000647','plus_early_access_monthly','membership_started',now()+interval '20 minutes',now()+interval '20 minutes',now()+interval '80 minutes')$$,'P0001','conflicting initial membership start for source subscription','conflicting second start fails closed');
select is((select count(*) from public.plus_membership_event where source_event_id='second-start-B-647'),0::bigint,'conflicting second start appends no audit event');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000647'),'B-647','conflicting second start leaves selection unchanged');

select * from finish();
rollback;
