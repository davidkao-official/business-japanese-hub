-- #165: equal-time start/terminal ties in both event-key orders and all delivery orders.
begin;

select plan(108);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000380', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000381', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000382', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000383', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000384', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000385', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000386', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000387', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000388', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000389', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000390', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000391', 'authenticated', 'authenticated');

-- tie-00: start key a versus terminal m; delivery started -> terminal -> pending.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-00','tie-00','tie-00-a','50000000-0000-0000-0000-000000000380','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-00: started delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-00','tie-00','tie-00-m','50000000-0000-0000-0000-000000000380','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-00: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000380'), true), 'tie-00: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-00','tie-00','tie-00-p','50000000-0000-0000-0000-000000000380','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-00: pending delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000380'), true), 'tie-00: pending delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-00'), 'tie-00: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-00','tie-00','tie-00-m','50000000-0000-0000-0000-000000000380','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-00: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000380'), true), 'tie-00: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-00'), 3::bigint, 'tie-00: exactly three immutable events');

-- tie-01: start key a versus terminal m; delivery started -> pending -> terminal.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-01','tie-01','tie-01-a','50000000-0000-0000-0000-000000000381','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-01: started delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-01','tie-01','tie-01-p','50000000-0000-0000-0000-000000000381','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-01: pending delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-01','tie-01','tie-01-m','50000000-0000-0000-0000-000000000381','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-01: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000381'), true), 'tie-01: terminal delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-01'), 'tie-01: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-01','tie-01','tie-01-m','50000000-0000-0000-0000-000000000381','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-01: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000381'), true), 'tie-01: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-01'), 3::bigint, 'tie-01: exactly three immutable events');

-- tie-02: start key a versus terminal m; delivery terminal -> started -> pending.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-02','tie-02','tie-02-m','50000000-0000-0000-0000-000000000382','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-02: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000382'), true), 'tie-02: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-02','tie-02','tie-02-a','50000000-0000-0000-0000-000000000382','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-02: started delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000382'), true), 'tie-02: started delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-02','tie-02','tie-02-p','50000000-0000-0000-0000-000000000382','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-02: pending delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000382'), true), 'tie-02: pending delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-02'), 'tie-02: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-02','tie-02','tie-02-m','50000000-0000-0000-0000-000000000382','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-02: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000382'), true), 'tie-02: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-02'), 3::bigint, 'tie-02: exactly three immutable events');

-- tie-03: start key a versus terminal m; delivery terminal -> pending -> started.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-03','tie-03','tie-03-m','50000000-0000-0000-0000-000000000383','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-03: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000383'), true), 'tie-03: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-03','tie-03','tie-03-p','50000000-0000-0000-0000-000000000383','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-03: pending delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000383'), true), 'tie-03: pending delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-03','tie-03','tie-03-a','50000000-0000-0000-0000-000000000383','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-03: started delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000383'), true), 'tie-03: started delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-03'), 'tie-03: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-03','tie-03','tie-03-m','50000000-0000-0000-0000-000000000383','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-03: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000383'), true), 'tie-03: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-03'), 3::bigint, 'tie-03: exactly three immutable events');

-- tie-04: start key a versus terminal m; delivery pending -> started -> terminal.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-04','tie-04','tie-04-p','50000000-0000-0000-0000-000000000384','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-04: pending delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-04','tie-04','tie-04-a','50000000-0000-0000-0000-000000000384','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-04: started delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-04','tie-04','tie-04-m','50000000-0000-0000-0000-000000000384','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-04: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000384'), true), 'tie-04: terminal delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-04'), 'tie-04: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-04','tie-04','tie-04-m','50000000-0000-0000-0000-000000000384','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-04: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000384'), true), 'tie-04: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-04'), 3::bigint, 'tie-04: exactly three immutable events');

-- tie-05: start key a versus terminal m; delivery pending -> terminal -> started.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-05','tie-05','tie-05-p','50000000-0000-0000-0000-000000000385','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-05: pending delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-05','tie-05','tie-05-m','50000000-0000-0000-0000-000000000385','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-05: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000385'), true), 'tie-05: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-05','tie-05','tie-05-a','50000000-0000-0000-0000-000000000385','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-05: started delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000385'), true), 'tie-05: started delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-05'), 'tie-05: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-05','tie-05','tie-05-m','50000000-0000-0000-0000-000000000385','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-05: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000385'), true), 'tie-05: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-05'), 3::bigint, 'tie-05: exactly three immutable events');

