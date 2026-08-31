-- #57: the smallest durable cross-product learning seam.
--
-- Product progress remains owned by Career Game. Shared evidence is a narrow,
-- append-only association between a verified user, a stable content reference,
-- and the small reviewed learning taxonomy. Neither table stores authored text,
-- UI state, mastery claims, or a generalized LMS payload.

create table public.learning_skill (
  id text primary key,
  category text not null,
  label_ja text not null,
  label_en text not null,
  constraint learning_skill_id_bounded check (
    char_length(id) between 1 and 64 and id = btrim(id)
  ),
  constraint learning_skill_category_allowed check (
    category in ('workplace-situation', 'communication-skill')
  ),
  constraint learning_skill_labels_present check (
    char_length(label_ja) between 1 and 80
    and char_length(label_en) between 1 and 80
  )
);

insert into public.learning_skill (id, category, label_ja, label_en)
values
  ('workplace-greeting', 'workplace-situation', '職場での挨拶', 'Workplace greetings'),
  ('request-clarification', 'communication-skill', '確認を依頼する', 'Requesting clarification'),
  ('deadline-negotiation', 'communication-skill', '期限を交渉する', 'Negotiating deadlines'),
  ('meeting-disagreement', 'communication-skill', '会議で異議を伝える', 'Expressing disagreement in meetings'),
  ('error-reporting', 'workplace-situation', 'ミスを報告する', 'Reporting mistakes');

create table public.career_game_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id text not null,
  content_version integer not null,
  state jsonb not null,
  pending_outcome_id text,
  attempt_id uuid not null,
  revision bigint not null,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, scenario_id),
  constraint career_game_progress_scenario_id_bounded check (
    char_length(scenario_id) between 1 and 128 and scenario_id = btrim(scenario_id)
  ),
  constraint career_game_progress_version_positive check (content_version > 0),
  constraint career_game_progress_revision_positive check (revision > 0),
  constraint career_game_progress_pending_id_bounded check (
    pending_outcome_id is null
    or (char_length(pending_outcome_id) between 1 and 128 and pending_outcome_id = btrim(pending_outcome_id))
  ),
  constraint career_game_progress_state_bounded check (octet_length(state::text) <= 65536),
  constraint career_game_progress_state_shape check (
    jsonb_typeof(state) = 'object'
    and state ?& array[
      'scenarioId', 'contentVersion', 'currentSceneId', 'meters', 'flags', 'history', 'status'
    ]
    and state - array[
      'scenarioId', 'contentVersion', 'currentSceneId', 'meters', 'flags', 'history', 'status'
    ] = '{}'::jsonb
    and state -> 'scenarioId' = to_jsonb(scenario_id)
    and state -> 'contentVersion' = to_jsonb(content_version)
    and jsonb_typeof(state -> 'currentSceneId') = 'string'
    and char_length(state ->> 'currentSceneId') between 1 and 128
    and jsonb_typeof(state -> 'meters') = 'object'
    and jsonb_typeof(state -> 'flags') = 'object'
    and jsonb_typeof(state -> 'history') = 'array'
    and state ->> 'status' in ('playing', 'completed')
  ),
  constraint career_game_progress_completion_coherent check (
    (state ->> 'status' = 'completed') = (completed_at is not null)
  )
);

create table public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null references public.learning_skill(id),
  source_product text not null,
  evidence_kind text not null,
  source_content_id text not null,
  source_content_version text not null,
  source_unit_id text not null,
  quality text,
  source_event_id text not null,
  recorded_at timestamptz not null default now(),
  constraint learning_evidence_source_product_allowed check (
    source_product in ('library', 'career_game')
  ),
  constraint learning_evidence_kind_allowed check (
    evidence_kind in ('chapter_opened', 'outcome_reached')
  ),
  constraint learning_evidence_quality_allowed check (
    quality is null or quality in ('strong', 'mixed', 'risky')
  ),
  constraint learning_evidence_references_bounded check (
    char_length(source_content_id) between 1 and 128
    and source_content_id = btrim(source_content_id)
    and char_length(source_content_version) between 1 and 128
    and source_content_version = btrim(source_content_version)
    and char_length(source_unit_id) between 1 and 128
    and source_unit_id = btrim(source_unit_id)
    and char_length(source_event_id) between 1 and 256
    and source_event_id = btrim(source_event_id)
  ),
  constraint learning_evidence_product_shape check (
    (
      source_product = 'library'
      and evidence_kind = 'chapter_opened'
      and quality is null
    )
    or
    (
      source_product = 'career_game'
      and evidence_kind = 'outcome_reached'
      and quality is not null
      and source_content_version ~ '^[1-9][0-9]*$'
    )
  ),
  unique (user_id, source_product, source_event_id, skill_id)
);

