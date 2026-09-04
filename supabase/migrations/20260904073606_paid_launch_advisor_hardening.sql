-- Targeted remediation for the production Supabase advisor findings observed
-- during Paid Launch reconciliation. Keep the original migrations immutable:
-- this migration changes only the final schema state.

-- The trigger is not SECURITY DEFINER, but it still runs during user-state
-- writes. Fix its search path so an invoker-controlled setting cannot affect
-- name resolution.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- `auth.uid()` is constant for a statement. Wrap it in a scalar subquery so
-- Postgres evaluates it once, without changing the ownership or active-only
-- access semantics of the existing policies.
drop policy if exists "book_entitlement_own_select" on public.book_entitlement;
create policy "book_entitlement_own_select" on public.book_entitlement
  for select to authenticated
  using ((select auth.uid()) = user_id and status = 'active');

drop policy if exists "reading_state_own_all" on public.reading_state;
create policy "reading_state_own_all" on public.reading_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "bookmark_own_all" on public.bookmark;
create policy "bookmark_own_all" on public.bookmark
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
