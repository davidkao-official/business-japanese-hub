begin;

select plan(48);

select ok(
  has_table_privilege('authenticated', 'public.career_game_progress', 'select'),
  'authenticated users can query RLS-filtered Career Game progress'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_game_progress', 'insert')
  and not has_table_privilege('authenticated', 'public.career_game_progress', 'update')
  and not has_table_privilege('authenticated', 'public.career_game_progress', 'delete'),
  'authenticated users cannot mutate Career Game progress directly'
);
select ok(
  has_table_privilege('authenticated', 'public.learning_evidence', 'select'),
  'authenticated users can query their RLS-filtered learning evidence'
);
select ok(
  not has_table_privilege('authenticated', 'public.learning_evidence', 'insert')
  and not has_table_privilege('authenticated', 'public.learning_evidence', 'update')
  and not has_table_privilege('authenticated', 'public.learning_evidence', 'delete'),
  'authenticated users cannot mutate learning evidence directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.learning_skill', 'select')
  and not has_table_privilege('anon', 'public.learning_skill', 'select'),
  'the internal taxonomy is not an exposed browser table'
);
select ok(
  not has_table_privilege('anon', 'public.career_game_progress', 'select')
  and not has_table_privilege('anon', 'public.learning_evidence', 'select'),
  'anonymous users have no durable learning access'
);
select ok(
  has_table_privilege('service_role', 'public.career_game_progress', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.learning_evidence', 'select,insert'),
  'service role has the exact server persistence privileges'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.persist_career_game_action(uuid,text,integer,bigint,jsonb,text,uuid,timestamptz,text[],text,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reset_career_game_progress(uuid,text,integer,uuid,bigint)',
    'execute'
  ),
  'authenticated clients cannot invoke Career Game persistence RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_library_learning_evidence(uuid,text,text,text,text,text[])',
    'execute'
  ),
  'authenticated clients cannot invoke Library evidence RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.persist_career_game_action(uuid,text,integer,bigint,jsonb,text,uuid,timestamptz,text[],text,text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.reset_career_game_progress(uuid,text,integer,uuid,bigint)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.record_library_learning_evidence(uuid,text,text,text,text,text[])',
    'execute'
  ),
  'service role can invoke both narrow persistence RPCs'
);

insert into auth.users (id, aud, role)
values
  ('57000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated'),
  ('57000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated'),
  ('57000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated');

insert into public.career_game_progress (
  user_id, scenario_id, content_version, state, attempt_id, revision
) values
  (
    '57000000-0000-0000-0000-000000000001', 'owner-scenario', 1,
    '{"scenarioId":"owner-scenario","contentVersion":1,"currentSceneId":"scene-one","meters":{},"flags":{},"history":[],"status":"playing"}',
    '57100000-0000-4000-8000-000000000001', 1
  ),
  (
    '57000000-0000-0000-0000-000000000002', 'other-scenario', 1,
    '{"scenarioId":"other-scenario","contentVersion":1,"currentSceneId":"scene-one","meters":{},"flags":{},"history":[],"status":"playing"}',
    '57100000-0000-4000-8000-000000000002', 1
  ),
  (
    '57000000-0000-0000-0000-000000000003', 'finance-scenario', 1,
    '{"scenarioId":"finance-scenario","contentVersion":1,"currentSceneId":"scene-one","meters":{},"flags":{},"history":[],"status":"playing"}',
    '57100000-0000-4000-8000-000000000003', 1
  );

