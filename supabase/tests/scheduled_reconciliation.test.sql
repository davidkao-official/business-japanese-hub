begin;

select plan(6);

select has_function('public', 'scheduled_job_call', array['text'],
  'shared scheduled caller accepts an explicit mode');
select has_function('public', 'scheduled_reconciliation_call', array[]::text[],
  'daily financial reconciliation wrapper exists');
select ok(
  not has_function_privilege('anon', 'public.scheduled_job_call(text)', 'execute'),
  'anon cannot invoke the scheduled caller'
);
select ok(
  not has_function_privilege('authenticated', 'public.scheduled_reconciliation_call()', 'execute'),
  'authenticated users cannot invoke daily reconciliation'
);
select is(
  (select command from cron.job where jobname = 'payments-repair-layer-b'),
  'select public.scheduled_repair_call();'::text,
  'ten-minute cron remains repair-only'
);
select is(
  (select command from cron.job where jobname = 'payments-recon-layer-c'),
  'select public.scheduled_reconciliation_call();'::text,
  'daily cron invokes financial reconciliation mode'
);

select * from finish();
rollback;