-- tie-06: start key z versus terminal m; delivery started -> terminal -> pending.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-06','tie-06','tie-06-z','50000000-0000-0000-0000-000000000386','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-06: started delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-06','tie-06','tie-06-m','50000000-0000-0000-0000-000000000386','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-06: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000386'), true), 'tie-06: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-06','tie-06','tie-06-p','50000000-0000-0000-0000-000000000386','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-06: pending delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000386'), true), 'tie-06: pending delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-06'), 'tie-06: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-06','tie-06','tie-06-m','50000000-0000-0000-0000-000000000386','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-06: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000386'), true), 'tie-06: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-06'), 3::bigint, 'tie-06: exactly three immutable events');

-- tie-07: start key z versus terminal m; delivery started -> pending -> terminal.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-07','tie-07','tie-07-z','50000000-0000-0000-0000-000000000387','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-07: started delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-07','tie-07','tie-07-p','50000000-0000-0000-0000-000000000387','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-07: pending delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-07','tie-07','tie-07-m','50000000-0000-0000-0000-000000000387','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-07: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000387'), true), 'tie-07: terminal delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-07'), 'tie-07: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-07','tie-07','tie-07-m','50000000-0000-0000-0000-000000000387','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-07: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000387'), true), 'tie-07: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-07'), 3::bigint, 'tie-07: exactly three immutable events');

-- tie-08: start key z versus terminal m; delivery terminal -> started -> pending.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-08','tie-08','tie-08-m','50000000-0000-0000-0000-000000000388','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-08: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000388'), true), 'tie-08: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-08','tie-08','tie-08-z','50000000-0000-0000-0000-000000000388','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-08: started delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000388'), true), 'tie-08: started delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-08','tie-08','tie-08-p','50000000-0000-0000-0000-000000000388','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-08: pending delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000388'), true), 'tie-08: pending delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-08'), 'tie-08: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-08','tie-08','tie-08-m','50000000-0000-0000-0000-000000000388','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-08: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000388'), true), 'tie-08: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-08'), 3::bigint, 'tie-08: exactly three immutable events');

-- tie-09: start key z versus terminal m; delivery terminal -> pending -> started.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-09','tie-09','tie-09-m','50000000-0000-0000-0000-000000000389','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-09: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000389'), true), 'tie-09: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-09','tie-09','tie-09-p','50000000-0000-0000-0000-000000000389','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-09: pending delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000389'), true), 'tie-09: pending delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-09','tie-09','tie-09-z','50000000-0000-0000-0000-000000000389','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-09: started delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000389'), true), 'tie-09: started delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-09'), 'tie-09: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-09','tie-09','tie-09-m','50000000-0000-0000-0000-000000000389','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-09: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000389'), true), 'tie-09: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-09'), 3::bigint, 'tie-09: exactly three immutable events');

-- tie-10: start key z versus terminal m; delivery pending -> started -> terminal.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-10','tie-10','tie-10-p','50000000-0000-0000-0000-000000000390','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-10: pending delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-10','tie-10','tie-10-z','50000000-0000-0000-0000-000000000390','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-10: started delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-10','tie-10','tie-10-m','50000000-0000-0000-0000-000000000390','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-10: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000390'), true), 'tie-10: terminal delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-10'), 'tie-10: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-10','tie-10','tie-10-m','50000000-0000-0000-0000-000000000390','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-10: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000390'), true), 'tie-10: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-10'), 3::bigint, 'tie-10: exactly three immutable events');

-- tie-11: start key z versus terminal m; delivery pending -> terminal -> started.
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-11','tie-11','tie-11-p','50000000-0000-0000-0000-000000000391','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '10 days',now() + interval '20 days')$$, 'tie-11: pending delivery is safe');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-11','tie-11','tie-11-m','50000000-0000-0000-0000-000000000391','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-11: terminal delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000391'), true), 'tie-11: terminal delivery preserves terminal access');
select lives_ok($$select public.record_plus_membership_event('source-ties','tie-11','tie-11','tie-11-z','50000000-0000-0000-0000-000000000391','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days')$$, 'tie-11: started delivery is safe');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000391'), true), 'tie-11: started delivery preserves terminal access');
select ok((select terminal_at is not null and not qualified from public.plus_membership_stream_summary where source_system='source-ties' and source_subscription_id='tie-11'), 'tie-11: equal-time terminal cutoff keeps the stream unqualified');
select is(public.record_plus_membership_event('source-ties','tie-11','tie-11','tie-11-m','50000000-0000-0000-0000-000000000391','plus_early_access_monthly','membership_revoked',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days'), 'replayed', 'tie-11: terminal replay is idempotent');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000391'), true), 'tie-11: replay cannot restore access');
select is((select count(*) from public.plus_membership_event where source_system='source-ties' and source_subscription_id='tie-11'), 3::bigint, 'tie-11: exactly three immutable events');

select * from finish();
rollback;