insert into public.learning_evidence (
  user_id, skill_id, source_product, evidence_kind, source_content_id,
  source_content_version, source_unit_id, quality, source_event_id
) values
  (
    '57000000-0000-0000-0000-000000000001', 'workplace-greeting', 'career_game',
    'outcome_reached', 'owner-scenario', '1', 'outcome-one', 'strong', 'owner-event'
  ),
  (
    '57000000-0000-0000-0000-000000000002', 'error-reporting', 'career_game',
    'outcome_reached', 'other-scenario', '1', 'outcome-two', 'mixed', 'other-event'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"57000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '57000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.career_game_progress),
  1::bigint,
  'an authenticated owner sees only their Career Game row'
);
select is(
  (select count(*) from public.learning_evidence),
  1::bigint,
  'an authenticated owner sees only their evidence row'
);
select is(
  (select count(*) from public.career_game_progress where scenario_id = 'other-scenario'),
  0::bigint,
  'unrelated Career Game progress is hidden by RLS'
);
select is(
  (select count(*) from public.learning_evidence where source_event_id = 'other-event'),
  0::bigint,
  'unrelated learning evidence is hidden by RLS'
);
select throws_ok(
  $$ select * from public.learning_skill $$,
  '42501',
  'permission denied for table learning_skill',
  'authenticated users cannot enumerate the server taxonomy table'
);
select throws_ok(
  $$ insert into public.career_game_progress (
       user_id, scenario_id, content_version, state, attempt_id, revision
     ) values (
       '57000000-0000-0000-0000-000000000001', 'forged', 1, '{}'::jsonb,
       '57100000-0000-4000-8000-000000000010', 1
     ) $$,
  '42501',
  'permission denied for table career_game_progress',
  'the owner cannot forge progress with a browser write'
);
select throws_ok(
  $$ insert into public.learning_evidence (
       user_id, skill_id, source_product, evidence_kind, source_content_id,
       source_content_version, source_unit_id, quality, source_event_id
     ) values (
       '57000000-0000-0000-0000-000000000001', 'error-reporting', 'career_game',
       'outcome_reached', 'forged', '1', 'forged', 'strong', 'forged'
     ) $$,
  '42501',
  'permission denied for table learning_evidence',
  'the owner cannot forge learning evidence with a browser write'
);
select throws_ok(
  $$ select public.persist_career_game_action(
       '57000000-0000-0000-0000-000000000001', 'forged', 1, null,
       '{"scenarioId":"forged","contentVersion":1,"currentSceneId":"scene","meters":{},"flags":{},"history":[],"status":"playing"}',
       null, '57100000-0000-4000-8000-000000000010', null,
       array[]::text[], null, null, null
     ) $$,
  '42501',
  'permission denied for function persist_career_game_action',
  'an authenticated client cannot bypass the Edge handler through the Game RPC'
);
select throws_ok(
  $$ select public.record_library_learning_evidence(
       '57000000-0000-0000-0000-000000000001', 'book', 'release', 'chapter',
       '57100000-0000-4000-8000-000000000011', array['error-reporting']
     ) $$,
  '42501',
  'permission denied for function record_library_learning_evidence',
  'an authenticated client cannot bypass content/access checks through the Library RPC'
);
select throws_ok(
  $$ select public.reset_career_game_progress(
       '57000000-0000-0000-0000-000000000001', 'owner-scenario', 1,
       '57100000-0000-4000-8000-000000000001', 1
     ) $$,
  '42501',
  'permission denied for function reset_career_game_progress',
  'an authenticated client cannot bypass the Edge handler through the reset RPC'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"57000000-0000-0000-0000-000000000003","role":"authenticated","user_role":"finance"}',
  true
);
select set_config('request.jwt.claim.sub', '57000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*) from public.career_game_progress where scenario_id = 'finance-scenario'),
  1::bigint,
  'a finance-role user remains an ordinary owner for learning data'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.career_game_progress $$,
  '42501',
  'permission denied for table career_game_progress',
  'anonymous sessions cannot read durable Career Game progress'
);
reset role;

