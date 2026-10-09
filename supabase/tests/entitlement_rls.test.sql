begin;

select plan(22);

select ok(
  has_table_privilege('authenticated', 'public.book_entitlement', 'select'),
  'authenticated clients can query their RLS-filtered entitlements'
);
select ok(
  not has_table_privilege('authenticated', 'public.book_entitlement', 'insert')
  and not has_table_privilege('authenticated', 'public.book_entitlement', 'update')
  and not has_table_privilege('authenticated', 'public.book_entitlement', 'delete'),
  'authenticated clients cannot mutate entitlement evidence'
);
select ok(
  has_table_privilege('authenticated', 'public.reading_state', 'select')
  and has_table_privilege('authenticated', 'public.reading_state', 'insert')
  and has_table_privilege('authenticated', 'public.reading_state', 'update')
  and has_table_privilege('authenticated', 'public.reading_state', 'delete'),
  'authenticated clients can persist RLS-scoped reading state'
);
select ok(
  has_table_privilege('authenticated', 'public.bookmark', 'select')
  and has_table_privilege('authenticated', 'public.bookmark', 'insert'),
  'authenticated clients can use RLS-scoped bookmarks'
);

insert into auth.users (id, aud, role)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated');

insert into public.book_entitlement (
  user_id, book_id, provider, status, revoked_at, revocation_reason
) values
  (
    '50000000-0000-0000-0000-000000000001', 'active-book', 'manual',
    'active', null, null
  ),
  (
    '50000000-0000-0000-0000-000000000001', 'refunded-book', 'manual',
    'revoked', now(), 'refund'
  ),
  (
    '50000000-0000-0000-0000-000000000002', 'other-users-book', 'manual',
    'active', null, null
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.book_entitlement where book_id = 'active-book'),
  1::bigint,
  'an authenticated owner can read an active entitlement'
);
select is(
  (select count(*) from public.book_entitlement where book_id = 'refunded-book'),
  0::bigint,
  'a revoked entitlement is hidden at the RLS boundary'
);
select is(
  (select count(*) from public.book_entitlement where book_id = 'other-users-book'),
  0::bigint,
  'another user entitlement remains hidden'
);

select is(
  auth.uid(),
  '50000000-0000-0000-0000-000000000001'::uuid,
  'ordinary authenticated role resolves the verified owner identity'
);
select ok(
  row_security_active('public.reading_state'::regclass),
  'ordinary authenticated role is subject to reading-state row security'
);

-- Match the adapter's explicit target and composite conflict key. The same
-- owner inserts a row and then updates that existing (user_id, book_id) row.
insert into public.reading_state (user_id, book_id, chapter_id, block_id, "offset")
values (
  '50000000-0000-0000-0000-000000000001', 'shared-reading-state',
  'a-insert-chapter', 'a-insert-block', 11
)
on conflict (user_id, book_id) do update set
  chapter_id = excluded.chapter_id,
  block_id = excluded.block_id,
  "offset" = excluded."offset";
select results_eq(
  $$ select user_id, chapter_id, block_id, "offset"
       from public.reading_state
      where user_id = '50000000-0000-0000-0000-000000000001'
        and book_id = 'shared-reading-state' $$,
  $$ values (
       '50000000-0000-0000-0000-000000000001'::uuid,
       'a-insert-chapter'::text, 'a-insert-block'::text, 11::int
     ) $$,
  'owner A can insert reading state with explicit target A'
);

insert into public.reading_state (user_id, book_id, chapter_id, block_id, "offset")
values (
  '50000000-0000-0000-0000-000000000001', 'shared-reading-state',
  'a-update-chapter', 'a-update-block', 12
)
on conflict (user_id, book_id) do update set
  chapter_id = excluded.chapter_id,
  block_id = excluded.block_id,
  "offset" = excluded."offset";
