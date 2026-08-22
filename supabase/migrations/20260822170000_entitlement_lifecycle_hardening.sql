-- Entitlement lifecycle hardening for refund visibility and repurchase provenance.
--
-- A revoked row is durable financial/access evidence but is not ownership. Hide
-- it at the RLS boundary so every authenticated client sees active grants only.
-- Also rebind source_order_id on a legitimate paid re-grant: a later refund of
-- that new Order must revoke the entitlement belonging to that Order.

drop policy if exists "book_entitlement_own_select" on public.book_entitlement;
create policy "book_entitlement_own_select" on public.book_entitlement
  for select to authenticated
  using (auth.uid() = user_id and status = 'active');

-- RLS policies filter rows but do not themselves grant table privileges. Keep
-- entitlement mutation server-only while enabling the client operations the
-- repository is designed to perform for authenticated users.
grant select on public.book_entitlement to authenticated;
grant select, insert, update, delete on public.reading_state to authenticated;
grant select, insert, update, delete on public.bookmark to authenticated;
grant usage, select on sequence public.bookmark_id_seq to authenticated;

create or replace function public.grant_entitlement(
  p_user_id           uuid,
  p_book_id           text,
  p_provider          text,
  p_provider_ref      text        default null,
  p_source_order_id   uuid        default null,
  p_status            text        default 'active',
  p_revoked_at        timestamptz default null,
  p_revocation_reason text        default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.book_entitlement
    (user_id, book_id, provider, provider_ref, source_order_id, status, revoked_at, revocation_reason)
  values
    (p_user_id, p_book_id, p_provider, p_provider_ref, p_source_order_id,
     coalesce(p_status, 'active'), p_revoked_at, p_revocation_reason)
  on conflict (user_id, book_id) do update
    set provider          = excluded.provider,
        provider_ref      = case when excluded.provider = 'manual'
                                 then excluded.provider_ref
                                 when excluded.provider_ref is not null
                                 then excluded.provider_ref
                                 else book_entitlement.provider_ref end,
        source_order_id   = case when excluded.provider = 'manual'
                                 then excluded.source_order_id
                                 when excluded.source_order_id is not null
                                 then excluded.source_order_id
                                 else book_entitlement.source_order_id end,
        status            = excluded.status,
        revoked_at        = excluded.revoked_at,
        revocation_reason = excluded.revocation_reason,
        granted_at        = case when excluded.provider = 'manual'
                                      or excluded.provider_ref is not null
                                      or excluded.source_order_id is not null
                                 then now()
                                 else book_entitlement.granted_at end;
$$;

revoke all on function public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text) from public;
revoke all on function public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text) from anon;
revoke all on function public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text) from authenticated;
grant execute on function public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text) to service_role;
