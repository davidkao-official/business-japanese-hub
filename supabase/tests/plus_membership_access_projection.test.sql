begin;

select plan(10);

select has_table(
  'public', 'plus_membership_access',
  'Plus access projection is a dedicated table, separate from book ownership'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.plus_membership_access'::regclass),
  'Plus access projection has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.plus_membership_access', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.plus_membership_access', 'select,insert,update,delete'),
  'Browser roles cannot read or mutate the authoritative projection'
);
select ok(
  has_table_privilege('service_role', 'public.plus_membership_access', 'select,insert,update')
  and not has_table_privilege('service_role', 'public.plus_membership_access', 'delete'),
  'Service role has controlled projection read/write without delete'
);
select throws_ok(
  $$ insert into public.plus_membership_access (user_id, membership_status, current_period_end)
     values ('50000000-0000-0000-0000-000000000001', 'forged', now() + interval '1 day') $$,
  '23514',
  'new row for relation "plus_membership_access" violates check constraint "plus_membership_access_status_bounded"',
  'Projection rejects unknown lifecycle states'
);

insert into auth.users (id, aud, role)
values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated');

insert into public.plus_membership_access (user_id, membership_status, current_period_end)
values
  ('50000000-0000-0000-0000-000000000001', 'active', now() + interval '1 day'),
  ('50000000-0000-0000-0000-000000000002', 'expired', now() - interval '1 day');

select is(
  (select count(*) from public.plus_membership_access where membership_status = 'active'),
  1::bigint,
  'a controlled active projection row is stored'
);
select is(
  (select count(*) from public.plus_membership_access where membership_status = 'expired'),
  1::bigint,
  'an expired projection row remains non-active evidence'
);
select is(
  (select count(*) from public.plus_membership_access where user_id = '50000000-0000-0000-0000-000000000002'),
  1::bigint,
  'projection rows are keyed per user and do not collapse across users'
);

select ok(
  has_function_privilege('service_role', 'public.plus_membership_access_set_updated_at()', 'execute')
  and not has_function_privilege('authenticated', 'public.plus_membership_access_set_updated_at()', 'execute'),
  'Projection trigger function is not client-callable'
);
select ok(
  not has_table_privilege('authenticated', 'public.book_entitlement', 'insert,update,delete'),
  'Historical book entitlement mutation remains independently closed'
);

select * from finish();
rollback;