create index learning_evidence_user_recorded_idx
  on public.learning_evidence (user_id, recorded_at desc);

alter table public.learning_skill enable row level security;
alter table public.career_game_progress enable row level security;
alter table public.learning_evidence enable row level security;

create policy "career_game_progress_own_select" on public.career_game_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "learning_evidence_own_select" on public.learning_evidence
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- New public-schema tables are not assumed to have any PostgREST grants. Start
-- from an explicit deny for every browser role, then add only owner reads.
revoke all on table public.learning_skill from public, anon, authenticated;
revoke all on table public.career_game_progress from public, anon, authenticated;
revoke all on table public.learning_evidence from public, anon, authenticated;

grant select on table public.career_game_progress to authenticated;
grant select on table public.learning_evidence to authenticated;

grant select on table public.learning_skill to service_role;
grant select, insert, update, delete on table public.career_game_progress to service_role;
grant select, insert on table public.learning_evidence to service_role;

create function public.persist_career_game_action(
  p_user_id uuid,
  p_scenario_id text,
  p_content_version integer,
  p_expected_revision bigint,
  p_state jsonb,
  p_pending_outcome_id text,
  p_attempt_id uuid,
  p_completed_at timestamptz,
  p_evidence_skill_ids text[],
  p_evidence_quality text,
  p_evidence_event_id text,
  p_evidence_source_unit_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if p_user_id is null
     or p_scenario_id is null
     or p_content_version is null
     or p_state is null
     or p_attempt_id is null
     or p_evidence_skill_ids is null then
    raise exception 'career game persistence arguments are required' using errcode = '22023';
  end if;

  if cardinality(p_evidence_skill_ids) = 0 then
    if p_evidence_quality is not null
       or p_evidence_event_id is not null
       or p_evidence_source_unit_id is not null then
      raise exception 'evidence metadata must be absent without skills' using errcode = '22023';
    end if;
  else
    if p_evidence_quality not in ('strong', 'mixed', 'risky')
       or p_evidence_event_id is null
       or p_evidence_source_unit_id is null then
      raise exception 'derived evidence metadata is incomplete' using errcode = '22023';
    end if;
    if (
      select count(distinct skill_id) <> cardinality(p_evidence_skill_ids)
      from unnest(p_evidence_skill_ids) as skill_id
    ) then
      raise exception 'derived evidence skills must be unique' using errcode = '22023';
    end if;
  end if;

  if p_expected_revision is null then
    insert into public.career_game_progress (
      user_id, scenario_id, content_version, state, pending_outcome_id,
      attempt_id, revision, completed_at
    ) values (
      p_user_id, p_scenario_id, p_content_version, p_state, p_pending_outcome_id,
      p_attempt_id, 1, p_completed_at
    )
    on conflict (user_id, scenario_id) do nothing
    returning revision into v_revision;
  else
    update public.career_game_progress
       set state = p_state,
           pending_outcome_id = p_pending_outcome_id,
           completed_at = p_completed_at,
           revision = revision + 1,
           updated_at = now()
     where user_id = p_user_id
       and scenario_id = p_scenario_id
       and content_version = p_content_version
       and attempt_id = p_attempt_id
       and revision = p_expected_revision
    returning revision into v_revision;
  end if;

  if v_revision is null then
    return jsonb_build_object('kind', 'conflict');
  end if;

  if cardinality(p_evidence_skill_ids) > 0 then
    insert into public.learning_evidence (
      user_id, skill_id, source_product, evidence_kind, source_content_id,
      source_content_version, source_unit_id, quality, source_event_id
    )
    select
      p_user_id, skill_id, 'career_game', 'outcome_reached', p_scenario_id,
      p_content_version::text, p_evidence_source_unit_id, p_evidence_quality,
      p_evidence_event_id
    from unnest(p_evidence_skill_ids) as skill_id
    on conflict (user_id, source_product, source_event_id, skill_id) do nothing;
  end if;

  return jsonb_build_object('kind', 'persisted', 'revision', v_revision);
end;
$$;

create function public.record_library_learning_evidence(
  p_user_id uuid,
  p_book_id text,
  p_release_id text,
  p_chapter_id text,
  p_source_event_id text,
  p_skill_ids text[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_user_id is null
     or p_book_id is null
     or p_release_id is null
     or p_chapter_id is null
     or p_source_event_id is null
     or p_skill_ids is null then
    raise exception 'Library evidence arguments are required' using errcode = '22023';
  end if;
  if (
    select count(distinct skill_id) <> cardinality(p_skill_ids)
    from unnest(p_skill_ids) as skill_id
  ) then
    raise exception 'Library evidence skills must be unique' using errcode = '22023';
  end if;

  insert into public.learning_evidence (
    user_id, skill_id, source_product, evidence_kind, source_content_id,
    source_content_version, source_unit_id, quality, source_event_id
  )
  select
    p_user_id, skill_id, 'library', 'chapter_opened', p_book_id,
    p_release_id, p_chapter_id, null, p_source_event_id
  from unnest(p_skill_ids) as skill_id
  on conflict (user_id, source_product, source_event_id, skill_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create function public.reset_career_game_progress(
  p_user_id uuid,
  p_scenario_id text,
  p_stored_content_version integer,
  p_attempt_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_content_version integer;
  v_attempt_id uuid;
  v_revision bigint;
begin
  if p_user_id is null
     or p_scenario_id is null
     or p_stored_content_version is null
     or p_attempt_id is null
     or p_expected_revision is null then
    raise exception 'Career Game reset identity is required' using errcode = '22023';
  end if;

  -- Lock the current row before comparing the opaque checkpoint identity. A
  -- reset issued for attempt A can therefore never delete a replacement
  -- attempt B that reused the same (user, scenario) key.
  select content_version, attempt_id, revision
    into v_content_version, v_attempt_id, v_revision
    from public.career_game_progress
   where user_id = p_user_id
     and scenario_id = p_scenario_id
   for update;

  if not found then
    return jsonb_build_object('kind', 'none');
  end if;

  if v_content_version <> p_stored_content_version
     or v_attempt_id <> p_attempt_id
     or v_revision <> p_expected_revision then
    return jsonb_build_object('kind', 'conflict');
  end if;

  delete from public.career_game_progress
   where user_id = p_user_id
     and scenario_id = p_scenario_id
     and content_version = p_stored_content_version
     and attempt_id = p_attempt_id
     and revision = p_expected_revision;

  return jsonb_build_object('kind', 'none');
end;
$$;

revoke all on function public.persist_career_game_action(
  uuid, text, integer, bigint, jsonb, text, uuid, timestamptz, text[], text, text, text
) from public;
revoke all on function public.persist_career_game_action(
  uuid, text, integer, bigint, jsonb, text, uuid, timestamptz, text[], text, text, text
) from anon;
revoke all on function public.persist_career_game_action(
  uuid, text, integer, bigint, jsonb, text, uuid, timestamptz, text[], text, text, text
) from authenticated;
grant execute on function public.persist_career_game_action(
  uuid, text, integer, bigint, jsonb, text, uuid, timestamptz, text[], text, text, text
) to service_role;

revoke all on function public.reset_career_game_progress(
  uuid, text, integer, uuid, bigint
) from public;
revoke all on function public.reset_career_game_progress(
  uuid, text, integer, uuid, bigint
) from anon;
revoke all on function public.reset_career_game_progress(
  uuid, text, integer, uuid, bigint
) from authenticated;
grant execute on function public.reset_career_game_progress(
  uuid, text, integer, uuid, bigint
) to service_role;

revoke all on function public.record_library_learning_evidence(
  uuid, text, text, text, text, text[]
) from public;
revoke all on function public.record_library_learning_evidence(
  uuid, text, text, text, text, text[]
) from anon;
revoke all on function public.record_library_learning_evidence(
  uuid, text, text, text, text, text[]
) from authenticated;
grant execute on function public.record_library_learning_evidence(
  uuid, text, text, text, text, text[]
) to service_role;