set local role service_role;
select is(
  public.persist_career_game_action(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1, null,
    '{"scenarioId":"scenario/with:stable-id","contentVersion":1,"currentSceneId":"Scene_A","meters":{},"flags":{},"history":[],"status":"playing"}',
    null, '57200000-0000-4000-8000-000000000001', null,
    array[]::text[], null, null, null
  ),
  '{"kind":"persisted","revision":1}'::jsonb,
  'the service start path accepts bounded content IDs and creates revision one'
);
select results_eq(
  $$ select revision, attempt_id from public.career_game_progress
      where user_id = '57000000-0000-0000-0000-000000000001'
        and scenario_id = 'scenario/with:stable-id' $$,
  $$ values (1::bigint, '57200000-0000-4000-8000-000000000001'::uuid) $$,
  'start persists the server attempt and canonical first revision'
);
select is(
  public.persist_career_game_action(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1, 1,
    '{"scenarioId":"scenario/with:stable-id","contentVersion":1,"currentSceneId":"Scene_B","meters":{},"flags":{},"history":[{"sceneId":"Scene_A","choiceId":"Choice_A","outcomeId":"Outcome_A","nextSceneId":"Scene_B"}],"status":"playing"}',
    'Outcome_A', '57200000-0000-4000-8000-000000000001', null,
    array['request-clarification'], 'strong',
    '57200000-0000-4000-8000-000000000001:1:Outcome_A', 'Outcome_A'
  ),
  '{"kind":"persisted","revision":2}'::jsonb,
  'one RPC atomically advances progress and records derived evidence'
);
select results_eq(
  $$ select skill_id, quality, source_content_id, source_unit_id
       from public.learning_evidence
      where source_event_id = '57200000-0000-4000-8000-000000000001:1:Outcome_A' $$,
  $$ values ('request-clarification'::text, 'strong'::text,
             'scenario/with:stable-id'::text, 'Outcome_A'::text) $$,
  'Career Game evidence stores fixed derived references without raw content'
);
select is(
  public.persist_career_game_action(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1, 1,
    '{"scenarioId":"scenario/with:stable-id","contentVersion":1,"currentSceneId":"Scene_B","meters":{},"flags":{},"history":[{"sceneId":"Scene_A","choiceId":"Choice_A","outcomeId":"Outcome_A","nextSceneId":"Scene_B"}],"status":"playing"}',
    'Outcome_A', '57200000-0000-4000-8000-000000000001', null,
    array['request-clarification'], 'strong',
    '57200000-0000-4000-8000-000000000001:1:Outcome_A', 'Outcome_A'
  ),
  '{"kind":"conflict"}'::jsonb,
  'a stale compare-and-swap loses deterministically'
);
select is(
  (select count(*) from public.learning_evidence
    where source_event_id = '57200000-0000-4000-8000-000000000001:1:Outcome_A'),
  1::bigint,
  'a CAS conflict produces no partial or duplicate evidence'
);
select is(
  public.persist_career_game_action(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 2, 2,
    '{"scenarioId":"scenario/with:stable-id","contentVersion":2,"currentSceneId":"Scene_B","meters":{},"flags":{},"history":[],"status":"playing"}',
    null, '57200000-0000-4000-8000-000000000001', null,
    array[]::text[], null, null, null
  ),
  '{"kind":"conflict"}'::jsonb,
  'a content-version change cannot overwrite an existing attempt'
);
select is(
  (select revision from public.career_game_progress
    where user_id = '57000000-0000-0000-0000-000000000001'
      and scenario_id = 'scenario/with:stable-id'),
  2::bigint,
  'version conflict leaves persisted progress unchanged'
);
select is(
  public.record_library_learning_evidence(
    '57000000-0000-0000-0000-000000000001', 'Book/Stable:1', 'book@release-1',
    'Chapter_A', '57300000-0000-4000-8000-000000000001',
    array['workplace-greeting', 'error-reporting']
  ),
  2,
  'Library RPC records one fixed-shape row per derived skill'
);
select is(
  public.record_library_learning_evidence(
    '57000000-0000-0000-0000-000000000001', 'Book/Stable:1', 'book@release-1',
    'Chapter_A', '57300000-0000-4000-8000-000000000001',
    array['workplace-greeting', 'error-reporting']
  ),
  0,
  'Library evidence event replay is idempotent'
);
select is(
  (select count(*) from public.learning_evidence
    where source_event_id = '57300000-0000-4000-8000-000000000001'),
  2::bigint,
  'Library replay does not duplicate per-skill evidence'
);
select throws_ok(
  $$ insert into public.learning_evidence (
       user_id, skill_id, source_product, evidence_kind, source_content_id,
       source_content_version, source_unit_id, quality, source_event_id
     ) values (
       '57000000-0000-0000-0000-000000000001', 'error-reporting', 'library',
       'chapter_opened', 'book', 'r1', 'chapter', 'strong', 'invalid-library-quality'
     ) $$,
  '23514',
  null,
  'cross-column checks reject quality fabricated for Library evidence'
);

