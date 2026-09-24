-- #174: Workplace Learn publication authority and member-owned saved preferences.
-- The projection contains only stable IDs and release metadata; lesson and
-- vocabulary bodies remain in public fixtures or immutable private releases.
create table public.workplace_learn_publication (
  item_id text primary key,
  item_kind text not null,
  access_scope text not null,
  revision text,
  sample_classification text,
  available boolean not null default true,
  constraint workplace_learn_publication_item_id_bounded check (
    item_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  constraint workplace_learn_publication_kind check (item_kind in ('lesson', 'vocabulary')),
  constraint workplace_learn_publication_access check (access_scope in ('free', 'plus')),
  constraint workplace_learn_publication_revision check (
    revision is null or revision ~ '^[a-f0-9]{64}$'
  ),
  constraint workplace_learn_publication_classification check (
    (access_scope = 'free' and revision is null and sample_classification is not null
      and sample_classification = 'non-proprietary-teaching-sample')
    or (access_scope = 'plus' and revision is not null and sample_classification is null)
  ),
  constraint workplace_learn_publication_release_fk foreign key (item_id, revision)
    references public.private_content_release (content_id, revision)
);

comment on table public.workplace_learn_publication is
  'Service-only current Workplace Learn publication projection. Importing immutable private content does not publish an item.';

insert into public.workplace_learn_publication
  (item_id, item_kind, access_scope, revision, sample_classification, available)
values
  ('workplace-learn-sample-status-update', 'lesson', 'free', null, 'non-proprietary-teaching-sample', true),
  ('workplace-learn-sample-mikomi', 'vocabulary', 'free', null, 'non-proprietary-teaching-sample', true);

create function public.guard_workplace_learn_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.item_id is distinct from old.item_id
    or new.item_kind is distinct from old.item_kind
    or new.access_scope is distinct from old.access_scope
    or new.sample_classification is distinct from old.sample_classification
  ) then
    raise exception 'Workplace Learn publication identity is immutable' using errcode = '22023';
  end if;

  if new.access_scope = 'plus' and not exists (
    select 1 from public.private_content_release r
    where r.content_id = new.item_id
      and r.revision = new.revision
      and r.access_scope = 'member'
      and r.content_kind = case new.item_kind
        when 'lesson' then 'workplace-lesson'
        when 'vocabulary' then 'workplace-vocabulary'
      end
  ) then
    raise exception 'Workplace Learn publication release is invalid' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_workplace_learn_publication() from public, anon, authenticated;
create trigger workplace_learn_publication_guard
before insert or update on public.workplace_learn_publication
for each row execute function public.guard_workplace_learn_publication();

alter table public.workplace_learn_publication enable row level security;
revoke all on public.workplace_learn_publication from public, anon, authenticated, service_role;
grant select on public.workplace_learn_publication to service_role;

-- Controlled publisher entrypoint. It accepts only an immutable Plus release
-- whose runtime kind matches. It never writes or changes release bodies.
create function public.publish_workplace_learn_item(
  p_item_id text,
  p_item_kind text,
  p_revision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  published public.workplace_learn_publication;
begin
  if p_item_id is null or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_item_kind is null or p_item_kind not in ('lesson', 'vocabulary')
    or p_revision is null or p_revision !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid Workplace Learn publication reference' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.private_content_release r
    where r.content_id = p_item_id and r.revision = p_revision
      and r.access_scope = 'member'
      and r.content_kind = case p_item_kind
        when 'lesson' then 'workplace-lesson'
        when 'vocabulary' then 'workplace-vocabulary'
      end
  ) then
    raise exception 'invalid Workplace Learn publication release' using errcode = '22023';
  end if;

  insert into public.workplace_learn_publication as current_publication
    (item_id, item_kind, access_scope, revision, sample_classification, available)
  values (p_item_id, p_item_kind, 'plus', p_revision, null, true)
  on conflict (item_id) do update set
    revision = excluded.revision,
    available = true
  where current_publication.item_kind = excluded.item_kind
    and current_publication.access_scope = 'plus'
    and current_publication.sample_classification is null
  returning * into published;

  if not found then
    raise exception 'Workplace Learn publication identity conflict' using errcode = '22023';
  end if;
  return jsonb_build_object('item_id', published.item_id, 'item_kind', published.item_kind,
    'revision', published.revision, 'available', published.available);
end;
$$;

create function public.retire_workplace_learn_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  retired public.workplace_learn_publication;
begin
  if p_item_id is null or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception 'invalid Workplace Learn item identity' using errcode = '22023';
  end if;
  update public.workplace_learn_publication set available = false
  where item_id = p_item_id and access_scope = 'plus'
  returning * into retired;
  return jsonb_build_object('item_id', p_item_id, 'available', coalesce(retired.available, false));
