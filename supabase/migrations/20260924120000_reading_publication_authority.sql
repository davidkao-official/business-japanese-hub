-- #182: Reading publication is separate from immutable release import.
-- This body-free projection carries one current revision for each stable item.
create table public.reading_publication (
  item_id text primary key,
  access_scope text not null,
  revision text,
  sample_classification text,
  available boolean not null default true,
  constraint reading_publication_item_id_bounded check (
    item_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  constraint reading_publication_access_scope check (access_scope in ('free', 'plus')),
  constraint reading_publication_revision check (
    revision is null or revision ~ '^[a-f0-9]{64}$'
  ),
  constraint reading_publication_classification check (
    (access_scope = 'free' and revision is null
      and sample_classification = 'non-proprietary-teaching-sample')
    or (access_scope = 'plus' and revision is not null and sample_classification is null)
  ),
  constraint reading_publication_release_fk foreign key (item_id, revision)
    references public.private_content_release (content_id, revision)
);

comment on table public.reading_publication is
  'Service-only, body-free current Reading publication projection. Importing an immutable release never publishes it.';

insert into public.reading_publication
  (item_id, access_scope, revision, sample_classification, available)
values
  ('reading-sample-internal-proposal', 'free', null, 'non-proprietary-teaching-sample', true);

create function public.guard_reading_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.item_id is distinct from old.item_id
    or new.access_scope is distinct from old.access_scope
    or new.sample_classification is distinct from old.sample_classification
  ) then
    raise exception 'Reading publication identity is immutable' using errcode = '22023';
  end if;

  if new.access_scope = 'plus' and not exists (
    select 1 from public.private_content_release r
    where r.content_id = new.item_id
      and r.revision = new.revision
      and r.content_kind = 'reading'
      and r.access_scope = 'member'
  ) then
    raise exception 'invalid Reading publication release' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_reading_publication() from public, anon, authenticated, service_role;
create trigger reading_publication_guard
before insert or update on public.reading_publication
for each row execute function public.guard_reading_publication();

alter table public.reading_publication enable row level security;
revoke all on public.reading_publication from public, anon, authenticated, service_role;
grant select on public.reading_publication to service_role;

create function public.publish_reading_item(p_item_id text, p_revision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  published public.reading_publication;
begin
  if p_item_id is null or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_revision is null or p_revision !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid Reading publication reference' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.private_content_release r
    where r.content_id = p_item_id and r.revision = p_revision
      and r.content_kind = 'reading' and r.access_scope = 'member'
  ) then
    raise exception 'invalid Reading publication release' using errcode = '22023';
  end if;

  insert into public.reading_publication as current_publication
    (item_id, access_scope, revision, sample_classification, available)
  values (p_item_id, 'plus', p_revision, null, true)
  on conflict (item_id) do update set
    revision = excluded.revision,
    available = true
  where current_publication.access_scope = 'plus'
    and current_publication.sample_classification is null
  returning * into published;

  if not found then
    raise exception 'Reading publication identity conflict' using errcode = '22023';
  end if;
  return jsonb_build_object('item_id', published.item_id, 'revision', published.revision,
    'available', published.available);
end;
$$;

create function public.retire_reading_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  retired public.reading_publication;
begin
  if p_item_id is null or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception 'invalid Reading item identity' using errcode = '22023';
  end if;
  update public.reading_publication set available = false
  where item_id = p_item_id and access_scope = 'plus'
  returning * into retired;
  return jsonb_build_object('item_id', p_item_id, 'available', coalesce(retired.available, false));
end;
$$;

-- Membership, publication, and immutable release are evaluated inside this
-- single RPC. A Reading body is never fetched on an earlier Edge query.
-- The fixed-time membership helper is read-only and samples no clock itself,
-- so its result can share the body query's statement snapshot.
alter function public._resolve_plus_membership_access_at(uuid, timestamptz) stable;

create function public.get_member_reading_release(
  p_user_id uuid,
  p_item_id text,
  p_revision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_release jsonb;
begin
  if p_user_id is null or p_item_id is null or p_revision is null
    or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_revision !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'missing');
  end if;

  with access as materialized (
    select public._resolve_plus_membership_access_at(
      p_user_id, clock_timestamp()
    ) ->> 'access_status' as status
  )
  select case
    when access.status is distinct from 'active' then
      jsonb_build_object('status', 'non-member')
    else coalesce((
      select jsonb_build_object(
        'status', 'found',
        'content_id', r.content_id,
        'revision', r.revision,
        'content_kind', r.content_kind,
        'payload', r.payload
      )
      from public.reading_publication p
      join public.private_content_release r
        on r.content_id = p.item_id and r.revision = p.revision
      where p.item_id = p_item_id
        and p.revision = p_revision
        and p.access_scope = 'plus'
        and p.available
        and r.content_kind = 'reading'
        and r.access_scope = 'member'
    ), jsonb_build_object('status', 'missing'))
  end into v_release
  from access;

  return v_release;
end;
$$;

revoke all on function public.publish_reading_item(text, text) from public, anon, authenticated, service_role;
revoke all on function public.retire_reading_item(text) from public, anon, authenticated, service_role;
revoke all on function public.get_member_reading_release(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.publish_reading_item(text, text) to service_role;
grant execute on function public.retire_reading_item(text) to service_role;
grant execute on function public.get_member_reading_release(uuid, text, text) to service_role;

-- Replace the #171 writer with an exact projection check held under FOR SHARE.
-- A concurrent publication update/retirement therefore serializes with saves.
create or replace function public.save_reading_item(
  p_user_id uuid,
  p_item_id text,
  p_revision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication public.reading_publication;
  saved public.reading_saves;
begin
  if p_user_id is null or p_item_id is null
    or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or (p_revision is not null and p_revision !~ '^[a-f0-9]{64}$') then
    raise exception 'invalid Reading save reference' using errcode = '22023';
  end if;

  select * into publication from public.reading_publication
  where item_id = p_item_id for share;
  if not found or not publication.available or publication.revision is distinct from p_revision then
    return jsonb_build_object('status', 'stale');
  end if;
  if publication.access_scope = 'free' then
    if publication.sample_classification is distinct from 'non-proprietary-teaching-sample'
      or p_revision is not null then
      return jsonb_build_object('status', 'stale');
    end if;
  elsif publication.access_scope = 'plus' then
    if p_revision is null or not exists (
      select 1 from public.private_content_release r
      where r.content_id = p_item_id and r.revision = p_revision
        and r.content_kind = 'reading' and r.access_scope = 'member'
    ) then
      return jsonb_build_object('status', 'stale');
    end if;
  else
    return jsonb_build_object('status', 'stale');
  end if;

  insert into public.reading_saves as current_save (user_id, item_id, revision, saved_at)
  values (p_user_id, p_item_id, p_revision, statement_timestamp())
  on conflict (user_id, item_id) do update
    set revision = excluded.revision,
        saved_at = case when current_save.revision is distinct from excluded.revision
          then statement_timestamp() else current_save.saved_at end
  returning * into saved;

  return jsonb_build_object(
    'item_id', saved.item_id,
    'revision', saved.revision,
    'saved_at', saved.saved_at
  );
end;
$$;

revoke all on function public.save_reading_item(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.save_reading_item(uuid, text, text) to service_role;
