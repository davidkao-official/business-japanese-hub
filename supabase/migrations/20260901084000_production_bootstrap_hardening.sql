-- Harden the Supabase-managed automatic-RLS event-trigger function used by
-- production projects created with "Enable automatic RLS".
--
-- Fresh local databases do not create this dashboard-managed helper, so this
-- migration must be safe there as well as on production. When the helper is
-- present, it should remain usable by its event trigger but must not be exposed
-- as a browser-callable Data API RPC to PUBLIC / anon / authenticated roles.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
  end if;
end
$$;