end;
$$;

create table public.workplace_learn_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.workplace_learn_publication(item_id),
  item_kind text not null,
  revision text,
  saved_at timestamptz not null default statement_timestamp(),
  primary key (user_id, item_id),
  constraint workplace_learn_saves_kind check (item_kind in ('lesson', 'vocabulary')),
  constraint workplace_learn_saves_revision check (revision is null or revision ~ '^[a-f0-9]{64}$')
);

comment on table public.workplace_learn_saves is
  'Member-owned Workplace Learn saved preferences; never completion, practice, understanding, or mastery evidence.';
create index workplace_learn_saves_owner_recent_idx
  on public.workplace_learn_saves (user_id, saved_at desc, item_id);

alter table public.workplace_learn_saves enable row level security;
revoke all on public.workplace_learn_saves from public, anon, authenticated, service_role;
grant select on public.workplace_learn_saves to service_role;

create function public.save_workplace_learn_item(
  p_user_id uuid,
  p_item_id text,
  p_item_kind text,
  p_revision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication public.workplace_learn_publication;
  saved public.workplace_learn_saves;
begin
  if p_user_id is null or p_item_id is null
    or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_item_kind is null or p_item_kind not in ('lesson', 'vocabulary')
    or (p_revision is not null and p_revision !~ '^[a-f0-9]{64}$') then
    raise exception 'invalid Workplace Learn save reference' using errcode = '22023';
  end if;

  -- FOR SHARE is held until the surrounding RPC transaction commits. A
  -- concurrent publish/retire update must wait; one ordered after this save
  -- cannot let the old request overwrite the newer projection state. The
  -- current pgTAP harness is single-session, so this lock-order guarantee is
  -- covered by transaction semantics rather than a two-session race fixture.
  select * into publication from public.workplace_learn_publication
  where item_id = p_item_id for share;
  if not found or not publication.available
    or publication.item_kind <> p_item_kind
    or publication.revision is distinct from p_revision then
    return jsonb_build_object('status', 'stale');
  end if;
  if publication.access_scope = 'free' then
    if publication.sample_classification is distinct from 'non-proprietary-teaching-sample' or p_revision is not null then
      return jsonb_build_object('status', 'stale');
    end if;
  elsif publication.access_scope = 'plus' then
    if p_revision is null or not exists (
      select 1 from public.private_content_release r
      where r.content_id = p_item_id and r.revision = p_revision
        and r.access_scope = 'member'
        and r.content_kind = case p_item_kind
          when 'lesson' then 'workplace-lesson'
          when 'vocabulary' then 'workplace-vocabulary'
        end
    ) then
      return jsonb_build_object('status', 'stale');
    end if;
  else
    return jsonb_build_object('status', 'stale');
  end if;

  insert into public.workplace_learn_saves as current_save (user_id, item_id, item_kind, revision, saved_at)
  values (p_user_id, p_item_id, p_item_kind, p_revision, statement_timestamp())
  on conflict (user_id, item_id) do update set
    revision = excluded.revision,
    saved_at = case when current_save.revision is distinct from excluded.revision
      then statement_timestamp() else current_save.saved_at end
  returning * into saved;
  return jsonb_build_object('status', 'saved', 'item_id', saved.item_id,
    'item_kind', saved.item_kind, 'revision', saved.revision, 'saved_at', saved.saved_at);
end;
$$;

create function public.remove_workplace_learn_item(p_user_id uuid, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed public.workplace_learn_saves;
begin
  if p_user_id is null or p_item_id is null or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception 'invalid Workplace Learn save identity' using errcode = '22023';
  end if;
  delete from public.workplace_learn_saves where user_id = p_user_id and item_id = p_item_id
  returning * into removed;
  return jsonb_build_object('item_id', p_item_id, 'item_kind', removed.item_kind,
    'revision', removed.revision, 'server_timestamp', statement_timestamp());
end;
$$;

revoke all on function public.publish_workplace_learn_item(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.retire_workplace_learn_item(text) from public, anon, authenticated, service_role;
revoke all on function public.save_workplace_learn_item(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.remove_workplace_learn_item(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.publish_workplace_learn_item(text, text, text) to service_role;
grant execute on function public.retire_workplace_learn_item(text) to service_role;
grant execute on function public.save_workplace_learn_item(uuid, text, text, text) to service_role;
grant execute on function public.remove_workplace_learn_item(uuid, text) to service_role;
