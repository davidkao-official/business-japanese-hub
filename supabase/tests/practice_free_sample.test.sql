begin;

select plan(7);

insert into auth.users (id, aud, role) values
  ('62000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated');

select is((select count(*)::int from public.private_content_release
  where content_id = 'practice-web-test-spi-free-sample-v1'
    and revision = 'adf8b12615c26e9aad1b2f1fb73fc48d2033492449f1d275885a12569fa5ecb6'
    and content_kind = 'practice-question-bank'), 1,
  'the public SPI free sample is seeded as one immutable practice release');
select is((select bank_version from public.practice_question_release_head
  where content_id = 'practice-web-test-spi-free-sample-v1'), 1::bigint,
  'the free sample release head is initialized');
select is((select count(*)::int from public.practice_question_availability
  where content_id = 'practice-web-test-spi-free-sample-v1' and available), 16,
  'all sixteen free sample questions are currently available');
select is((select count(distinct category)::int from public.practice_question_availability
  where content_id = 'practice-web-test-spi-free-sample-v1' and available), 8,
  'the free sample covers all eight released SPI categories');
select lives_ok($$select public.import_practice_question_release(
  'practice-web-test-spi-free-sample-v1',
  'adf8b12615c26e9aad1b2f1fb73fc48d2033492449f1d275885a12569fa5ecb6',
  (select payload from public.private_content_release
    where content_id = 'practice-web-test-spi-free-sample-v1'
      and revision = 'adf8b12615c26e9aad1b2f1fb73fc48d2033492449f1d275885a12569fa5ecb6'))$$,
  're-importing the same free sample revision is idempotent');

-- The review queue authorizes service reads by JWT role claim, as PostgREST sets it.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is((public.record_practice_attempt(
  '62000000-0000-4000-8000-000000000001', '62100000-0000-4000-8000-000000000001',
  'practice-web-test-spi-free-sample-v1', 'adf8b12615c26e9aad1b2f1fb73fc48d2033492449f1d275885a12569fa5ecb6',
  'spi-free-v-vocab-01', 1, 'spi', 'verbal', 'vocabulary-in-context', 'untimed-learning',
  '"b"'::jsonb, false, 1500, '[]'::jsonb)->>'kind'), 'persisted',
  'a server-graded free sample attempt persists through the existing RPC');
select is((select question_id from public.practice_review_queue
  where user_id = '62000000-0000-4000-8000-000000000001'
    and content_id = 'practice-web-test-spi-free-sample-v1'), 'spi-free-v-vocab-01',
  'the incorrect free sample attempt enters the review queue');
reset role;

select * from finish();
rollback;
