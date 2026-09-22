-- Isolated lifecycle scenario group; all assertions retained from the original suite.
begin;

select plan(37);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000205', 'authenticated', 'authenticated');

-- #164 terminal evidence on an unselected, not-yet-admitted stream retires its
-- own binding. A temporally earlier start can still be considered by the
-- retired-stream exception, while an older start that cannot select it remains
-- stale and leaves current stream A unchanged.
select is(public.record_plus_membership_event('source-a','customer-204','subscription-204-a','start-204-a','50000000-0000-0000-0000-000000000204','plus_early_access_monthly','membership_started','2026-09-10T00:00:00Z','2026-09-10T00:00:00Z','2026-10-10T00:00:00Z'),'applied','#164 stale terminal test starts its current stream');
select is(public.record_plus_membership_event('source-a','customer-204','subscription-204-c','revoke-204-c','50000000-0000-0000-0000-000000000204','plus_early_access_monthly','membership_revoked','2026-09-05T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'stale','#164 terminal retires C while the stale terminal result leaves current A unchanged');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000204'),'subscription-204-a','#164 stale terminal leaves the current stream unchanged');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000204'),'active','#164 stale terminal cannot remove current access');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-204-c'),true,'#164 terminal-before-earlier-start retires C while stale current A is unchanged');
select is((select retired_event_id is not null from public.plus_membership_subscription where source_subscription_id='subscription-204-c'),true,'#164 terminal-before-earlier-start records C terminal retirement evidence');
select is(public.record_plus_membership_event('source-a','customer-204','subscription-204-c','start-204-c','50000000-0000-0000-0000-000000000204','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'stale','#164 stale terminal cannot be reconciled from an older successor start');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000204'),'subscription-204-a','#164 older successor start leaves the current stream unchanged');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000204'),'active','#164 older successor start cannot remove current access');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-204-c'),2::bigint,'#164 stale terminal keeps its durable audit evidence');

select is(public.record_plus_membership_event('source-a','customer-205','subscription-205-a','start-205-a','50000000-0000-0000-0000-000000000205','plus_early_access_monthly','membership_started','2026-09-10T00:00:00Z','2026-09-10T00:00:00Z','2026-10-10T00:00:00Z'),'applied','#164 successor reconciliation starts its current stream');
select is(public.record_plus_membership_event('source-a','customer-205','subscription-205-c','expire-205-c','50000000-0000-0000-0000-000000000205','plus_early_access_monthly','membership_expired','2026-09-15T00:00:00Z','2026-09-15T00:00:00Z','2026-10-15T00:00:00Z'),'stale','#164 successor reconciliation terminal retires C before its earlier start is considered');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-205-c'),true,'#164 successor reconciliation confirms terminal retires C before its earlier start is considered');
select is(public.record_plus_membership_event('source-a','customer-205','subscription-205-c','start-205-c','50000000-0000-0000-0000-000000000205','plus_early_access_monthly','membership_started','2026-09-12T00:00:00Z','2026-09-12T00:00:00Z','2026-10-12T00:00:00Z'),'applied','#164 successor reconciliation lets the earlier start select the successor');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000205'),'subscription-205-c','#164 successor reconciliation makes the selected successor current');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000205'),'expired','#164 successor reconciliation folds the buffered terminal evidence');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000205'),'expired','#164 successor reconciliation revokes selected successor access');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-205-c'),true,'#164 successor reconciliation retires the selected successor after folding terminal evidence');

-- #164 durable plan admission marker (append-only repair 20260922270). A
-- binding created by an unconfirmed pending event is not admitted, so a later
-- start is still gated by plan availability; an admitted stream keeps accepting
-- renewal and period-end cancellation after a plan deactivation.
select is(public.record_plus_membership_event('source-a','customer-202','subscription-202','pending-202','50000000-0000-0000-0000-000000000202','plus_early_access_monthly','membership_pending','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','#164 inactive-plan admission records an unconfirmed pending binding');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000202'),'pending','#164 inactive-plan admission projects pending without access');
select is((select admitted_at is null from public.plus_membership_subscription where source_subscription_id='subscription-202'),true,'#164 inactive-plan admission leaves the pending binding unadmitted');
update public.plus_membership_plan set active = false where plan_code = 'plus_early_access_monthly';
select is((select active from public.plus_membership_plan where plan_code='plus_early_access_monthly'),false,'#164 inactive-plan admission deactivates the plan for the pending case');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-202','subscription-202','start-202','50000000-0000-0000-0000-000000000202','plus_early_access_monthly','membership_started','2026-09-02T00:00:00Z','2026-09-02T00:00:00Z','2026-10-02T00:00:00Z')$$, 'P0001', 'plan plus_early_access_monthly is not active for membership activation', '#164 inactive-plan admission rejects a start on a pending-created binding');
select is((select admitted_at is null from public.plus_membership_subscription where source_subscription_id='subscription-202'),true,'#164 inactive-plan admission keeps the rejected start from admitting the binding');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000202'),'pending','#164 inactive-plan admission leaves the pending state after the rejected start');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000202'),'pending','#164 inactive-plan admission cannot project active access from a rejected start');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-202'),1::bigint,'#164 inactive-plan admission keeps the rejected start out of the durable audit');

update public.plus_membership_plan set active = true where plan_code = 'plus_early_access_monthly';
select is(public.record_plus_membership_event('source-a','customer-203','subscription-203','start-203','50000000-0000-0000-0000-000000000203','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-11-01T00:00:00Z'),'applied','#164 inactive-plan admission starts and admits a valid binding');
select is((select admitted_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-203'),true,'#164 inactive-plan admission durably marks the admitted binding');
update public.plus_membership_plan set active = false where plan_code = 'plus_early_access_monthly';
select is(public.record_plus_membership_event('source-a','customer-203','subscription-203','cancel-203','50000000-0000-0000-0000-000000000203','plus_early_access_monthly','membership_canceled','2026-09-02T00:00:00Z','2026-09-01T00:00:00Z','2026-11-01T00:00:00Z',true),'applied','#164 inactive-plan admission still accepts period-end cancellation on an admitted binding');
select is((select terminal_at from public.plus_membership_subscription where source_subscription_id='subscription-203'),'2026-11-01T00:00:00Z'::timestamptz,'#164 inactive-plan admission records the admitted stream cutoff');
select is((select terminal_event_id is not null from public.plus_membership_subscription where source_subscription_id='subscription-203'),true,'#164 inactive-plan admission records the admitted stream terminal evidence');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000203'),'active','#164 inactive-plan admission keeps the admitted stream active before its effective end');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000203'),'2026-11-01T00:00:00Z'::timestamptz,'#164 inactive-plan admission clamps the admitted stream at the recorded cutoff');
select is(public.record_plus_membership_event('source-a','customer-203','subscription-203','renew-203','50000000-0000-0000-0000-000000000203','plus_early_access_monthly','membership_renewed','2026-09-15T00:00:00Z','2026-11-01T00:00:00Z','2026-12-01T00:00:00Z'),'applied','#164 inactive-plan admission accepts a pre-cutoff renewal on an admitted binding');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000203'),'2026-11-01T00:00:00Z'::timestamptz,'#164 inactive-plan admission keeps the admitted stream clamped at the cutoff');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-203' and event_type='membership_expired'),0::bigint,'#164 inactive-plan admission enforces the period-end cutoff without an expiration event');
update public.plus_membership_plan set active = true where plan_code = 'plus_early_access_monthly';

select * from finish();
rollback;