select results_eq(
  $$ select user_id, chapter_id, block_id, "offset"
       from public.reading_state
      where user_id = '50000000-0000-0000-0000-000000000001'
        and book_id = 'shared-reading-state' $$,
  $$ values (
       '50000000-0000-0000-0000-000000000001'::uuid,
       'a-update-chapter'::text, 'a-update-block'::text, 12::int
     ) $$,
  'owner A can update its existing reading-state row through the upsert'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is(
  auth.uid(),
  '50000000-0000-0000-0000-000000000002'::uuid,
  'ordinary authenticated role resolves owner B identity'
);

insert into public.reading_state (user_id, book_id, chapter_id, block_id, "offset")
values (
  '50000000-0000-0000-0000-000000000002', 'shared-reading-state',
  'b-insert-chapter', 'b-insert-block', 21
)
on conflict (user_id, book_id) do update set
  chapter_id = excluded.chapter_id,
  block_id = excluded.block_id,
  "offset" = excluded."offset";
select results_eq(
  $$ select user_id, chapter_id, block_id, "offset"
       from public.reading_state
      where user_id = '50000000-0000-0000-0000-000000000002'
        and book_id = 'shared-reading-state' $$,
  $$ values (
       '50000000-0000-0000-0000-000000000002'::uuid,
       'b-insert-chapter'::text, 'b-insert-block'::text, 21::int
     ) $$,
  'owner B can insert reading state with explicit target B'
);

insert into public.reading_state (user_id, book_id, chapter_id, block_id, "offset")
values (
  '50000000-0000-0000-0000-000000000002', 'shared-reading-state',
  'b-update-chapter', 'b-update-block', 22
)
on conflict (user_id, book_id) do update set
  chapter_id = excluded.chapter_id,
  block_id = excluded.block_id,
  "offset" = excluded."offset";
select results_eq(
  $$ select user_id, chapter_id, block_id, "offset"
       from public.reading_state
      where user_id = '50000000-0000-0000-0000-000000000002'
        and book_id = 'shared-reading-state' $$,
  $$ values (
       '50000000-0000-0000-0000-000000000002'::uuid,
       'b-update-chapter'::text, 'b-update-block'::text, 22::int
     ) $$,
  'owner B can update its existing reading-state row through the upsert'
);

-- Preserve the complete A/B fixture, including the trigger-maintained timestamp,
-- as the expected state for each attempted cross-owner or anonymous write.
reset role;
create temporary table reading_state_fixture_snapshot on commit drop as
select user_id, book_id, chapter_id, block_id, "offset", updated_at
from public.reading_state
where user_id in (
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002'
);
select is(
  (select count(*) from reading_state_fixture_snapshot),
  2::bigint,
  'owner-role snapshot contains both A and B fixture rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ insert into public.reading_state (user_id, book_id, chapter_id, block_id, "offset")
     values (
       '50000000-0000-0000-0000-000000000001', 'absent-target',
       'b-to-a-absent', 'b-to-a-block', 31
     )
     on conflict (user_id, book_id) do update set
       chapter_id = excluded.chapter_id,
       block_id = excluded.block_id,
       "offset" = excluded."offset" $$,
  '42501', null,
  'ordinary owner B cannot target owner A on an absent-key upsert'
);
reset role;
select results_eq(
  $$ select user_id, book_id, chapter_id, block_id, "offset", updated_at
       from public.reading_state
      where user_id in (
        '50000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000002'
      )
      order by user_id, book_id $$,
  $$ select user_id, book_id, chapter_id, block_id, "offset", updated_at
       from reading_state_fixture_snapshot
      order by user_id, book_id $$,
  'absent-key rejection leaves the full sorted A/B snapshot unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ insert into public.reading_state (user_id, book_id, chapter_id, block_id, "offset")
     values (
       '50000000-0000-0000-0000-000000000001', 'shared-reading-state',
       'b-to-a-existing', 'b-to-a-block', 32
     )
     on conflict (user_id, book_id) do update set
       chapter_id = excluded.chapter_id,
       block_id = excluded.block_id,
       "offset" = excluded."offset" $$,
  '42501', null,
  'ordinary owner B cannot target owner A on an existing-key upsert'
);
reset role;
select results_eq(
  $$ select user_id, book_id, chapter_id, block_id, "offset", updated_at
       from public.reading_state
      where user_id in (
        '50000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000002'
      )
      order by user_id, book_id $$,
  $$ select user_id, book_id, chapter_id, block_id, "offset", updated_at
       from reading_state_fixture_snapshot
      order by user_id, book_id $$,
  'existing-key rejection leaves the full sorted A/B snapshot unchanged'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select ok(auth.uid() is null, 'cleared anonymous claims resolve to no user identity');
select throws_ok(
  $$ insert into public.reading_state (user_id, book_id, chapter_id, block_id, "offset")
     values (
       '50000000-0000-0000-0000-000000000001', 'anon-target',
       'anon-to-a', 'anon-block', 41
     )
     on conflict (user_id, book_id) do update set
       chapter_id = excluded.chapter_id,
       block_id = excluded.block_id,
       "offset" = excluded."offset" $$,
  '42501', null,
  'anonymous role cannot write an explicit owner target with cleared claims'
);
reset role;
select results_eq(
  $$ select user_id, book_id, chapter_id, block_id, "offset", updated_at
       from public.reading_state
      where user_id in (
        '50000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000002'
      )
      order by user_id, book_id $$,
  $$ select user_id, book_id, chapter_id, block_id, "offset", updated_at
       from reading_state_fixture_snapshot
      order by user_id, book_id $$,
  'anonymous rejection leaves the full sorted A/B snapshot unchanged'
);

select * from finish();
rollback;
