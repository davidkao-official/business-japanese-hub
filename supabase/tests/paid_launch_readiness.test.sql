begin;

select plan(22);

select has_table('public', 'scheduled_job_health',
  'scheduled worker health is stored durably');

select has_function(
  'public', 'is_paid_launch_scheduler_ready', array['text','text','text'],
  'paid-launch checkout scheduler readiness RPC exists'
);
select has_function(
  'public', 'record_scheduled_job_started', array['text'],
  'scheduled workers can record an authenticated start heartbeat'
);
select has_function(
  'public', 'record_scheduled_job_result', array['text','uuid','boolean','text'],
  'scheduled workers can record a durable outcome heartbeat'
);
select ok(
  not has_function_privilege('anon', 'public.is_paid_launch_scheduler_ready(text,text,text)', 'execute'),
  'anon cannot inspect scheduler readiness'
);
select ok(
  not has_function_privilege('authenticated', 'public.is_paid_launch_scheduler_ready(text,text,text)', 'execute'),
  'authenticated users cannot inspect scheduler readiness'
);
select ok(
  has_function_privilege('service_role', 'public.is_paid_launch_scheduler_ready(text,text,text)', 'execute'),
  'service_role can inspect scheduler readiness'
);
select ok(
  not has_function_privilege('anon', 'public.record_scheduled_job_started(text)', 'execute'),
  'anon cannot forge a worker start heartbeat'
);
select ok(
  has_function_privilege('service_role', 'public.record_scheduled_job_result(text,uuid,boolean,text)', 'execute'),
  'service_role can record a worker result heartbeat'
);

update public.scheduled_job_config
   set value = 'https://test.supabase.co/functions/v1/repair-reconcile'
 where key = 'repair_reconcile_function_url';
update public.scheduled_job_config
   set value = 'https://test.supabase.co/functions/v1/order-email'
 where key = 'order_email_function_url';
do $$ begin
  perform vault.create_secret('test-scheduled-secret', 'scheduled_job_secret');
end $$;
create temporary table job_run_tokens (
  token_name text primary key,
  run_id uuid not null
) on commit drop;

select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'configured cron jobs are not ready before each deployed worker succeeds'
);
insert into job_run_tokens values ('repair', public.record_scheduled_job_started('repair'));
select public.record_scheduled_job_result('repair', (select run_id from job_run_tokens where token_name = 'repair'), true, null);
insert into job_run_tokens values ('reconcile', public.record_scheduled_job_started('reconcile'));
select public.record_scheduled_job_result('reconcile', (select run_id from job_run_tokens where token_name = 'reconcile'), true, null);
insert into job_run_tokens values ('email', public.record_scheduled_job_started('email'));
select public.record_scheduled_job_result('email', (select run_id from job_run_tokens where token_name = 'email'), true, null);
select ok(
  public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'fresh successful worker heartbeats open checkout readiness'
);
select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://wrong.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'readiness rejects a mismatched repair URL'
);
select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://wrong.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'readiness rejects a mismatched email URL'
);
select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    repeat('0', 64)
  ),
  'readiness rejects a mismatched scheduled-job secret'
);
select is(
  public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    null
  ),
  false,
  'readiness returns false, never null, for a null scheduled-job secret digest'
);

insert into job_run_tokens values ('repair-older', public.record_scheduled_job_started('repair'));
insert into job_run_tokens values ('repair-newer', public.record_scheduled_job_started('repair'));
select is(
  public.record_scheduled_job_result(
    'repair', (select run_id from job_run_tokens where token_name = 'repair-older'), true, null
  ),
  false,
  'an older overlapping success cannot complete the newer repair run'
);
select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'checkout closes while a newer repair run has no durable result'
);
select is(
  public.record_scheduled_job_result(
    'repair', (select run_id from job_run_tokens where token_name = 'repair-newer'), false, 'injected_failure'
  ),
  true,
  'only the current overlapping run can record its failure'
);
select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'checkout stays closed after the latest repair run fails'
);
insert into job_run_tokens values ('repair-recovery', public.record_scheduled_job_started('repair'));
select public.record_scheduled_job_result('repair', (select run_id from job_run_tokens where token_name = 'repair-recovery'), true, null);
select ok(
  public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'a later successful repair run restores readiness'
);

update public.scheduled_job_health
   set last_started_at = now() - interval '10 minutes',
       last_succeeded_at = now() - interval '10 minutes'
 where job_name = 'email';
select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'checkout closes when the every-minute email worker heartbeat becomes stale'
);
insert into job_run_tokens values ('email-recovery', public.record_scheduled_job_started('email'));
select public.record_scheduled_job_result('email', (select run_id from job_run_tokens where token_name = 'email-recovery'), true, null);

do $$ begin
  perform cron.unschedule('payments-recon-layer-c');
end $$;
select ok(
  not public.is_paid_launch_scheduler_ready(
    'https://test.supabase.co/functions/v1/repair-reconcile',
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'checkout stays closed when daily reconciliation is absent'
);

select * from finish();
rollback;
