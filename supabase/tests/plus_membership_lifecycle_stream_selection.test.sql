begin;
select plan(97);

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
  ('50000000-0000-0000-0000-000000000651', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000652', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000653', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000654', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000655', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000656', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000657', 'authenticated', 'authenticated');

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
select is((select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-641'),(select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-640'),'failure delivery orders converge on C selection key');
select is((select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-641'),(select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-640'),'failure delivery orders retain B retirement evidence');

-- Same permutation with a buffered renewal, proving plan/access horizon folding
-- cannot replace the source subscription's initial-start selection authority.
select is(public.record_plus_membership_event('stream-order','cust-642','B-642','pending-B-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_pending',now(),now(),now()+interval '60 days'),'applied','renewal permutation starts provisional B');
select is(public.record_plus_membership_event('stream-order','cust-642','B-642','renew-B-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_renewed',now()+interval '30 minutes',now()+interval '30 minutes',now()+interval '90 days'),'stale','renewal permutation buffers B renewal');
select is(public.record_plus_membership_event('stream-order','cust-642','B-642','start-B-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '40 days'),'applied','renewal permutation confirms B at t10');
select is(public.record_plus_membership_event('stream-order','cust-642','C-642','start-C-642','50000000-0000-0000-0000-000000000642','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '45 days'),'applied','renewal permutation lets C t15 beat B applied renewal t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000642'),'C-642','renewal permutation selects C');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000642'),now()+interval '45 days','renewal permutation uses C horizon');

select is(public.record_plus_membership_event('stream-order','cust-657','B-657','pending-B-657','50000000-0000-0000-0000-000000000657','plus_early_access_monthly','membership_pending',now(),now(),now()+interval '60 days'),'applied','reverse renewal permutation starts provisional B');
select is(public.record_plus_membership_event('stream-order','cust-657','B-657','start-B-657','50000000-0000-0000-0000-000000000657','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '40 days'),'applied','reverse renewal permutation confirms B at t10');
select is(public.record_plus_membership_event('stream-order','cust-657','B-657','renew-B-657','50000000-0000-0000-0000-000000000657','plus_early_access_monthly','membership_renewed',now()+interval '30 minutes',now()+interval '30 minutes',now()+interval '90 days'),'applied','reverse renewal permutation applies B renewal at t30');
select is(public.record_plus_membership_event('stream-order','cust-657','C-657','start-C-657','50000000-0000-0000-0000-000000000657','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '45 days'),'applied','reverse renewal permutation lets C t15 beat B applied renewal t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000657'),(select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000642'),'renewal delivery orders select the same final stream');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000657'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000642'),'renewal delivery orders converge on access horizon');
select is((select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-657'),(select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-642'),'renewal delivery orders converge on C selection key');
select is((select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-657'),(select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-642'),'renewal delivery orders retain B retirement evidence');

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


-- Reverse delivery for immediate terminal: terminal arrives before the
-- historical B confirmation. Both orders select C and retain B's retirement.
select is(public.record_plus_membership_event('stream-order','cust-652','B-652','revoke-B-652','50000000-0000-0000-0000-000000000652','plus_early_access_monthly','membership_revoked',now()+interval '30 minutes',now(),now()+interval '80 minutes'),'stale','reverse immediate terminal arrives before B has reducer state');
select is(public.record_plus_membership_event('stream-order','cust-652','B-652','start-B-652','50000000-0000-0000-0000-000000000652','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','reverse immediate terminal confirms historical B at t10');
select is(public.record_plus_membership_event('stream-order','cust-652','C-652','start-C-652','50000000-0000-0000-0000-000000000652','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','reverse immediate terminal lets C t15 beat B initial start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000652'),(select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000643'),'immediate terminal delivery orders select the same final stream');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000652'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000643'),'immediate terminal delivery orders converge on access horizon');
select is((select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-652'),(select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-643'),'immediate terminal delivery orders converge on C selection key');
select is((select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-652'),(select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-643'),'immediate terminal delivery orders retain B retirement evidence');

-- Reverse scheduled-cancellation delivery: the cutoff is recorded before B's
-- initial start, then folded when B confirms. C still beats B by start key.
select is(public.record_plus_membership_event('stream-order','cust-653','B-653','cancel-B-653','50000000-0000-0000-0000-000000000653','plus_early_access_monthly','membership_canceled',now()+interval '20 minutes',now()+interval '10 minutes',now()+interval '30 minutes',true),'applied','reverse scheduled cutoff records B terminal before start');
select is(public.record_plus_membership_event('stream-order','cust-653','B-653','start-B-653','50000000-0000-0000-0000-000000000653','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','reverse scheduled cutoff confirms B before effective end');
select is(public.record_plus_membership_event('stream-order','cust-653','C-653','start-C-653','50000000-0000-0000-0000-000000000653','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','reverse scheduled cutoff lets C compete above B initial start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000653'),(select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000644'),'scheduled cutoff delivery orders select the same final stream');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000653'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000644'),'scheduled cutoff delivery orders converge on access horizon');
select is((select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-653'),(select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-644'),'scheduled cutoff delivery orders converge on C selection key');
select is((select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-653'),(select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-644'),'scheduled cutoff delivery orders retain B retirement evidence');

-- Forward terminal-first counterpart for historical confirmation.
select is(public.record_plus_membership_event('stream-order','cust-654','B-654','start-B-654','50000000-0000-0000-0000-000000000654','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '60 minutes'),'applied','forward terminal confirmation starts B at t10');
select is(public.record_plus_membership_event('stream-order','cust-654','B-654','revoke-B-654','50000000-0000-0000-0000-000000000654','plus_early_access_monthly','membership_revoked',now()+interval '30 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','forward terminal confirmation retires B at t30');
select is(public.record_plus_membership_event('stream-order','cust-654','C-654','start-C-654','50000000-0000-0000-0000-000000000654','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','forward terminal confirmation lets C t15 replace B');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000654'),(select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000646'),'terminal-first confirmation orders select the same final stream');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000654'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000646'),'terminal-first confirmation orders converge on access horizon');
select is((select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-654'),(select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-646'),'terminal-first confirmation orders converge on C selection key');
select is((select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-654'),(select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='B-646'),'terminal-first confirmation orders retain B retirement evidence');

-- Reverse provisional delivery: B's pending observation precedes A's terminal,
-- so it cannot displace live A. After A retires, C competes against A's start
-- key and reaches the same selected/access state as the provisional-first case.
select is(public.record_plus_membership_event('stream-order','cust-655','A-655','start-A-655','50000000-0000-0000-0000-000000000655','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','reverse provisional order starts A');
select is(public.record_plus_membership_event('stream-order','cust-655','B-655','pending-B-655','50000000-0000-0000-0000-000000000655','plus_early_access_monthly','membership_pending',now()+interval '35 minutes',now()+interval '35 minutes',now()+interval '95 minutes'),'stale','reverse provisional order keeps B pending while A is live');
select is(public.record_plus_membership_event('stream-order','cust-655','A-655','revoke-A-655','50000000-0000-0000-0000-000000000655','plus_early_access_monthly','membership_revoked',now()+interval '30 minutes',now()+interval '10 minutes',now()+interval '80 minutes'),'applied','reverse provisional order retires A');
select is(public.record_plus_membership_event('stream-order','cust-655','C-655','start-C-655','50000000-0000-0000-0000-000000000655','plus_early_access_monthly','membership_started',now()+interval '15 minutes',now()+interval '15 minutes',now()+interval '60 minutes'),'applied','reverse provisional order lets C beat A initial start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000655'),(select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000645'),'provisional delivery orders select the same final stream');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000655'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000645'),'provisional delivery orders converge on access horizon');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000655'),(select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000645'),'provisional delivery orders converge on access status');
select is((select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-655'),(select initial_start_event_id from public.plus_membership_subscription where source_subscription_id='C-645'),'provisional delivery orders converge on C selection key');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='B-655'),(select retired_at is not null from public.plus_membership_subscription where source_subscription_id='B-645'),'provisional delivery orders keep B unretired');
select is((select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='A-655'),(select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='A-645'),'provisional delivery orders retain A retirement evidence');

-- Reverse conflicting-start identity: whichever distinct start is first becomes
-- immutable; the second attempt fails before audit/projection mutation.
select is(public.record_plus_membership_event('stream-order','cust-656','B-656','start-B-656','50000000-0000-0000-0000-000000000656','plus_early_access_monthly','membership_started',now()+interval '20 minutes',now()+interval '20 minutes',now()+interval '60 minutes'),'applied','reverse conflict case starts B at t20 first');
select throws_ok($$select public.record_plus_membership_event('stream-order','cust-656','B-656','second-start-B-656','50000000-0000-0000-0000-000000000656','plus_early_access_monthly','membership_started',now()+interval '10 minutes',now()+interval '10 minutes',now()+interval '80 minutes')$$,'P0001','conflicting initial membership start for source subscription','reverse conflict case rejects earlier-time second start');
select is((select initial_start_occurred_at from public.plus_membership_subscription where source_subscription_id='B-656'),now()+interval '20 minutes','reverse conflict case keeps first durable selection time');
select is((select count(*) from public.plus_membership_event where source_event_id='second-start-B-656'),0::bigint,'reverse conflict case appends no conflicting start audit');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000656'),now()+interval '60 minutes','reverse conflict case leaves the first start horizon unchanged');

select * from finish();
rollback;
