begin;
select plan(22);
select has_table('public', 'practice_attempts', 'practice attempts table exists');
select has_column('public', 'practice_attempts', 'attempt_sequence', 'attempt ordering is monotonic and server-owned');
select ok(has_sequence_privilege('service_role', 'public.practice_attempts_attempt_sequence_seq', 'USAGE'), 'service role can allocate attempt sequence values');
select ok((select relrowsecurity from pg_class where oid = 'public.practice_attempts'::regclass), 'attempts RLS enabled');
select ok(has_table_privilege('authenticated', 'public.practice_attempts', 'select'), 'authenticated users can read attempts through RLS');
select ok(not has_table_privilege('authenticated', 'public.practice_attempts', 'insert,update,delete'), 'browser cannot mutate attempts directly');
select ok(not has_table_privilege('anon', 'public.practice_attempts', 'select'), 'anonymous users cannot read attempts');
select ok(has_function_privilege('service_role', 'public.record_practice_attempt(uuid,uuid,text,text,text,integer,text,text,text,text,jsonb,boolean,integer,jsonb)', 'execute'), 'service role can invoke persistence RPC');
select ok(not has_function_privilege('authenticated', 'public.record_practice_attempt(uuid,uuid,text,text,text,integer,text,text,text,text,jsonb,boolean,integer,jsonb)', 'execute'), 'authenticated clients cannot invoke persistence RPC');
select has_view('public', 'practice_review_queue', 'review queue is a derived read model');

insert into auth.users (id, aud, role) values
 ('61000000-0000-0000-0000-000000000001','authenticated','authenticated'),
 ('61000000-0000-0000-0000-000000000002','authenticated','authenticated');
set local role service_role;
select is((public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1200,'[{"checkpointId":"c-1","checkpointVersion":1,"correct":false}]'::jsonb)->>'kind','persisted','first attempt is persisted');
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000002','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,true,1000,'[]'::jsonb);
select public.record_practice_attempt('61000000-0000-0000-0000-000000000002','61100000-0000-4000-8000-000000000003','practice-web-test-spi-v1',repeat('a',64),'q-2',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"one"}'::jsonb,false,1000,'[]'::jsonb);
select is((select count(*) from public.practice_attempts),3::bigint,'server persistence stores bounded attempts');
select is((public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1200,'[{"checkpointId":"c-1","checkpointVersion":1,"correct":false}]'::jsonb)->>'kind','persisted','identical retry is persisted');
select is((public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000001','practice-web-test-spi-v1',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"forged"}'::jsonb,true,1000,'[]'::jsonb)->>'kind','conflict','mismatched idempotency key conflicts');
select is((select count(*) from public.practice_attempts where user_id='61000000-0000-0000-0000-000000000001'),2::bigint,'client retry is idempotent');
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000001'),0::bigint,'later correct clears the exact question review');
select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61100000-0000-4000-8000-000000000004','practice-web-test-spi-v1',repeat('b',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{"input":"two"}'::jsonb,false,1100,'[]'::jsonb);
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000001'),1::bigint,'review identity keeps distinct content releases separate');
select is((select count(*) from public.practice_review_queue where user_id='61000000-0000-0000-0000-000000000002'),1::bigint,'latest incorrect remains reviewable for its owner');
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
