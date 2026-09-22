-- Provisional selection never permanently retires an unadmitted stream.
begin;

select plan(68);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000700', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000701', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000702', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000703', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000704', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000705', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000706', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000707', 'authenticated', 'authenticated');

-- Every permutation delivers the same facts: B pending at t20, C confirmed
-- start at t10, then B confirmed start at t30. A pending B is provisional:
-- C's confirmation may displace it without retiring B; B's later confirmation
-- wins and permanently retires admitted C.

-- 700: B pending, C start, B start.
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-700','subscription-700-b','pending-700-b','50000000-0000-0000-0000-000000000700','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 provisional 700 delivers B pending t20');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-700','subscription-700-c','start-700-c','50000000-0000-0000-0000-000000000700','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days')$$, '#165 provisional 700 delivers C start t10');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-700','subscription-700-b','start-700-b','50000000-0000-0000-0000-000000000700','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days')$$, '#165 provisional 700 delivers B start t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000700'),'subscription-700-b','#165 provisional 700 final current stream is B');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000700'),'active','#165 provisional 700 final state is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000700'),'active','#165 provisional 700 final access is active');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-700-b'),true,'#165 provisional 700 B is admitted only on confirmation');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-700-c'),true,'#165 provisional 700 B confirmation retires admitted C');

-- 701: B pending, B start, C start.
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-701','subscription-701-b','pending-701-b','50000000-0000-0000-0000-000000000701','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 provisional 701 delivers B pending t20');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-701','subscription-701-b','start-701-b','50000000-0000-0000-0000-000000000701','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days')$$, '#165 provisional 701 delivers B start t30');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-701','subscription-701-c','start-701-c','50000000-0000-0000-0000-000000000701','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days')$$, '#165 provisional 701 delivers C start t10');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000701'),'subscription-701-b','#165 provisional 701 final current stream is B');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000701'),'active','#165 provisional 701 final state is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000701'),'active','#165 provisional 701 final access is active');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-701-b'),true,'#165 provisional 701 B is admitted');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-701-c'),false,'#165 provisional 701 unadmitted C is not retired');

-- 702: C start, B pending, B start.
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-702','subscription-702-c','start-702-c','50000000-0000-0000-0000-000000000702','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days')$$, '#165 provisional 702 delivers C start t10');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-702','subscription-702-b','pending-702-b','50000000-0000-0000-0000-000000000702','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 provisional 702 delivers B pending t20');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-702','subscription-702-b','start-702-b','50000000-0000-0000-0000-000000000702','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days')$$, '#165 provisional 702 delivers B start t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000702'),'subscription-702-b','#165 provisional 702 final current stream is B');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000702'),'active','#165 provisional 702 final state is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000702'),'active','#165 provisional 702 final access is active');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-702-b'),true,'#165 provisional 702 B is admitted');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-702-c'),true,'#165 provisional 702 confirmed B retires admitted C');

-- 703: C start, B start, B pending.
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-703','subscription-703-c','start-703-c','50000000-0000-0000-0000-000000000703','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days')$$, '#165 provisional 703 delivers C start t10');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-703','subscription-703-b','start-703-b','50000000-0000-0000-0000-000000000703','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days')$$, '#165 provisional 703 delivers B start t30');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-703','subscription-703-b','pending-703-b','50000000-0000-0000-0000-000000000703','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 provisional 703 delivers B pending t20');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000703'),'subscription-703-b','#165 provisional 703 final current stream is B');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000703'),'active','#165 provisional 703 final state is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000703'),'active','#165 provisional 703 final access is active');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-703-b'),true,'#165 provisional 703 B is admitted');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-703-c'),true,'#165 provisional 703 C remains retired');

-- 704: B start, B pending, C start.
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-704','subscription-704-b','start-704-b','50000000-0000-0000-0000-000000000704','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days')$$, '#165 provisional 704 delivers B start t30');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-704','subscription-704-b','pending-704-b','50000000-0000-0000-0000-000000000704','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 provisional 704 delivers B pending t20');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-704','subscription-704-c','start-704-c','50000000-0000-0000-0000-000000000704','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days')$$, '#165 provisional 704 delivers C start t10');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000704'),'subscription-704-b','#165 provisional 704 final current stream is B');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000704'),'active','#165 provisional 704 final state is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000704'),'active','#165 provisional 704 final access is active');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-704-b'),true,'#165 provisional 704 B is admitted');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-704-c'),false,'#165 provisional 704 unadmitted C is not retired');