select is(
  public.persist_career_game_action(
    '57000000-0000-0000-0000-000000000002', 'atomic-scenario', 1, null,
    '{"scenarioId":"atomic-scenario","contentVersion":1,"currentSceneId":"scene","meters":{},"flags":{},"history":[],"status":"playing"}',
    null, '57400000-0000-4000-8000-000000000001', null,
    array[]::text[], null, null, null
  ),
  '{"kind":"persisted","revision":1}'::jsonb,
  'atomicity fixture starts at revision one'
);
select throws_ok(
  $$ select public.persist_career_game_action(
       '57000000-0000-0000-0000-000000000002', 'atomic-scenario', 1, 1,
       '{"scenarioId":"atomic-scenario","contentVersion":1,"currentSceneId":"next","meters":{},"flags":{},"history":[],"status":"playing"}',
       'outcome', '57400000-0000-4000-8000-000000000001', null,
       array['unknown-skill'], 'strong', 'atomic-event', 'outcome'
     ) $$,
  '23503',
  null,
  'an invalid derived skill aborts the entire persistence transaction'
);
select is(
  (select revision from public.career_game_progress
    where user_id = '57000000-0000-0000-0000-000000000002'
      and scenario_id = 'atomic-scenario'),
  1::bigint,
  'failed evidence insertion rolls back the progress update'
);
select is(
  public.reset_career_game_progress(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 2,
    '57200000-0000-4000-8000-000000000001', 2
  ),
  '{"kind":"conflict"}'::jsonb,
  'reset rejects a stale stored content version'
);
select is(
  (select count(*) from public.career_game_progress
    where user_id = '57000000-0000-0000-0000-000000000001'
      and scenario_id = 'scenario/with:stable-id'),
  1::bigint,
  'a reset CAS mismatch leaves the checkpoint intact'
);
select is(
  public.reset_career_game_progress(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1,
    '57200000-0000-4000-8000-000000000001', 2
  ),
  '{"kind":"none"}'::jsonb,
  'reset deletes the exact stored version, attempt, and revision'
);
select is(
  (select count(*) from public.career_game_progress
    where user_id = '57000000-0000-0000-0000-000000000001'
      and scenario_id = 'scenario/with:stable-id'),
  0::bigint,
  'reset removes only the Career Game checkpoint'
);
select is(
  (select count(*) from public.learning_evidence
    where source_event_id = '57200000-0000-4000-8000-000000000001:1:Outcome_A'),
  1::bigint,
  'reset preserves durable learning evidence'
);
select is(
  public.persist_career_game_action(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1, null,
    '{"scenarioId":"scenario/with:stable-id","contentVersion":1,"currentSceneId":"Scene_A","meters":{},"flags":{},"history":[],"status":"playing"}',
    null, '57200000-0000-4000-8000-000000000099', null,
    array[]::text[], null, null, null
  ),
  '{"kind":"persisted","revision":1}'::jsonb,
  'a new attempt can reuse the scenario key after an exact reset'
);
select is(
  public.reset_career_game_progress(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1,
    '57200000-0000-4000-8000-000000000001', 2
  ),
  '{"kind":"conflict"}'::jsonb,
  'an old reset token cannot delete a replacement checkpoint (ABA protection)'
);
select results_eq(
  $$ select attempt_id, revision from public.career_game_progress
      where user_id = '57000000-0000-0000-0000-000000000001'
        and scenario_id = 'scenario/with:stable-id' $$,
  $$ values ('57200000-0000-4000-8000-000000000099'::uuid, 1::bigint) $$,
  'the replacement attempt remains intact after the stale reset'
);
select is(
  public.reset_career_game_progress(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1,
    '57200000-0000-4000-8000-000000000099', 1
  ),
  '{"kind":"none"}'::jsonb,
  'the replacement checkpoint can be reset with its own exact identity'
);
select is(
  public.reset_career_game_progress(
    '57000000-0000-0000-0000-000000000001', 'scenario/with:stable-id', 1,
    '57200000-0000-4000-8000-000000000099', 1
  ),
  '{"kind":"none"}'::jsonb,
  'reset is idempotent when the checkpoint is already absent'
);

select throws_ok(
  $$ insert into public.career_game_progress (
       user_id, scenario_id, content_version, state, attempt_id, revision
     ) values (
       '57000000-0000-0000-0000-000000000001', 'bad-state', 1,
       '{"forged":true}', '57500000-0000-4000-8000-000000000001', 1
     ) $$,
  '23514',
  null,
  'database shape checks reject an unstructured progress payload'
);

reset role;
select * from finish();
rollback;
