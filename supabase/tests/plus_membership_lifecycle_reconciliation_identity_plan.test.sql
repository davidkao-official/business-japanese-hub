-- Current-contract coverage for immutable source identity and receipt-time plan proof.
begin;

select plan(26);

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000340','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000341','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000342','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000343','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000344','authenticated','authenticated');

update public.plus_membership_plan set active = true
where plan_code in ('plus_early_access_monthly','plus_standard_monthly');

-- Exact replay is idempotent; immutable fact or bound-user mismatches fail before audit mutation.
select is(public.record_plus_membership_event(
  'identity-source','customer-340','subscription-340','start-340',
  '50000000-0000-0000-0000-000000000340','plus_early_access_monthly',
  'membership_started','2026-09-01','2026-09-01','2026-10-01'
),'applied','340 initial start selects the stream');
select is(public.record_plus_membership_event(
  'identity-source','customer-340','subscription-340','start-340',
  '50000000-0000-0000-0000-000000000340','plus_early_access_monthly',
  'membership_started','2026-09-01','2026-09-01','2026-10-01'
),'replayed','340 exact immutable source event replays');
select throws_ok(
  $$select public.record_plus_membership_event('identity-source','customer-340','subscription-340','start-340','50000000-0000-0000-0000-000000000340','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-02')$$,
  'P0001','membership source event facts conflict for identity-source/start-340',
  '340 changed facts for the same source event fail closed'
);
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-340'),1::bigint,'340 identity mismatch adds no audit event');
select throws_ok(
  $$select public.record_plus_membership_event('identity-source','customer-340','subscription-340','wrong-user-340','50000000-0000-0000-0000-000000000341','plus_early_access_monthly','membership_started','2026-09-02','2026-09-02','2026-10-02')$$,
  'P0001','membership source binding belongs to another user',
  '340 source binding cannot be reassigned to another user'
);
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-340'),1::bigint,'340 claimed-user mismatch adds no audit event');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000340'),'subscription-340','340 selected source binding remains unchanged');

-- A false receipt snapshot stays unqualified after the catalog reopens.
update public.plus_membership_plan set active = false where plan_code='plus_standard_monthly';
select is(public.record_plus_membership_event(
  'identity-source','customer-342','subscription-342','inactive-start-342',
  '50000000-0000-0000-0000-000000000342','plus_standard_monthly',
  'membership_started','2026-09-01','2026-09-01','2026-10-01'
),'stale','342 inactive-plan start is retained without admission');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='inactive-start-342'),false,'342 inactive receipt fact is immutable');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='subscription-342'),false,'342 inactive receipt does not qualify');
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000342'),0::bigint,'342 inactive receipt creates no access');
update public.plus_membership_plan set active = true where plan_code='plus_standard_monthly';
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='subscription-342'),false,'342 catalog reopening cannot upgrade the receipt snapshot');
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000342'),0::bigint,'342 remains without access after catalog reopening');

-- Exact-plan continuation remains usable after closure; a false changed-plan receipt cannot switch the stream.
select is(public.record_plus_membership_event(
  'identity-source','customer-343','subscription-343','start-343',
  '50000000-0000-0000-0000-000000000343','plus_early_access_monthly',
  'membership_started','2026-09-01','2026-09-01','2026-10-01'
),'applied','343 active receipt qualifies its initial start');
update public.plus_membership_plan set active = false where plan_code='plus_early_access_monthly';
select is(public.record_plus_membership_event(
  'identity-source','customer-343','subscription-343','same-plan-343',
  '50000000-0000-0000-0000-000000000343','plus_early_access_monthly',
  'membership_renewed','2026-09-05','2026-10-01','2026-11-05'
),'applied','343 exact-plan renewal continues after catalog closure');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000343'),'2026-11-05'::timestamptz,'343 same-plan continuation updates access horizon');
update public.plus_membership_plan set active = false where plan_code='plus_standard_monthly';
select is(public.record_plus_membership_event(
  'identity-source','customer-343','subscription-343','inactive-switch-343',
  '50000000-0000-0000-0000-000000000343','plus_standard_monthly',
  'membership_renewed','2026-09-10','2026-11-05','2026-12-05'
),'stale','343 inactive changed-plan renewal remains audit only');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='inactive-switch-343'),false,'343 changed-plan receipt retains false catalog proof');
update public.plus_membership_plan set active = true where plan_code='plus_standard_monthly';
select is((select plan_code from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000343'),'plus_early_access_monthly','343 catalog reopening cannot switch the admitted plan');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000343'),'2026-11-05'::timestamptz,'343 inactive changed-plan receipt cannot extend access');

-- A changed-plan event active when received remains eligible when confirmation arrives after catalog closure.
update public.plus_membership_plan set active = true where plan_code='plus_early_access_monthly';
select is(public.record_plus_membership_event(
  'identity-source','customer-344','subscription-344','buffered-standard-344',
  '50000000-0000-0000-0000-000000000344','plus_standard_monthly',
  'membership_renewed','2026-09-05','2026-10-01','2026-11-10'
),'stale','344 renewal is retained before its confirmed start');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='buffered-standard-344'),true,'344 changed-plan receipt captures active catalog proof');
update public.plus_membership_plan set active = false where plan_code='plus_standard_monthly';
select is(public.record_plus_membership_event(
  'identity-source','customer-344','subscription-344','start-344',
  '50000000-0000-0000-0000-000000000344','plus_early_access_monthly',
  'membership_started','2026-09-01','2026-09-01','2026-10-01'
),'applied','344 confirmation folds its active-at-receipt changed-plan renewal');
select is((select plan_code from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000344'),'plus_standard_monthly','344 buffered proof advances the folded plan');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000344'),'2026-11-10'::timestamptz,'344 buffered proof advances the access horizon');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='subscription-344'),true,'344 summary remains qualified after folding buffered proof');

select * from finish();
rollback;
