-- Atomic first-sale checkout facts and transactional order-confirmation email.
-- This migration intentionally follows 20260820090000: it extends the shared
-- scheduler mode contract introduced there.

-- ---------------------------------------------------------------------------
-- 1. Authoritative sellable item name and immutable customer delivery email.
-- ---------------------------------------------------------------------------
alter table public.catalog add column if not exists item_name text;
update public.catalog set item_name = slug where item_name is null;
alter table public.catalog alter column item_name set not null;
comment on column public.catalog.item_name is
  'Authoritative customer-facing Book name snapshotted by create_checkout_intent; backfilled from slug only for pre-migration catalog rows.';

alter table public.orders add column if not exists customer_email_snapshot text;
-- Preserve fulfillment for any pre-migration pending Order whose account has a
-- confirmed email. Unknown/unconfirmed legacy identities remain NULL and fail
-- closed rather than receiving a guessed delivery address.
update public.orders orders
   set customer_email_snapshot = lower(btrim(users.email))
  from auth.users users
 where users.id = orders.user_id
   and orders.customer_email_snapshot is null
   and users.email_confirmed_at is not null
   and users.email is not null
   and length(btrim(users.email)) between 3 and 320
   and users.email ~ '^[^[:space:]@]+@[^[:space:]@]+$';
alter table public.orders drop constraint if exists orders_customer_email_snapshot_check;
alter table public.orders add constraint orders_customer_email_snapshot_check
  check (
    customer_email_snapshot is null
    or (
      length(btrim(customer_email_snapshot)) between 3 and 320
      and customer_email_snapshot ~ '^[^[:space:]@]+@[^[:space:]@]+$'
    )
  );
comment on column public.orders.customer_email_snapshot is
  'Immutable purchase-time email used for the order confirmation. Nullable only for legacy pre-migration rows; create_checkout_intent always requires it.';

alter table public.orders add column if not exists customer_locale_snapshot text;
alter table public.orders drop constraint if exists orders_customer_locale_snapshot_check;
alter table public.orders add constraint orders_customer_locale_snapshot_check
  check (customer_locale_snapshot is null or customer_locale_snapshot in ('ja', 'en', 'zh-TW'));
comment on column public.orders.customer_locale_snapshot is
  'Immutable buyer-facing locale for customer communication. Separate from the fixed legal-evidence locale and nullable only for legacy rows.';

create or replace function public.orders_immutable_fields_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.published_revision is distinct from old.published_revision
     or new.item_name_snapshot is distinct from old.item_name_snapshot
     or new.jurisdiction is distinct from old.jurisdiction
     or new.japan_tax_status_snapshot is distinct from old.japan_tax_status_snapshot
     or new.customer_email_snapshot is distinct from old.customer_email_snapshot
     or new.customer_locale_snapshot is distinct from old.customer_locale_snapshot then
    raise exception 'orders: commercial and compliance snapshots are immutable after creation';
  end if;
  return new;
end;
$$;

revoke all on function public.orders_immutable_fields_check() from public;
revoke all on function public.orders_immutable_fields_check() from anon;
revoke all on function public.orders_immutable_fields_check() from authenticated;
grant execute on function public.orders_immutable_fields_check() to service_role;

comment on table public.orders is
  'Purchase intent ledger. Catalog, price, compliance, customer-email, and customer-locale snapshots are immutable after creation; orchestration only updates status/paid_at/refunded_at.';

-- Older schemas permitted more than one pending Order. Never guess which
-- PaymentAttempt is authoritative during upgrade: stop with an operator-facing
-- reconciliation gate before adding the invariant.
do $$
begin
  if exists (
    select 1 from public.orders
     where status = 'pending'
     group by user_id, book_id
    having count(*) > 1
  ) then
    raise exception 'first-sale migration blocked: duplicate pending Orders require provider reconciliation'
      using hint = 'Verify every affected provider attempt, then cancel only Orders proven inactive before rerunning this migration.';
  end if;
end;
$$;

