-- 20261107090000_plus_period_reconcile_schedule.sql
-- Hourly pg_cron schedule for the Plus period-charge read-back Edge Function
-- (`POST /functions/v1/plus-period-reconcile`, verify_jwt=false). The function is
-- authorized only by the shared scheduled-job secret header, resolved from the
-- Vault at runtime; the secret VALUE is never committed in this file.
--
-- PREREQUISITE (project config, not code): seed
-- `plus_period_reconcile_function_url` in `public.scheduled_job_config` with the
-- deployed URL during backend deploy. Until it (and the Vault secret
-- `scheduled_job_secret`) are configured, the job logs and skips (no crash).

insert into public.scheduled_job_config (key, value)
values (
  'plus_period_reconcile_function_url',
  'https://<project-ref>.supabase.co/functions/v1/plus-period-reconcile'
)
on conflict (key) do nothing;

create or replace function public.scheduled_plus_period_reconcile_call()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  function_url text;
  secret_name  text;
  job_secret   text;
begin
  select value into function_url from public.scheduled_job_config
    where key = 'plus_period_reconcile_function_url';
  select value into secret_name from public.scheduled_job_config
    where key = 'scheduled_job_secret_vault_name';

  if function_url is null or function_url like 'https://<project-ref>%' then
    raise notice 'scheduled_plus_period_reconcile_call: plus_period_reconcile_function_url is not configured; skipping.';
    return;
  end if;

  begin
    select decrypted_secret into job_secret
      from vault.decrypted_secrets
      where name = coalesce(secret_name, 'scheduled_job_secret')
      limit 1;
  exception when undefined_table or insufficient_privilege then
    raise notice 'scheduled_plus_period_reconcile_call: vault is unavailable; skipping.';
    return;
  end;

  if job_secret is null then
    raise notice 'scheduled_plus_period_reconcile_call: vault secret "%" is not set; skipping.', secret_name;
    return;
  end if;

  perform net.http_post(
    url     := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Scheduled-Job-Secret', job_secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- SECURITY DEFINER function that reads a Vault secret and triggers the secret-
-- protected endpoint: it must NEVER be callable by a client role. pg_cron runs
-- the job as the postgres superuser (bypasses ACL); service_role retains EXECUTE
-- via Supabase default privileges for any server-side use.
revoke all on function public.scheduled_plus_period_reconcile_call() from public;
revoke all on function public.scheduled_plus_period_reconcile_call() from anon;
revoke all on function public.scheduled_plus_period_reconcile_call() from authenticated;
grant execute on function public.scheduled_plus_period_reconcile_call() to service_role;

-- Idempotent scheduling (check the existing job before scheduling).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'plus-period-reconcile') then
    perform cron.schedule(
      'plus-period-reconcile',
      '17 * * * *',
      'select public.scheduled_plus_period_reconcile_call();'
    );
  end if;
end;
$$;
