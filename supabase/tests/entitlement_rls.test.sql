begin;

select plan(7);

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

reset role;
select * from finish();
rollback;
