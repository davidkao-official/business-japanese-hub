-- Temporary hosted-only diagnostic prefix probe. Not product logic.
-- Prefix of original statements ending just before original assertion 25 (fresh attempts require an initialized current release head).
-- All 24 prefix assertions are TODO-suppressed with validated correct usage;
-- this file can only fail if the retained original SQL raises a non-suppressible
-- error, or if the TODO count desynchronizes before this prefix end.
begin;
select plan(25);
select todo('diagnostic prefix probe: superseded original assertions 1..24', 24);
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
select has_function('public', 'record_practice_attempt', array['uuid','uuid','text','text','text','bigint','text','text','text','text','jsonb','boolean','integer','jsonb'], 'persistence RPC accepts bigint question versions');
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
select pass('diagnostic prefix probe: reached just before original assertion 25');
select * from finish();
rollback;
