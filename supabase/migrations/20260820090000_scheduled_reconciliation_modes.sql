-- Split the shared repair/reconcile Edge Function into explicit cron modes.
-- The 10-minute job runs provider confirmation/refund recovery only; the daily
-- job runs financial reporting (ECPay CSV and PayPal Transaction Search).

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
begin
  if p_mode not in ('repair', 'reconcile') then
    raise exception 'invalid scheduled job mode: %', p_mode;
  end if;

  select value into function_url from public.scheduled_job_config
    where key = 'repair_reconcile_function_url';
  select value into secret_name from public.scheduled_job_config
    where key = 'scheduled_job_secret_vault_name';

  if function_url is null or function_url like 'https://<project-ref>%' then
    raise notice 'scheduled_job_call: repair_reconcile_function_url is not configured; skipping.';
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

create or replace function public.scheduled_repair_call()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.scheduled_job_call('repair');
end;
$$;

create or replace function public.scheduled_reconciliation_call()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.scheduled_job_call('reconcile');
end;
$$;

revoke all on function public.scheduled_job_call(text) from public;
revoke all on function public.scheduled_job_call(text) from anon;
revoke all on function public.scheduled_job_call(text) from authenticated;
grant execute on function public.scheduled_job_call(text) to service_role;

revoke all on function public.scheduled_reconciliation_call() from public;
revoke all on function public.scheduled_reconciliation_call() from anon;
revoke all on function public.scheduled_reconciliation_call() from authenticated;
grant execute on function public.scheduled_reconciliation_call() to service_role;

do $$
declare
  reconciliation_job_id bigint;
begin
  select jobid into reconciliation_job_id
    from cron.job
   where jobname = 'payments-recon-layer-c';
  if reconciliation_job_id is not null then
    perform cron.alter_job(
      reconciliation_job_id,
      command := 'select public.scheduled_reconciliation_call();'
    );
  end if;
end;
$$;
