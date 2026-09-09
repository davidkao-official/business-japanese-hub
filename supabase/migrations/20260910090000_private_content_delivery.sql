-- #132: server-only release store for future proprietary member artifacts.
--
-- This is a narrow delivery envelope, not a universal content schema. A
-- bounded runtime (for example the Reader Book validator) must validate its
-- own payload before a privileged publisher inserts it. Browser roles have no
-- table or RPC access; the content-delivery Edge Function is the only planned
-- browser delivery path and must consult #107's authoritative membership
-- projection before it returns a payload.

create table public.private_content_release (
  content_id text not null,
  revision text not null,
  content_kind text not null,
  access_scope text not null default 'member',
  payload jsonb not null,
  published_at timestamptz not null default now(),
  primary key (content_id, revision),
  constraint private_content_release_id_bounded check (
    char_length(content_id) between 1 and 128 and content_id = btrim(content_id)
  ),
  constraint private_content_release_revision_sha256 check (revision ~ '^[a-f0-9]{64}$'),
  constraint private_content_release_kind_bounded check (
    char_length(content_kind) between 1 and 64 and content_kind = btrim(content_kind)
  ),
  constraint private_content_release_member_only check (access_scope = 'member'),
  constraint private_content_release_payload_bounded check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 1048576
  )
);

comment on table public.private_content_release is
  'Server-only immutable delivery envelope for future proprietary member content. Not a universal content model; each bounded runtime validates its own payload.';

revoke all on public.private_content_release from public;
revoke all on public.private_content_release from anon;
revoke all on public.private_content_release from authenticated;
alter table public.private_content_release enable row level security;
-- Deliberately no client policies. service_role retains its Supabase-default
-- privileges for the controlled private-source import command.

create function public.private_content_release_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'private_content_release rows are immutable';
end;
$$;

revoke all on function public.private_content_release_immutable() from public;
revoke all on function public.private_content_release_immutable() from anon;
revoke all on function public.private_content_release_immutable() from authenticated;

create trigger private_content_release_immutable
before update or delete on public.private_content_release
for each row execute function public.private_content_release_immutable();