-- A browser retry or concurrent tab shares one pending Order. Failed attempts
-- receive a new PaymentAttempt; live attempts resume with their stable provider
-- idempotency key. Terminal Orders leave the predicate.
create unique index if not exists orders_one_open_checkout_uidx
  on public.orders (user_id, book_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Atomic service-role-only checkout intent creation.
--    The trusted Edge handler supplies canonical legal evidence and identity;
--    this function re-reads the released catalog and commits Order, compliance,
--    and Payment together. Clients can call none of these write surfaces.
-- ---------------------------------------------------------------------------
create or replace function public.create_checkout_intent(
  p_user_id                    uuid,
  p_book_id                    text,
  p_customer_email_snapshot    text,
  p_customer_locale_snapshot   text,
  p_jurisdiction               text,
  p_japan_tax_status_snapshot  text,
  p_locale                     text,
  p_notice_version             text,
  p_consent_version            text,
  p_consent_granted            boolean,
  p_notice_text_snapshot       text,
  p_consent_text_snapshot      text,
  p_consent_timestamp          timestamptz,
  p_provider                   text,
  p_provider_merchant_ref      text,
  p_payment_method             text default 'credit'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog public.catalog%rowtype;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_expected_provider text;
  v_email text := lower(btrim(p_customer_email_snapshot));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if nullif(btrim(p_book_id), '') is null then raise exception 'book id is required'; end if;
  if v_email is null
     or length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'valid customer email is required';
  end if;
  if p_customer_locale_snapshot is null
     or p_customer_locale_snapshot not in ('ja', 'en', 'zh-TW') then
    raise exception 'supported customer locale is required';
  end if;
  if p_jurisdiction not in ('TW', 'JP') then
    raise exception 'resolved jurisdiction is required';
  end if;
  if p_jurisdiction = 'TW' and p_japan_tax_status_snapshot <> 'unresolved' then
    raise exception 'TW checkout requires unresolved Japan tax status';
  end if;
  if p_jurisdiction = 'JP' and p_japan_tax_status_snapshot not in ('taxable', 'exempt') then
    raise exception 'JP checkout requires resolved Japan tax status';
  end if;
  if p_consent_granted is distinct from true then
    raise exception 'checkout consent is required';
  end if;
  if nullif(btrim(p_locale), '') is null
     or nullif(btrim(p_notice_version), '') is null
     or nullif(btrim(p_consent_version), '') is null
     or nullif(btrim(p_notice_text_snapshot), '') is null
     or nullif(btrim(p_consent_text_snapshot), '') is null
     or p_consent_timestamp is null then
    raise exception 'complete canonical compliance evidence is required';
  end if;
  if nullif(btrim(p_provider_merchant_ref), '') is null then
    raise exception 'provider merchant reference is required';
  end if;

  select * into v_catalog
    from public.catalog
   where book_id = p_book_id
     and released_at <= now()
   for share;
  if not found then
    raise exception 'released catalog item % not found', p_book_id;
  end if;
  if v_catalog.amount_minor <= 0 then
    raise exception 'catalog item % is not a paid checkout item', p_book_id;
  end if;

  if exists (
    select 1 from public.book_entitlement entitlement
     where entitlement.user_id = p_user_id
       and entitlement.book_id = p_book_id
       and entitlement.status = 'active'
  ) or exists (
    select 1 from public.orders owned_order
     where owned_order.user_id = p_user_id
       and owned_order.book_id = p_book_id
       and owned_order.status = 'paid'
  ) then
    return jsonb_build_object('outcome', 'owned');
  end if;

  v_expected_provider := case v_catalog.currency
    when 'USD' then 'paypal'
    when 'TWD' then 'ecpay'
    else null
  end;
  if v_expected_provider is null then
    raise exception 'currency % is not launch-enabled', v_catalog.currency;
  end if;
  if p_provider is distinct from v_expected_provider then
    raise exception 'currency % requires provider %', v_catalog.currency, v_expected_provider;
  end if;
  if (v_expected_provider = 'paypal' and p_payment_method <> 'paypal')
     or (v_expected_provider = 'ecpay' and p_payment_method <> 'credit') then
    raise exception 'provider % requires payment method %', v_expected_provider,
      case when v_expected_provider = 'paypal' then 'paypal' else 'credit' end;
  end if;

  insert into public.orders (
    user_id, book_id, item_name_snapshot, published_revision,
    amount_minor, currency, status, jurisdiction,
    japan_tax_status_snapshot, customer_email_snapshot, customer_locale_snapshot
  ) values (
    p_user_id, v_catalog.book_id, v_catalog.item_name, v_catalog.published_revision,
    v_catalog.amount_minor, v_catalog.currency, 'pending', p_jurisdiction,
    p_japan_tax_status_snapshot, v_email, p_customer_locale_snapshot
  ) on conflict (user_id, book_id) where status = 'pending'
    do nothing
  returning * into v_order;

  if not found then
    select * into v_order
      from public.orders
     where user_id = p_user_id
       and book_id = p_book_id
       and status = 'pending';
    select * into v_payment
      from public.payments
     where order_id = v_order.id
     order by created_at desc, id desc
     limit 1;
    if v_order.id is null or v_payment.id is null then
      raise exception 'existing checkout intent is incomplete';
    end if;
    if v_payment.provider <> v_expected_provider then
      raise exception 'existing checkout intent provider no longer matches the released catalog';
    end if;
    if v_payment.status = 'failed' then
      insert into public.payments (
        order_id, provider, provider_merchant_ref, amount_minor,
        currency, method, status
      ) values (
        v_order.id, v_payment.provider, btrim(p_provider_merchant_ref),
        v_order.amount_minor, v_order.currency, v_payment.method, 'created'
      ) returning * into v_payment;
      return jsonb_build_object(
        'outcome', 'retry_created',
        'order', to_jsonb(v_order),
        'payment', to_jsonb(v_payment)
      );
    end if;
    if v_payment.status not in ('created', 'pending', 'verification_pending') then
      raise exception 'existing checkout intent has non-resumable payment status %', v_payment.status;
    end if;
    return jsonb_build_object(
      'outcome', 'resumed',
      'order', to_jsonb(v_order),
      'payment', to_jsonb(v_payment)
    );
  end if;

  -- The insert may have waited on a concurrently-finalizing pending Order. If
  -- that Order became paid while the unique-index conflict was rechecked, the
  -- insert can now succeed; close this race before any PaymentAttempt exists.
  if exists (
    select 1 from public.book_entitlement entitlement
     where entitlement.user_id = p_user_id
       and entitlement.book_id = p_book_id
       and entitlement.status = 'active'
  ) or exists (
    select 1 from public.orders owned_order
     where owned_order.user_id = p_user_id
       and owned_order.book_id = p_book_id
       and owned_order.status = 'paid'
       and owned_order.id <> v_order.id
  ) then
    delete from public.orders where id = v_order.id;
    return jsonb_build_object('outcome', 'owned');
  end if;

  insert into public.order_compliance (
    order_id, jurisdiction, locale, notice_version, consent_version,
    consent_granted, notice_text_snapshot, consent_text_snapshot, consent_timestamp
  ) values (
    v_order.id, p_jurisdiction, btrim(p_locale), btrim(p_notice_version),
    btrim(p_consent_version), true, p_notice_text_snapshot,
    p_consent_text_snapshot, p_consent_timestamp
  );

  insert into public.payments (
    order_id, provider, provider_merchant_ref, amount_minor,
    currency, method, status
  ) values (
    v_order.id, v_expected_provider, btrim(p_provider_merchant_ref),
    v_catalog.amount_minor, v_catalog.currency, p_payment_method, 'created'
  ) returning * into v_payment;

  return jsonb_build_object(
    'outcome', 'created',
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment)
  );
end;
$$;

revoke all on function public.create_checkout_intent(uuid,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,text,text,text) from public;
revoke all on function public.create_checkout_intent(uuid,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,text,text,text) from anon;
revoke all on function public.create_checkout_intent(uuid,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,text,text,text) from authenticated;
grant execute on function public.create_checkout_intent(uuid,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,text,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Server-only transactional-email outbox.
-- ---------------------------------------------------------------------------
create table public.order_email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id),
  recipient_email     text check (
    recipient_email is null or (
      length(btrim(recipient_email)) between 3 and 320
      and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
    )
  ),
  locale              text check (locale is null or length(btrim(locale)) > 0),
  template_key        text not null default 'order-confirmation-v1',
  status              text not null default 'pending'
    check (status in ('pending', 'processing', 'sending', 'retry', 'sent', 'dead')),
  attempt_count       integer not null default 0 check (attempt_count >= 0),
  next_attempt_at     timestamptz,
  locked_at           timestamptz,
  provider_message_id text,
  last_error_code     text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  unique (order_id, template_key),
  check (status = 'dead' or (recipient_email is not null and locale is not null))
);

