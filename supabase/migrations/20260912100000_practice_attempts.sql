-- #117: bounded authenticated Web Test attempt history.
-- Browser roles read their own rows only; the Edge Function is responsible for
-- bearer verification, release/question validation, and deterministic scoring.
create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_attempt_id uuid not null,
  content_id text not null,
  content_revision text not null,
  question_id text not null,
  question_version integer not null,
  test_family text not null,
  domain text not null,
  category text not null,
  practice_mode text not null,
  submitted_answer jsonb not null,
  correct boolean not null,
  response_ms integer not null,
  checkpoint_results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint practice_attempts_client_id_unique unique (user_id, client_attempt_id),
  constraint practice_attempts_content_id_bounded check (char_length(content_id) between 1 and 128 and content_id = btrim(content_id)),
  constraint practice_attempts_revision_sha256 check (content_revision ~ '^[a-f0-9]{64}$'),
  constraint practice_attempts_question_id_bounded check (char_length(question_id) between 1 and 128 and question_id = btrim(question_id)),
  constraint practice_attempts_question_version_positive check (question_version > 0),
  constraint practice_attempts_metadata_bounded check (
    test_family in ('spi') and domain in ('verbal', 'nonverbal')
    and char_length(category) between 1 and 128 and category = btrim(category)
    and practice_mode in ('untimed-learning', 'timed-practice')
  ),
  constraint practice_attempts_answer_bounded check (octet_length(submitted_answer::text) <= 16384),
  constraint practice_attempts_response_bounded check (response_ms between 0 and 3600000),
  constraint practice_attempts_checkpoint_shape check (
    jsonb_typeof(checkpoint_results) = 'array'
    and octet_length(checkpoint_results::text) <= 16384
  )
);

create index practice_attempts_user_created_idx on public.practice_attempts (user_id, created_at desc);
create index practice_attempts_review_idx on public.practice_attempts (user_id, question_id, question_version, created_at desc);

alter table public.practice_attempts enable row level security;
create policy "practice_attempts_own_select" on public.practice_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.practice_attempts from public, anon, authenticated;
grant select on public.practice_attempts to authenticated;
grant select, insert on public.practice_attempts to service_role;

-- Edge-only contract: p_user_id is the verified bearer identity supplied by the
-- handler; all score/category/checkpoint fields must already be server-derived.
create function public.record_practice_attempt(
  p_user_id uuid,
  p_client_attempt_id uuid,
  p_content_id text,
  p_content_revision text,
  p_question_id text,
  p_question_version integer,
  p_test_family text,
  p_domain text,
  p_category text,
  p_practice_mode text,
  p_submitted_answer jsonb,
  p_correct boolean,
  p_response_ms integer,
  p_checkpoint_results jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_client_attempt_id is null or p_submitted_answer is null or p_checkpoint_results is null then
    raise exception 'practice attempt identity and payload are required' using errcode = '22023';
  end if;
  insert into public.practice_attempts (
    user_id, client_attempt_id, content_id, content_revision, question_id,
    question_version, test_family, domain, category, practice_mode,
    submitted_answer, correct, response_ms, checkpoint_results
  ) values (
    p_user_id, p_client_attempt_id, p_content_id, p_content_revision, p_question_id,
    p_question_version, p_test_family, p_domain, p_category, p_practice_mode,
    p_submitted_answer, p_correct, p_response_ms, p_checkpoint_results
  ) on conflict (user_id, client_attempt_id) do nothing;
  if exists (select 1 from public.practice_attempts where user_id = p_user_id and client_attempt_id = p_client_attempt_id) then
    return jsonb_build_object('kind', 'persisted');
  end if;
  return jsonb_build_object('kind', 'conflict');
end;
$$;
revoke all on function public.record_practice_attempt(uuid,uuid,text,text,text,integer,text,text,text,text,jsonb,boolean,integer,jsonb) from public, anon, authenticated;
grant execute on function public.record_practice_attempt(uuid,uuid,text,text,text,integer,text,text,text,text,jsonb,boolean,integer,jsonb) to service_role;

create view public.practice_review_queue
  with (security_invoker = true)
as
  select user_id, content_id, content_revision, question_id, question_version,
    test_family, domain, category, practice_mode, correct, created_at
  from (
    select distinct on (user_id, content_id, content_revision, question_id, question_version)
      user_id, content_id, content_revision, question_id, question_version,
      test_family, domain, category, practice_mode, correct, created_at
    from public.practice_attempts
    order by user_id, content_id, content_revision, question_id, question_version, created_at desc, id desc
  ) latest
  where latest.correct = false;
revoke all on public.practice_review_queue from public, anon;
grant select on public.practice_review_queue to authenticated, service_role;
