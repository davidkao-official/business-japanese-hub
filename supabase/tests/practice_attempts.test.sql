begin;
select plan(54);
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
select ok((select relrowsecurity from pg_class where oid = 'public.practice_question_availability'::regclass), 'availability projection has RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.practice_question_availability', 'insert,update,delete'), 'browser cannot mutate availability projection');
select ok(not has_function_privilege('service_role', 'public.sync_practice_question_availability(text,text,bigint,jsonb)', 'execute'), 'service cannot invoke the internal availability sync directly');
select ok(has_function_privilege('service_role', 'public.import_practice_question_release(text,text,jsonb)', 'execute'), 'service can atomically import release and availability');

insert into auth.users (id, aud, role) values
 ('61000000-0000-0000-0000-000000000001','authenticated','authenticated'),
 ('61000000-0000-0000-0000-000000000002','authenticated','authenticated');
set local role service_role;
select is((public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1200,'[{"checkpointId":"c-1","checkpointVersion":1,"correct":false}]'::jsonb)->>'kind','persisted','first attempt is persisted');
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000002','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,true,1000,'[]'::jsonb);
select public.record_practice_attempt('61000000-0000-0000-0000-000000000002','61100000-0000-4000-8000-000000000003','practice-web-test-spi-v1',repeat('a',64),'q-2',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"one"}'::jsonb,false,1000,'[]'::jsonb);
select is((select count(*) from public.practice_attempts),3::bigint,'server persistence stores bounded attempts');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('a',64),
  '{"questionBank":{"version":1,"questions":[{"id":"q-1","version":1},{"id":"q-2","version":1}]}}'::jsonb
);
select is((select count(*) from public.private_content_release where content_id='practice-web-test-spi-v1' and revision=repeat('a',64)),1::bigint,'atomic import stores the immutable release');
select throws_ok($$select public.import_practice_question_release('practice-web-test-spi-v1', repeat('a',64), '{"questionBank":{"version":1,"questions":["changed"]}}'::jsonb)$$,'22023',null,'same revision with a different payload is rejected');
select throws_ok($$select public.import_practice_question_release('practice-web-test-spi-v1', repeat('e',64), '{"questionBank":{"version":0,"questions":[{"id":"q-1","version":1}]}}'::jsonb)$$,'23514',null,'failed availability sync rolls back its release insert');
select is((select count(*) from public.private_content_release where content_id='practice-web-test-spi-v1' and revision=repeat('e',64)),0::bigint,'failed import leaves no immutable release behind');
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000002'),1::bigint,'current incorrect question remains actionable after server sync');
select is((public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000005','practice-web-test-spi-v1',repeat('a',64),'q-large',2147483648,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,true,1000,'[]'::jsonb)->>'kind','persisted','bigint question version persists through RPC');
select is((select question_version from public.practice_attempts where client_attempt_id='61100000-0000-4000-8000-000000000005'),2147483648::bigint,'persisted question version retains 2147483648');
select is((public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1200,'[{"checkpointId":"c-1","checkpointVersion":1,"correct":false}]'::jsonb)->>'kind','persisted','identical retry is persisted');
select is((public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"forged"}'::jsonb,true,1000,'[]'::jsonb)->>'kind','conflict','mismatched idempotency key conflicts');
select is((select count(*) from public.practice_attempts where user_id='61000000-0000-0000-0000-000000000001'),3::bigint,'client retry is idempotent alongside the bigint-version attempt');
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000001'),0::bigint,'later correct clears the exact question review');
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000004','practice-web-test-spi-v1',repeat('b',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1100,'[]'::jsonb);
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000006','practice-web-test-spi-v1',repeat('c',64),'q-1',2,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,true,900,'[]'::jsonb);
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000001'),0::bigint,'later correct attempt at a new release clears the stable question review');
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000007','practice-web-test-spi-v1',repeat('d',64),'q-1',2,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1100,'[]'::jsonb);
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000001'),1::bigint,'latest incorrect remains reviewable for the stable question identity');
select is((select jsonb_build_object('content_revision', content_revision, 'question_version', question_version) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000001' and question_id='q-1'),jsonb_build_object('content_revision', repeat('d',64), 'question_version', 2),'latest review row retains revision and version metadata');
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000002'),1::bigint,'latest incorrect remains reviewable for its owner');
select is((select count(*) from public.practice_question_availability where content_id='practice-web-test-spi-v1' and available),2::bigint,'current release identities are available');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('c',64),
  '{"questionBank":{"version":2,"questions":[{"id":"q-1","version":1},{"id":"q-1","version":2}]}}'::jsonb
);
select is((select question_version from public.practice_question_availability where content_id='practice-web-test-spi-v1' and question_id='q-1'),2::bigint,'availability keeps only the latest version for a stable identity');
select is((select count(*) from public.practice_review_queue where question_id='q-2'),0::bigint,'removed question identity is non-actionable');
select is((select count(*) from public.practice_attempts where question_id='q-2'),1::bigint,'retired question history remains immutable and auditable');
select is((select count(*) from public.practice_question_availability where content_id='practice-web-test-spi-v1' and available),1::bigint,'sync retires identities absent from current release');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('d',64),
  '{"questionBank":{"version":3,"questions":[{"id":"q-1","version":2},{"id":"q-2","version":1}]}}'::jsonb
);
select is((select count(*) from public.practice_question_availability where content_id='practice-web-test-spi-v1' and available),2::bigint,'restored identity becomes actionable deterministically');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('d',64),
  '{"questionBank":{"version":3,"questions":[{"id":"q-1","version":2},{"id":"q-2","version":1}]}}'::jsonb
);
select is((select count(*) from public.practice_question_availability where content_id='practice-web-test-spi-v1' and available),2::bigint,'same release availability retry is idempotent');
select throws_ok($$select public.import_practice_question_release('practice-web-test-spi-v1', repeat('f',64), '{"questionBank":{"version":3,"questions":["changed"]}}'::jsonb)$$,'22023',null,'same bank version with a different revision is rejected');
select is((select count(*) from public.private_content_release where content_id='practice-web-test-spi-v1' and revision=repeat('f',64)),0::bigint,'same bank revision conflict leaves no release behind');
select throws_ok($$select public.sync_practice_question_availability('practice-web-test-spi-v1', repeat('a',64), 1, '[{"id":"q-1","version":1}]'::jsonb)$$,'42501',null,'direct availability sync cannot be invoked by service callers');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.practice_attempts),1::bigint,'RLS hides another user attempts');
select is((select count(*) from public.practice_review_queue),1::bigint,'RLS applies to derived review model');
select throws_ok($$ insert into public.practice_attempts (user_id,client_attempt_id,content_id,content_revision,question_id,question_version,test_family,domain,category,practice_mode,submitted_answer,correct,response_ms) values ('61000000-0000-0000-0000-000000000002','61200000-0000-4000-8000-000000000001','x',repeat('a',64),'x',1,'spi','verbal','x','untimed-learning','{}',true,1) $$,'42501',null,'browser cannot forge attempt rows');
select throws_ok($$ select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61300000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-3',1,'spi','verbal','x','untimed-learning','{}',true,1,'[]') $$,'42501',null,'browser cannot call service persistence');
reset role;
select * from finish();
rollback;
