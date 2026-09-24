-- #184: deliver Workplace Plus bodies only through the current publication
-- projection, with temporal membership and immutable release checked together.
create function public.get_member_workplace_learn_release(
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
  v_access jsonb;
  v_release jsonb;
begin
  if p_user_id is null or p_item_id is null or p_revision is null
    or p_item_id !~ '^[A-Za-z0-9._:-]{1,128}$'
    or p_revision !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'missing');
  end if;

  v_access := public.resolve_plus_membership_access(p_user_id);
  if v_access ->> 'access_status' is distinct from 'active' then
    return jsonb_build_object('status', 'non-member');
  end if;

  select jsonb_build_object(
    'status', 'found',
    'content_id', r.content_id,
    'revision', r.revision,
    'content_kind', r.content_kind,
    'payload', r.payload
  ) into v_release
  from public.workplace_learn_publication p
  join public.private_content_release r
    on r.content_id = p.item_id and r.revision = p.revision
  where p.item_id = p_item_id
    and p.revision = p_revision
    and p.access_scope = 'plus'
    and p.available
    and r.content_kind = case p.item_kind
      when 'lesson' then 'workplace-lesson'
      when 'vocabulary' then 'workplace-vocabulary'
    end
    and r.access_scope = 'member';

  return coalesce(v_release, jsonb_build_object('status', 'missing'));
end;
$$;

revoke all on function public.get_member_workplace_learn_release(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_member_workplace_learn_release(uuid, text, text)
  to service_role;