-- 705: B start, C start, B pending.
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-705','subscription-705-b','start-705-b','50000000-0000-0000-0000-000000000705','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days')$$, '#165 provisional 705 delivers B start t30');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-705','subscription-705-c','start-705-c','50000000-0000-0000-0000-000000000705','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days')$$, '#165 provisional 705 delivers C start t10');
select lives_ok($$select public.record_plus_membership_event('source-provisional','customer-705','subscription-705-b','pending-705-b','50000000-0000-0000-0000-000000000705','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 provisional 705 delivers B pending t20');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000705'),'subscription-705-b','#165 provisional 705 final current stream is B');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000705'),'active','#165 provisional 705 final state is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000705'),'active','#165 provisional 705 final access is active');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-705-b'),true,'#165 provisional 705 B is admitted');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-705-c'),false,'#165 provisional 705 unadmitted C is not retired');

-- A confirmed stream is never resurrected. Once B itself has been admitted and
-- C replaces it, B's later t30 confirmation remains stale because B is retired.
select is(public.record_plus_membership_event('source-provisional','customer-706','subscription-706-b','start-706-b10','50000000-0000-0000-0000-000000000706','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days'),'applied','#165 confirmed predecessor 706 admits B at t10');
select is(public.record_plus_membership_event('source-provisional','customer-706','subscription-706-c','start-706-c20','50000000-0000-0000-0000-000000000706','plus_early_access_monthly','membership_started',now() - interval '10 days',now() - interval '10 days',now() + interval '25 days'),'applied','#165 confirmed predecessor 706 admits C at t20');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-706-b'),true,'#165 confirmed predecessor 706 retires original admitted B');
select is(public.record_plus_membership_event('source-provisional','customer-706','subscription-706-b','start-706-b30','50000000-0000-0000-0000-000000000706','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days'),'stale','#165 confirmed predecessor 706 does not resurrect retired B at t30');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000706'),'subscription-706-c','#165 confirmed predecessor 706 keeps C current');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000706'),'active','#165 confirmed predecessor 706 keeps C access active');

-- A predecessor terminal barrier belongs to B even after provisional B is
-- displaced. B's t4 start cannot later bypass A's t5 terminal; B's t30 start
-- can, and then permanently retires C.
select is(public.record_plus_membership_event('source-provisional','customer-707','subscription-707-a','start-707-a','50000000-0000-0000-0000-000000000707','plus_early_access_monthly','membership_started',now() - interval '30 days',now() - interval '30 days',now() + interval '20 days'),'applied','#165 inherited barrier 707 admits predecessor A');
select is(public.record_plus_membership_event('source-provisional','customer-707','subscription-707-a','revoke-707-a','50000000-0000-0000-0000-000000000707','plus_early_access_monthly','membership_revoked',now() - interval '25 days',now() - interval '30 days',now() + interval '20 days'),'applied','#165 inherited barrier 707 establishes A terminal t5');
select is(public.record_plus_membership_event('source-provisional','customer-707','subscription-707-b','pending-707-b','50000000-0000-0000-0000-000000000707','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days'),'applied','#165 inherited barrier 707 selects provisional B');
select is((select predecessor_barrier_occurred_at from public.plus_membership_subscription where source_subscription_id='subscription-707-b'),(select occurred_at from public.plus_membership_event where source_system='source-provisional' and source_event_id='revoke-707-a'),'#165 inherited barrier 707 persists A terminal time on B');
select is((select predecessor_barrier_event_id from public.plus_membership_subscription where source_subscription_id='subscription-707-b'),(select event_id from public.plus_membership_event where source_system='source-provisional' and source_event_id='revoke-707-a'),'#165 inherited barrier 707 persists A terminal identity on B');
select is(public.record_plus_membership_event('source-provisional','customer-707','subscription-707-c','start-707-c','50000000-0000-0000-0000-000000000707','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '25 days'),'applied','#165 inherited barrier 707 C t10 displaces provisional B');
select is((select retired_at is null from public.plus_membership_subscription where source_subscription_id='subscription-707-b'),true,'#165 inherited barrier 707 does not retire provisional B when C displaces it');
select is(public.record_plus_membership_event('source-provisional','customer-707','subscription-707-b','pending-707-b-later','50000000-0000-0000-0000-000000000707','plus_early_access_monthly','membership_pending',now() - interval '5 days',now() - interval '5 days',now() + interval '30 days'),'stale','#165 displaced provisional pending cannot replace admitted C');
select is((select predecessor_barrier_occurred_at from public.plus_membership_subscription where source_subscription_id='subscription-707-b'),now() - interval '25 days','#165 displaced provisional pending preserves predecessor time');
select is((select predecessor_barrier_event_id from public.plus_membership_subscription where source_subscription_id='subscription-707-b'),(select event_id from public.plus_membership_event where source_system='source-provisional' and source_event_id='revoke-707-a'),'#165 displaced provisional pending preserves predecessor identity');
select is(public.record_plus_membership_event('source-provisional','customer-707','subscription-707-b','start-707-b4','50000000-0000-0000-0000-000000000707','plus_early_access_monthly','membership_started',now() - interval '26 days',now() - interval '26 days',now() + interval '24 days'),'stale','#165 inherited barrier 707 B t4 cannot bypass persisted A terminal');
select is(public.record_plus_membership_event('source-provisional','customer-707','subscription-707-b','start-707-b30','50000000-0000-0000-0000-000000000707','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days'),'applied','#165 inherited barrier 707 B t30 beats inherited barrier');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000707'),'subscription-707-b','#165 inherited barrier 707 B is final current stream');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-707-c'),true,'#165 inherited barrier 707 confirmed B retires admitted C');

select * from finish();
rollback;
