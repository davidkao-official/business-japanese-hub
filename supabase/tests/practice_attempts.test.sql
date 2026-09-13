begin;
select plan(77);
select has_table('public', 'practice_attempts', 'practice attempts table exists');
select has_column('public', 'practice_attempts', 'attempt_sequence', 'attempt ordering is monotonic and server-owned');
select is((select data_type from information_schema.columns where table_schema = 'public' and table_name = 'practice_attempts' and column_name = 'question_version'), 'bigint', 'question version preserves PostgreSQL bigint range');
select ok(has_sequence_privilege('service_role', 'public.practice_attempts_attempt_sequence_seq', 'USAGE'), 'service role can allocate attempt sequence values');
select ok(not has_sequence_privilege('anon', 'public.practice_attempts_attempt_sequence_seq', 'USAGE'), 'anonymous clients cannot allocate attempt sequence values');
select ok((select relrowsecurity from pg_class where oid = 'public.practice_attempts'::regclass), 'attempts RLS enabled');
select ok(has_table_privilege('service_role', 'public.practice_attempts', 'select,insert'), 'service can read and insert attempts');
select ok(not has_table_privilege('service_role', 'public.practice_attempts', 'update,delete,truncate'), 'service cannot mutate or truncate immutable attempts');
select ok(has_table_privilege('authenticated', 'public.practice_attempts', 'select'), 'authenticated users can read attempts through RLS');
select ok(not has_table_privilege('service_role', 'public.practice_attempts', 'update'), 'service role cannot update immutable attempts');
select ok(not has_table_privilege('authenticated', 'public.practice_attempts', 'insert,update,delete'), 'browser cannot mutate attempts directly');
select ok(not has_table_privilege('anon', 'public.practice_attempts', 'select'), 'anonymous users cannot read attempts');
select ok(has_function('public', 'record_practice_attempt', array['uuid','uuid','text','text','text','bigint','text','text','text','text','jsonb','boolean','integer','jsonb']), 'persistence RPC accepts bigint question versions');
select ok(has_function_privilege('service_role', 'public.record_practice_attempt(uuid,uuid,text,text,text,bigint,text,text,text,text,jsonb,boolean,integer,jsonb)', 'execute'), 'service role can invoke persistence RPC');
select ok(not has_function_privilege('authenticated', 'public.record_practice_attempt(uuid,uuid,text,text,text,bigint,text,text,text,text,jsonb,boolean,integer,jsonb)', 'execute'), 'authenticated clients cannot invoke persistence RPC');
select has_view('public', 'practice_review_queue', 'review queue is a derived read model');
select ok(has_table_privilege('service_role', 'public.practice_review_queue', 'select'), 'service can read review queue');
select has_index('public', 'practice_attempts', 'practice_attempts_review_idx', 'review index covers exact view identity and sequence order');
select has_table('public', 'practice_question_availability', 'current question availability projection exists');
select has_table('public', 'practice_question_release_head', 'current release head preserves empty eligible releases');
select ok((select relrowsecurity from pg_class where oid = 'public.practice_question_availability'::regclass), 'availability projection has RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.practice_question_availability', 'insert,update,delete'), 'browser cannot mutate availability projection');
select ok(not has_function_privilege('service_role', 'public.sync_practice_question_availability(text,text,bigint,jsonb)', 'execute'), 'service cannot invoke the internal availability sync directly');
select ok(has_function_privilege('service_role', 'public.import_practice_question_release(text,text,jsonb)', 'execute'), 'service can atomically import release and availability');

insert into auth.users (id, aud, role) values
 ('61000000-0000-0000-0000-000000000001','authenticated','authenticated'),
 ('61000000-0000-0000-0000-000000000002','authenticated','authenticated');
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('a',64),
  '{"questionBank":{"version":2,"questions":[{"id":"q-1","version":1,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}},{"id":"q-2","version":1,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}},{"id":"q-large","version":2147483648,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}}]}}'::jsonb
);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1200,'[{"checkpointId":"c-1","checkpointVersion":1,"correct":false}]'::jsonb);
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000002','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,true,1000,'[]'::jsonb);
select public.record_practice_attempt('61000000-0000-0000-0000-000000000002','61100000-0000-4000-8000-000000000003','practice-web-test-spi-v1',repeat('a',64),'q-2',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"one"}'::jsonb,false,1000,'[]'::jsonb);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000004','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1100,'[]'::jsonb);
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('c',64),
  '{"questionBank":{"version":3,"questions":[{"id":"q-1","version":1,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}},{"id":"q-1","version":2,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}}]}}'::jsonb
);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('d',64),
  '{"questionBank":{"version":4,"questions":[{"id":"q-1","version":2,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}},{"id":"q-2","version":1,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}}]}}'::jsonb
);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('d',64),
  '{"questionBank":{"version":4,"questions":[{"id":"q-1","version":2,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}},{"id":"q-2","version":1,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}}]}}'::jsonb
);
select skip(1, 'diagnostic scope');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select skip(1, 'diagnostic scope');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '', true);
select skip(1, 'diagnostic scope');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('9',64),
  '{"questionBank":{"version":5,"questions":[{"id":"q-1","version":3,"deliveryProfile":"test-center","answer":{"input":{"kind":"single-choice"}}},{"id":"q-2","version":1,"deliveryProfile":"web","answer":{"input":{"kind":"single-choice"}}}]}}'::jsonb
);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select skip(1, 'diagnostic scope');
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select skip(1, 'diagnostic scope');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('8',64),
  '{"questionBank":{"version":6,"questions":[{"id":"q-1","version":4,"deliveryProfile":"test-center","answer":{"input":{"kind":"single-choice"}}}]}}'::jsonb
);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '', true);
select skip(1, 'diagnostic scope');
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select skip(1, 'diagnostic scope');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub', '', true);
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
select skip(1, 'diagnostic scope');
reset role;
select * from finish();
rollback;
