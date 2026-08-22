-- Paid checkout may open only when every recovery/delivery scheduler is wired
-- to this project with the same Vault-backed secret. Provider callbacks can be
-- ambiguous by design, so repair is part of the purchase availability boundary,
-- not merely an operator convenience.

create table public.scheduled_job_health (
  job_name text primary key check (job_name in ('repair', 'reconcile', 'email')),
  current_run_id uuid,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[a-zA-Z0-9_.:-]{1,160}$'
  ),
  updated_at timestamptz not null default now()
);

alter table public.scheduled_job_health enable row level security;
revoke all on table public.scheduled_job_health from public;
revoke all on table public.scheduled_job_health from anon;
revoke all on table public.scheduled_job_health from authenticated;
grant select, insert, update on table public.scheduled_job_health to service_role;

create or replace function public.record_scheduled_job_started(p_job_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_run_id uuid := gen_random_uuid();
begin
  if p_job_name not in ('repair', 'reconcile', 'email') then
    raise exception 'invalid scheduled job name: %', p_job_name;
  end if;

  insert into public.scheduled_job_health (
    job_name, current_run_id, last_started_at, updated_at
  ) values (
    p_job_name, v_run_id, v_now, v_now
  )
  on conflict (job_name) do update
    set current_run_id = excluded.current_run_id,
        last_started_at = excluded.last_started_at,
        updated_at = excluded.updated_at;
  return v_run_id;
end;
$$;

create or replace function public.record_scheduled_job_result(
  p_job_name text,
  p_run_id uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_error_code text;
  v_updated integer;
begin
  if p_job_name not in ('repair', 'reconcile', 'email') then
    raise exception 'invalid scheduled job name: %', p_job_name;
  end if;
  if p_run_id is null or p_succeeded is null then
    raise exception 'scheduled job result requires a run id and success flag';
  end if;

  v_error_code := case
    when p_succeeded then null
    when coalesce(p_error_code, '') ~ '^[a-zA-Z0-9_.:-]{1,160}$' then p_error_code
    else 'worker_failed'
  end;

  update public.scheduled_job_health
     set current_run_id = null,
         last_succeeded_at = case
          when p_succeeded then v_now
          else last_succeeded_at
        end,
        last_failed_at = case
          when p_succeeded then last_failed_at
          else v_now
        end,
        last_error_code = v_error_code,
        updated_at = v_now
   where job_name = p_job_name
     and current_run_id = p_run_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.record_scheduled_job_started(text) from public;
revoke all on function public.record_scheduled_job_started(text) from anon;
revoke all on function public.record_scheduled_job_started(text) from authenticated;
grant execute on function public.record_scheduled_job_started(text) to service_role;

revoke all on function public.record_scheduled_job_result(text,uuid,boolean,text) from public;
revoke all on function public.record_scheduled_job_result(text,uuid,boolean,text) from anon;
revoke all on function public.record_scheduled_job_result(text,uuid,boolean,text) from authenticated;
grant execute on function public.record_scheduled_job_result(text,uuid,boolean,text) to service_role;

create or replace function public.is_paid_launch_scheduler_ready(
  p_repair_function_url text,
  p_email_function_url text,
  p_secret_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair_function_url text;
  v_email_function_url text;
  v_secret_name text;
  v_job_secret text;
begin
  if nullif(btrim(p_repair_function_url), '') is null
     or nullif(btrim(p_email_function_url), '') is null
     or p_secret_sha256 !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select value into v_repair_function_url
    from public.scheduled_job_config
   where key = 'repair_reconcile_function_url';
  select value into v_email_function_url
    from public.scheduled_job_config
   where key = 'order_email_function_url';
  select value into v_secret_name
    from public.scheduled_job_config
   where key = 'scheduled_job_secret_vault_name';

  if v_repair_function_url is distinct from p_repair_function_url
     or v_email_function_url is distinct from p_email_function_url then
    return false;
  end if;

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
       where jobname = 'payments-repair-layer-b'
         and active
         and schedule = '*/10 * * * *'
         and command = 'select public.scheduled_repair_call();'
    )
    and exists (
      select 1 from cron.job
       where jobname = 'payments-recon-layer-c'
         and active
         and schedule = '0 3 * * *'
         and command = 'select public.scheduled_reconciliation_call();'
    )
    and exists (
      select 1 from cron.job
       where jobname = 'order-email-outbox'
         and active
         and schedule = '* * * * *'
         and command = 'select public.scheduled_order_email_call();'
    )
    and exists (
      select 1 from public.scheduled_job_health
       where job_name = 'repair'
         and current_run_id is null
         and last_succeeded_at >= clock_timestamp() - interval '20 minutes'
         and last_succeeded_at >= last_started_at
         and (last_failed_at is null or last_succeeded_at >= last_failed_at)
    )
    and exists (
      select 1 from public.scheduled_job_health
       where job_name = 'reconcile'
         and current_run_id is null
         and last_succeeded_at >= clock_timestamp() - interval '36 hours'
         and last_succeeded_at >= last_started_at
         and (last_failed_at is null or last_succeeded_at >= last_failed_at)
    )
    and exists (
      select 1 from public.scheduled_job_health
       where job_name = 'email'
         and current_run_id is null
         and last_succeeded_at >= clock_timestamp() - interval '5 minutes'
         and last_succeeded_at >= last_started_at
         and (last_failed_at is null or last_succeeded_at >= last_failed_at)
    );
end;
$$;

revoke all on function public.is_paid_launch_scheduler_ready(text,text,text) from public;
revoke all on function public.is_paid_launch_scheduler_ready(text,text,text) from anon;
revoke all on function public.is_paid_launch_scheduler_ready(text,text,text) from authenticated;
grant execute on function public.is_paid_launch_scheduler_ready(text,text,text) to service_role;
