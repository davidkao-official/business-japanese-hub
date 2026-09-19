-- Temporary hosted-only diagnostic probe. Not product logic.
-- Bounded count: q-large availability row exists after import a.
begin;
select plan(3);
select todo('diagnostic probe: superseded setup assertions', 2);
insert into auth.users (id, aud, role) values
 ('61000000-0000-0000-0000-000000000001','authenticated','authenticated'),
 ('61000000-0000-0000-0000-000000000002','authenticated','authenticated');
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select public.record_practice_attempt('61000000-0000-0000-0000-000000000001','61500000-0000-4000-8000-000000000001','practice-web-test-no-head',repeat('a',64),'q-1',1,'spi','verbal','vocabulary-in-context','untimed-learning','{}'::jsonb,true,1000,'[]'::jsonb)$$,'22023',null,'fresh attempts require an initialized current release head');
select is((select count(*) from public.practice_attempts where client_attempt_id='61500000-0000-4000-8000-000000000001'),0::bigint,'no-head attempt is not persisted');
select public.import_practice_question_release(
  'practice-web-test-spi-v1', repeat('a',64),
  '{"questionBank":{"version":2,"questions":[{"id":"q-1","version":1,"deliveryProfile":"web","practiceProfile":"untimed-learning","answer":{"input":{"kind":"single-choice"}}},{"id":"q-2","version":1,"deliveryProfile":"web","practiceProfile":"untimed-learning","answer":{"input":{"kind":"single-choice"}}},{"id":"q-large","version":2147483648,"deliveryProfile":"web","practiceProfile":"untimed-learning","answer":{"input":{"kind":"single-choice"}}}]}}'::jsonb
);
select is((select count(*) from public.practice_question_availability where content_id='practice-web-test-spi-v1' and question_id='q-large'),1::bigint,'probe: q-large availability row count = 1');
select * from finish();
rollback;
