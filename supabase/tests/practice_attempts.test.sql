begin;
select plan(77);
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
select ok(has_function('public', 'record_practice_attempt', array['uuid','uuid','text','text','text','bigint','text','text','text','text','jsonb','boolean','integer','jsonb']), 'persistence RPC accepts bigint question versions');
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
