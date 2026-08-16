-- 0001_accounts.sql
-- Account, ownership (entitlement), and reading-state persistence.
--
-- Contract: docs/accounts-and-entitlement.md
-- Product contract: docs/product-contract.md (§7 platform responsibility: access,
-- purchase state, library, reading state; §10 provider-neutral payment, ECPay first TWD adapter).
--
-- Design intent
-- -------------
-- The database stores ONLY user-scoped state, keyed by the stable book-level ids
-- from the content model (`Book.id` / `Chapter.id` / `BlockBase.id`; see
-- docs/content-model.md §2 and the global id namespace rule in §4.3). Book
-- content itself NEVER lives here — it ships as static data in `src/content/`.
--
-- Entitlement is server-authoritative: there is intentionally NO insert/update/
-- delete RLS policy on `book_entitlement`, so an authenticated client can never
-- self-grant. Ownership is granted only through the server path
-- (`grant_entitlement`, service_role / operator only; ECPay later calls the same
-- write point from its callback verification).

-- ---------------------------------------------------------------------------
-- 1. book_entitlement — server-authoritative ownership record
-- ---------------------------------------------------------------------------
create table if not exists public.book_entitlement (
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Stable `Book.id` from the content model; not a DB foreign key, because book
  -- metadata lives in the static content bundle, not in this database.
  book_id      text not null,
  -- `manual` = operator / service-role grant; `ecpay` = purchase callback.
  provider     text not null check (provider in ('manual', 'ecpay')),
  -- Opaque provider reference (e.g. an operator note or ECPay transaction id).
  provider_ref text,
  granted_at   timestamptz not null default now(),
  primary key (user_id, book_id)
);

comment on table public.book_entitlement is
  'Server-authoritative record that a user owns (may read) a book. Granting is a server-only path; clients cannot self-grant.';

-- Clients may only read their own entitlements.
alter table public.book_entitlement enable row level security;

create policy "book_entitlement_own_select" on public.book_entitlement
  for select to authenticated
  using (auth.uid() = user_id);

-- NOTE: no `for insert` / `for update` / `for delete` policy on
-- book_entitlement. Deliberate: any client write would let a user grant
-- themselves any book. Ownership changes flow through grant_entitlement below.

-- ---------------------------------------------------------------------------
-- 2. reading_state — one last-read location per user/book
-- ---------------------------------------------------------------------------
create table if not exists public.reading_state (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id    text not null,
  -- Stable `Chapter.id`; the resume anchor (see docs/ui-ux-research.md §4.4).
  chapter_id text not null,
  -- Stable `BlockBase.id` within `chapter_id`. Null = start of the chapter.
  -- The resume semantics defined in §4.4: block identity + optional offset;
  -- on reflow/edit fall back to the nearest stable block or the chapter start.
  block_id   text,
  -- Optional intra-block offset (e.g. character/paragraph index). Semantics are
  -- a renderer-level detail; persisted opaquely here.
  offset     int,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.reading_state enable row level security;

-- Users may read and write their own reading location.
create policy "reading_state_own_all" on public.reading_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. bookmark — optional, anchor-ready reading markers
-- ---------------------------------------------------------------------------
create table if not exists public.bookmark (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id    text not null,
  chapter_id text not null,
  block_id   text,
  offset     int,
  created_at timestamptz not null default now()
);

alter table public.bookmark enable row level security;

create policy "bookmark_own_all" on public.bookmark
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists bookmark_user_book_idx
  on public.bookmark (user_id, book_id);

-- ---------------------------------------------------------------------------
-- 4. Server grant path (operator / ECPay callback). Client-reachable paths are
--    closed off so a browser client can never call this.
-- ---------------------------------------------------------------------------
create or replace function public.grant_entitlement(
  p_user_id      uuid,
  p_book_id      text,
  p_provider     text,
  p_provider_ref text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.book_entitlement (user_id, book_id, provider, provider_ref)
  values (p_user_id, p_book_id, p_provider, p_provider_ref)
  on conflict (user_id, book_id) do update
    set provider     = excluded.provider,
        provider_ref = excluded.provider_ref,
        granted_at   = now();
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and Supabase's default privileges
-- additionally grant EXECUTE to anon/authenticated/service_role for new functions.
-- Close EVERY client-reachable role (public, anon, authenticated) explicitly and
-- keep the write point reachable only by service_role (operator / future ECPay
-- server callback verification). An anon-key client must never call this.
revoke all on function public.grant_entitlement(uuid, text, text, text) from public;
revoke all on function public.grant_entitlement(uuid, text, text, text) from anon;
revoke all on function public.grant_entitlement(uuid, text, text, text) from authenticated;
grant execute on function public.grant_entitlement(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Auto-touch updated_at on reading_state so resume timestamps are
--    server-authoritative regardless of write path.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reading_state_set_updated_at on public.reading_state;
create trigger reading_state_set_updated_at
  before update on public.reading_state
  for each row
  execute function public.set_updated_at();
