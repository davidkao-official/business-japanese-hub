-- #171: member-owned Business Reading saves. A save is a preference, not
-- completion or comprehension evidence. The public catalog/release reference
-- is validated by the Edge Function; this table never stores article bodies.
create table public.reading_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  revision text,
  saved_at timestamptz not null default statement_timestamp(),
  primary key (user_id, item_id),
  constraint reading_saves_item_id_bounded check (
    item_id ~ '^[A-Za-z0-9._:-]{1,128}$'
  ),
  constraint reading_saves_revision_sha256 check (
    revision is null or revision ~ '^[a-f0-9]{64}$'
  ),
  constraint reading_saves_release_fk foreign key (item_id, revision)
    references public.private_content_release (content_id, revision)
);

comment on table public.reading_saves is
  'Member-owned Business Reading save preferences. Revision is null only for the explicitly public sample; this is not reading completion or comprehension evidence.';

create index reading_saves_owner_recent_idx
  on public.reading_saves (user_id, saved_at desc, item_id);

alter table public.reading_saves enable row level security;
revoke all on public.reading_saves from public, anon, authenticated, service_role;
grant select on public.reading_saves to service_role;

-- All writes go through narrow service-role-only RPCs. A repeated save at the
-- same revision is idempotent and preserves its original saved_at; a genuinely
-- changed revision refreshes that timestamp.
create function public.save_reading_item(
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
  saved public.reading_saves;
begin
  if p_user_id is null or p_item_id is null
    or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or (p_revision is not null and p_revision !~ '^[a-f0-9]{64}$') then
    raise exception 'invalid Reading save reference' using errcode = '22023';
  end if;

  if p_revision is not null and not exists (
    select 1 from public.private_content_release r
    where r.content_id = p_item_id
      and r.revision = p_revision
      and r.content_kind = 'reading'
      and r.access_scope = 'member'
  ) then
    raise exception 'invalid Reading save release' using errcode = '22023';
  end if;

  insert into public.reading_saves as current_save (user_id, item_id, revision, saved_at)
  values (p_user_id, p_item_id, p_revision, statement_timestamp())
  on conflict (user_id, item_id) do update
    set revision = excluded.revision,
        saved_at = case
          when current_save.revision is distinct from excluded.revision
            then statement_timestamp()
          else current_save.saved_at
        end
  returning * into saved;

  return jsonb_build_object(
    'item_id', saved.item_id,
    'revision', saved.revision,
    'saved_at', saved.saved_at
  );
end;
$$;

create function public.remove_reading_item(
  p_user_id uuid,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed public.reading_saves;
begin
  if p_user_id is null or p_item_id is null
    or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception 'invalid Reading save identity' using errcode = '22023';
  end if;

  delete from public.reading_saves
  where user_id = p_user_id and item_id = p_item_id
  returning * into removed;

  return jsonb_build_object(
    'item_id', p_item_id,
    'revision', removed.revision,
    'server_timestamp', statement_timestamp()
  );
end;
$$;

revoke all on function public.save_reading_item(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.remove_reading_item(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.save_reading_item(uuid, text, text) to service_role;
grant execute on function public.remove_reading_item(uuid, text) to service_role;
