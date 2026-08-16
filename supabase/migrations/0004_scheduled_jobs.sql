-- 0004_scheduled_jobs.sql
-- pg_cron + pg_net scheduled jobs for Layer B (repair) and Layer C (daily
-- reconciliation) — decision-record §3.5 "Durable retry / reconciliation" and §6.
--
-- Layer B (repair loop): scans `verification_pending` / stale `pending` payments
-- and re-runs QueryTradeInfo via the repair-reconcile Edge Function (idempotent).
-- Layer C (financial reconciliation): parses a FundingReconDetail CSV and marks
-- `payments.reconciliation_status`. Both layers live in ONE function
-- (`POST /functions/v1/repair-reconcile`); two schedules invoke it at different
-- cadences (repair every 10 min, reconciliation daily at 03:00).
--
-- PREREQUISITES (environment dependencies, not code defects):
--  1. pg_cron and pg_net must be ENABLED in the Supabase project (dashboard →
--     Database → Extensions, or via `supabase db` tooling). `create extension
--     if not exists` is idempotent but fails if an extension is unavailable.
--  2. The Edge Function URL is project config: seed
--     `public.scheduled_job_config` (service_role only) with the deployed URL
--     (`https://<project-ref>.supabase.co/functions/v1/repair-reconcile`).
--  3. The scheduled-job secret is project config: create a Supabase Vault secret
--     named `scheduled_job_secret` holding the SAME value as the Edge Function
--     env `SCHEDULED_JOB_SECRET`. The job reads it from the Vault at runtime —
--     the secret VALUE is never committed in this file. Until the URL + secret
--     are configured the jobs log and skip (no crash).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 1. Server-only scheduled-job config (function URL + vault secret name)
-- ---------------------------------------------------------------------------
create table if not exists public.scheduled_job_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table public.scheduled_job_config is
  'Server-only config for the pg_cron scheduled-job caller of the repair-reconcile Edge Function (decision-record §6). Holds the function URL + the Vault secret NAME, never the secret value.';

alter table public.scheduled_job_config enable row level security;
revoke all on public.scheduled_job_config from public;
revoke all on public.scheduled_job_config from anon;
revoke all on public.scheduled_job_config from authenticated;
grant select on public.scheduled_job_config to service_role;

insert into public.scheduled_job_config (key, value) values
  ('repair_reconcile_function_url', 'https://<project-ref>.supabase.co/functions/v1/repair-reconcile'),
  ('scheduled_job_secret_vault_name', 'scheduled_job_secret')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Helper that calls the repair-reconcile function via pg_net with the
--    scheduled-job secret header (resolved from the Vault at RUNTIME).
-- ---------------------------------------------------------------------------
create or replace function public.scheduled_repair_call()
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
    where key = 'repair_reconcile_function_url';
  select value into secret_name from public.scheduled_job_config
    where key = 'scheduled_job_secret_vault_name';

  if function_url is null or function_url like 'https://<project-ref>%' then
    raise notice 'scheduled_repair_call: repair_reconcile_function_url is not configured; skipping.';
    return;
  end if;

  begin
    select decrypted_secret into job_secret
      from vault.decrypted_secrets
      where name = coalesce(secret_name, 'scheduled_job_secret')
      limit 1;
  exception when undefined_table or insufficient_privilege then
    raise notice 'scheduled_repair_call: vault is unavailable; skipping (enable the vault and create the secret).';
    return;
  end;

  if job_secret is null then
    raise notice 'scheduled_repair_call: vault secret "%" is not set; skipping.', secret_name;
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

-- SECURITY DEFINER function that reads a Vault secret and triggers the privileged
-- repair-reconcile endpoint: it must NEVER be callable by a client role. Revoke
-- EXECUTE from public/anon/authenticated explicitly (Supabase default privileges
-- would otherwise grant it). pg_cron runs the job as the postgres superuser
-- (bypasses ACL); service_role retains EXECUTE via Supabase default privileges for
-- any server-side use.
revoke all on function public.scheduled_repair_call() from public;
revoke all on function public.scheduled_repair_call() from anon;
revoke all on function public.scheduled_repair_call() from authenticated;
grant execute on function public.scheduled_repair_call() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Idempotent scheduling (check existing jobs before scheduling)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'payments-repair-layer-b') then
    perform cron.schedule(
      'payments-repair-layer-b',
      '*/10 * * * *',
      'select public.scheduled_repair_call();'
    );
  end if;

  if not exists (select 1 from cron.job where jobname = 'payments-recon-layer-c') then
    perform cron.schedule(
      'payments-recon-layer-c',
      '0 3 * * *',
      'select public.scheduled_repair_call();'
    );
  end if;
end;
$$;
