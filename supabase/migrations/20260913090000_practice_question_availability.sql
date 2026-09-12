-- #117: server-owned current Practice question availability projection.
-- Historical attempts remain immutable; this projection is the only current
-- release identity used to decide whether an attempt is actionable.
create table public.practice_question_availability (
  content_id text not null,
  question_id text not null,
  question_version bigint not null,
  content_revision text not null,
  bank_version bigint not null,
  available boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (content_id, question_id),
  constraint practice_question_availability_content_id_bounded check (char_length(content_id) between 1 and 128 and content_id = btrim(content_id)),
  constraint practice_question_availability_question_id_bounded check (char_length(question_id) between 1 and 128 and question_id = btrim(question_id)),
  constraint practice_question_availability_question_version_positive check (question_version > 0),
  constraint practice_question_availability_bank_version_positive check (bank_version > 0),
  constraint practice_question_availability_revision_sha256 check (content_revision ~ '^[a-f0-9]{64}$')
);

revoke all on public.practice_question_availability from public, anon, authenticated, service_role;
grant select on public.practice_question_availability to service_role;
alter table public.practice_question_availability enable row level security;

create function public.sync_practice_question_availability(
  p_content_id text,
  p_content_revision text,
  p_bank_version bigint,
  p_questions jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_bank_version bigint;
begin
  if p_content_id is null or p_content_revision is null or p_bank_version is null
    or p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'practice availability identity and question list are required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_content_id, 0));
  if not exists (
    select 1 from public.private_content_release
    where content_id = p_content_id and revision = p_content_revision
      and content_kind = 'practice-question-bank'
  ) then
    raise exception 'practice release must be imported before availability sync' using errcode = '22023';
  end if;
  select max(bank_version) into current_bank_version
  from public.practice_question_availability
  where content_id = p_content_id;
  if current_bank_version is not null and p_bank_version < current_bank_version then
    raise exception 'practice availability sync cannot move backwards' using errcode = '22023';
  end if;
  if current_bank_version is not null and p_bank_version = current_bank_version
    and exists (
      select 1 from public.practice_question_availability
      where content_id = p_content_id and available and content_revision <> p_content_revision
    ) then
    raise exception 'practice availability sync revision conflicts with current bank version' using errcode = '22023';
  end if;

  update public.practice_question_availability
  set available = false, updated_at = now()
  where content_id = p_content_id;

  insert into public.practice_question_availability (
    content_id, question_id, question_version, content_revision, bank_version, available
  )
  select p_content_id, latest.item->>'id', (latest.item->>'version')::bigint, p_content_revision, p_bank_version, true
  from (
    select distinct on (item->>'id') item
    from jsonb_array_elements(p_questions) item
    order by item->>'id', (item->>'version')::bigint desc
  ) latest
  on conflict (content_id, question_id) do update set
    question_version = excluded.question_version,
    content_revision = excluded.content_revision,
    bank_version = excluded.bank_version,
    available = true,
    updated_at = now();
end;
$$;

revoke all on function public.sync_practice_question_availability(text,text,bigint,jsonb) from public, anon, authenticated, service_role;

create function public.import_practice_question_release(
  p_content_id text, p_content_revision text, p_payload jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare bank_version bigint;
  question_refs jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload->'questionBank') <> 'object'
    or jsonb_typeof(p_payload->'questionBank'->'questions') <> 'array' then
    raise exception 'practice release payload and question list are required' using errcode = '22023';
  end if;
  bank_version := (p_payload->'questionBank'->>'version')::bigint;
  select coalesce(jsonb_agg(jsonb_build_object('id', latest.item->>'id', 'version', (latest.item->>'version')::bigint)), '[]'::jsonb)
    into question_refs
  from (
    select distinct on (item->>'id') item
    from jsonb_array_elements(p_payload->'questionBank'->'questions') item
    order by item->>'id', (item->>'version')::bigint desc
  ) latest;
  insert into public.private_content_release (content_id, revision, content_kind, access_scope, payload)
  values (p_content_id, p_content_revision, 'practice-question-bank', 'member', p_payload)
  on conflict (content_id, revision) do nothing;
  if exists (
    select 1 from public.private_content_release
    where content_id = p_content_id and revision = p_content_revision
      and payload is distinct from p_payload
  ) then
    raise exception 'practice release revision conflicts with existing payload' using errcode = '22023';
  end if;
  perform public.sync_practice_question_availability(p_content_id, p_content_revision, bank_version, question_refs);
end;
$$;

revoke all on function public.import_practice_question_release(text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.import_practice_question_release(text,text,jsonb) to service_role;

create or replace view public.practice_review_queue
  with (security_invoker = false, security_barrier = true)
as
  select latest.user_id, latest.content_id, latest.content_revision, latest.question_id,
    latest.question_version, latest.test_family, latest.domain, latest.category,
    latest.practice_mode, latest.correct, latest.created_at
  from (
    select distinct on (user_id, content_id, question_id)
      user_id, content_id, content_revision, question_id, question_version,
      test_family, domain, category, practice_mode, correct, created_at
    from public.practice_attempts
    order by user_id, content_id, question_id, attempt_sequence desc
  ) latest
  join public.practice_question_availability availability
    on availability.content_id = latest.content_id
   and availability.question_id = latest.question_id
   and availability.available
  where latest.correct = false
    and (auth.uid() is null or latest.user_id = auth.uid());

revoke all on public.practice_review_queue from public, anon, authenticated, service_role;
grant select on public.practice_review_queue to authenticated, service_role;