create index order_email_outbox_due_idx
  on public.order_email_outbox (next_attempt_at, created_at)
  where status in ('pending', 'retry');
create index order_email_outbox_stale_idx
  on public.order_email_outbox (locked_at)
  where status in ('processing', 'sending');

comment on table public.order_email_outbox is
  'Server-only transactional-email outbox. First fulfillment enqueues one immutable order-confirmation key; retries stop before the provider idempotency window expires.';

alter table public.order_email_outbox enable row level security;
revoke all on public.order_email_outbox from public;
revoke all on public.order_email_outbox from anon;
revoke all on public.order_email_outbox from authenticated;
grant select, insert, update on public.order_email_outbox to service_role;

-- ---------------------------------------------------------------------------
-- 4. First pending -> paid fulfillment atomically enqueues exactly once.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_payment_success(
  p_payment_id              uuid,
  p_provider_payment_ref    text,
  p_paid_at                 timestamptz,
  p_provider_status_code    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_email_locale text;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment % not found', p_payment_id; end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  if not found then raise exception 'order % not found for payment %', v_payment.order_id, p_payment_id; end if;

  if v_payment.status in ('failed', 'refunded') then
    update public.payments
       set last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'verified success ignored for terminal payment'
     where id = v_payment.id;
    return jsonb_build_object('payment_status', v_payment.status, 'order_status', v_order.status, 'granted', false);
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'verified payment % belongs to cancelled order %', v_payment.id, v_order.id;
  end if;

  if v_order.status = 'pending' then
    v_email_locale := v_order.customer_locale_snapshot;

    update public.payments
       set status = 'succeeded',
           provider_payment_ref = coalesce(p_provider_payment_ref, provider_payment_ref),
           paid_at = coalesce(paid_at, v_paid_at),
           last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'payment confirmed'
     where id = v_payment.id;

    perform public.grant_entitlement(
      p_user_id           => v_order.user_id,
      p_book_id           => v_order.book_id,
      p_provider          => v_payment.provider,
      p_provider_ref      => null,
      p_source_order_id   => v_order.id,
      p_status            => 'active',
      p_revoked_at        => null,
      p_revocation_reason => null
    );

    update public.orders
       set status = 'paid', paid_at = coalesce(paid_at, v_paid_at)
     where id = v_order.id;

    insert into public.order_email_outbox (
      order_id, recipient_email, locale, template_key, status, next_attempt_at,
      last_error_code
    ) values (
      v_order.id, v_order.customer_email_snapshot, v_email_locale,
      'order-confirmation-v1',
      case when v_order.customer_email_snapshot is not null and v_email_locale is not null
        then 'pending' else 'dead' end,
      case when v_order.customer_email_snapshot is not null and v_email_locale is not null
        then now() else null end,
      case
        when v_order.customer_email_snapshot is null then 'missing_customer_email_snapshot'
        when v_email_locale is null then 'missing_customer_locale_snapshot'
        else null
      end
    ) on conflict (order_id, template_key) do nothing;

    return jsonb_build_object('payment_status', 'succeeded', 'order_status', 'paid', 'granted', true);
  end if;

  if v_payment.status = 'succeeded' then
    update public.payments
       set provider_payment_ref = coalesce(p_provider_payment_ref, provider_payment_ref),
           last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'payment confirmed'
     where id = v_payment.id;
    return jsonb_build_object('payment_status', 'succeeded', 'order_status', v_order.status, 'granted', false);
  end if;

  if v_payment.status in ('created', 'pending', 'verification_pending') then
    update public.payments
       set status = 'duplicate_success',
           provider_payment_ref = coalesce(p_provider_payment_ref, provider_payment_ref),
           paid_at = coalesce(paid_at, v_paid_at),
           last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'duplicate successful charge; finance review required'
     where id = v_payment.id;
  end if;

  return jsonb_build_object(
    'payment_status', case
      when v_payment.status in ('created', 'pending', 'verification_pending') then 'duplicate_success'
      else v_payment.status
    end,
    'order_status', v_order.status,
    'granted', false
  );
end;
$$;

revoke all on function public.finalize_payment_success(uuid,text,timestamptz,text) from public;
revoke all on function public.finalize_payment_success(uuid,text,timestamptz,text) from anon;
revoke all on function public.finalize_payment_success(uuid,text,timestamptz,text) from authenticated;
grant execute on function public.finalize_payment_success(uuid,text,timestamptz,text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Atomic SKIP LOCKED claim. Stale processing claims become retryable after
--    ten minutes; the Edge worker owns final sent/retry/dead transitions.
-- ---------------------------------------------------------------------------
create or replace function public.claim_order_email_jobs(
  p_limit integer default 20,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  update public.order_email_outbox outbox
     set status = 'dead',
         locked_at = null,
         next_attempt_at = null,
         last_error_code = 'order_no_longer_paid'
   where outbox.status in ('pending', 'retry', 'processing')
     and exists (
       select 1 from public.orders orders
        where orders.id = outbox.order_id
          and orders.status <> 'paid'
     );

  with candidates as materialized (
    select outbox.id
      from public.order_email_outbox outbox
     where (
       outbox.status in ('pending', 'retry')
       and coalesce(outbox.next_attempt_at, outbox.created_at) <= p_now
     ) or (
       outbox.status in ('processing', 'sending')
       and outbox.locked_at <= p_now - interval '10 minutes'
     )
     order by outbox.created_at, outbox.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update skip locked
  ), updated as (
    update public.order_email_outbox outbox
       set status = 'processing',
           locked_at = p_now,
           attempt_count = outbox.attempt_count + 1
      from candidates
     where outbox.id = candidates.id
     returning outbox.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', updated.id,
    'orderId', updated.order_id,
    'recipientEmail', updated.recipient_email,
    'locale', updated.locale,
    'templateKey', updated.template_key,
    'createdAt', updated.created_at,
    'attemptCount', updated.attempt_count,
    'itemName', orders.item_name_snapshot,
    'amountMinor', orders.amount_minor,
    'currency', orders.currency,
    'paidAt', orders.paid_at,
    'provider', payment.provider,
    'paymentMethod', payment.method
  ) order by updated.created_at, updated.id), '[]'::jsonb)
  into v_result
  from updated
  join public.orders orders on orders.id = updated.order_id
  left join lateral (
    select payments.provider, payments.method
      from public.payments payments
     where payments.order_id = orders.id
       and payments.status in ('succeeded', 'refunded')
     order by payments.paid_at asc nulls last, payments.created_at asc
     limit 1
  ) payment on true;

  return v_result;
end;
$$;

revoke all on function public.claim_order_email_jobs(integer,timestamptz) from public;
revoke all on function public.claim_order_email_jobs(integer,timestamptz) from anon;
revoke all on function public.claim_order_email_jobs(integer,timestamptz) from authenticated;
grant execute on function public.claim_order_email_jobs(integer,timestamptz) to service_role;

-- Recheck the authoritative Order and establish the durable `sending` fence
-- immediately before the external call. A refund that wins before this lock
-- closes the job; one that commits after the fence cannot erase in-flight send
-- evidence from a concurrent cron.
create or replace function public.prepare_order_email_send(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_outbox_status text;
  v_order_status text;
begin
  select order_id, status into v_order_id, v_outbox_status
    from public.order_email_outbox
   where id = p_job_id
   for update;
  if not found or v_outbox_status <> 'processing' then return false; end if;

  select status into v_order_status
    from public.orders
   where id = v_order_id
   for key share;
  if v_order_status = 'paid' then
    update public.order_email_outbox
       set status = 'sending'
     where id = p_job_id and status = 'processing';
    return found;
  end if;

  update public.order_email_outbox
     set status = 'dead',
         locked_at = null,
         next_attempt_at = null,
         last_error_code = 'order_no_longer_paid'
   where id = p_job_id and status = 'processing';
  return false;
end;
$$;

revoke all on function public.prepare_order_email_send(uuid) from public;
revoke all on function public.prepare_order_email_send(uuid) from anon;
revoke all on function public.prepare_order_email_send(uuid) from authenticated;
grant execute on function public.prepare_order_email_send(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Extend the shared secret-protected pg_net caller with an email mode.
-- ---------------------------------------------------------------------------
insert into public.scheduled_job_config (key, value)
values ('order_email_function_url', 'https://<project-ref>.supabase.co/functions/v1/order-email')
on conflict (key) do nothing;

create or replace function public.is_order_email_scheduler_ready(
  p_function_url text,
  p_secret_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_function_url text;
  v_secret_name text;
  v_job_secret text;
begin
  if nullif(btrim(p_function_url), '') is null
     or p_secret_sha256 !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select value into v_function_url
    from public.scheduled_job_config
   where key = 'order_email_function_url';
  select value into v_secret_name
    from public.scheduled_job_config
   where key = 'scheduled_job_secret_vault_name';
  if v_function_url is distinct from p_function_url then return false; end if;

  begin
    select decrypted_secret into v_job_secret
      from vault.decrypted_secrets
     where name = coalesce(v_secret_name, 'scheduled_job_secret')
     limit 1;
  exception when undefined_table or insufficient_privilege then
    return false;
  end;

  return v_job_secret is not null
    and encode(extensions.digest(v_job_secret, 'sha256'), 'hex') = p_secret_sha256
    and exists (
      select 1 from cron.job
       where jobname = 'order-email-outbox'
         and active
         and schedule = '* * * * *'
         and command = 'select public.scheduled_order_email_call();'
    );
end;
$$;

revoke all on function public.is_order_email_scheduler_ready(text,text) from public;
revoke all on function public.is_order_email_scheduler_ready(text,text) from anon;
revoke all on function public.is_order_email_scheduler_ready(text,text) from authenticated;
grant execute on function public.is_order_email_scheduler_ready(text,text) to service_role;

create or replace function public.scheduled_job_call(p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  function_url text;
  secret_name  text;
  job_secret   text;
  config_key   text;
begin
  if p_mode not in ('repair', 'reconcile', 'email') then
    raise exception 'invalid scheduled job mode: %', p_mode;
  end if;

  config_key := case when p_mode = 'email'
    then 'order_email_function_url'
    else 'repair_reconcile_function_url'
  end;
  select value into function_url from public.scheduled_job_config where key = config_key;
  select value into secret_name from public.scheduled_job_config where key = 'scheduled_job_secret_vault_name';

  if function_url is null or function_url like 'https://<project-ref>%' then
    raise notice 'scheduled_job_call: % is not configured; skipping.', config_key;
    return;
  end if;

  begin
    select decrypted_secret into job_secret
      from vault.decrypted_secrets
     where name = coalesce(secret_name, 'scheduled_job_secret')
     limit 1;
  exception when undefined_table or insufficient_privilege then
    raise notice 'scheduled_job_call: vault is unavailable; skipping.';
    return;
  end;

  if job_secret is null then
    raise notice 'scheduled_job_call: vault secret "%" is not set; skipping.', secret_name;
    return;
  end if;

  perform net.http_post(
    url     := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Scheduled-Job-Secret', job_secret
    ),
    body    := jsonb_build_object('mode', p_mode)
  );
end;
$$;

create or replace function public.scheduled_order_email_call()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.scheduled_job_call('email');
end;
$$;

revoke all on function public.scheduled_job_call(text) from public;
revoke all on function public.scheduled_job_call(text) from anon;
revoke all on function public.scheduled_job_call(text) from authenticated;
grant execute on function public.scheduled_job_call(text) to service_role;

revoke all on function public.scheduled_order_email_call() from public;
revoke all on function public.scheduled_order_email_call() from anon;
revoke all on function public.scheduled_order_email_call() from authenticated;
grant execute on function public.scheduled_order_email_call() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'order-email-outbox') then
    perform cron.schedule(
      'order-email-outbox',
      '* * * * *',
      'select public.scheduled_order_email_call();'
    );
  end if;
end;
$$;
