import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260822171000_paid_launch_scheduler_readiness.sql'),
  'utf8',
);

describe('paid launch scheduler readiness migration', () => {
  it('requires exact repair and email function URLs plus the Vault secret hash', () => {
    expect(sql).toMatch(/create or replace function public\.is_paid_launch_scheduler_ready\(/);
    expect(sql).toContain("where key = 'repair_reconcile_function_url'");
    expect(sql).toContain("where key = 'order_email_function_url'");
    expect(sql).toContain("encode(extensions.digest(v_job_secret, 'sha256'), 'hex') = p_secret_sha256");
    expect(sql).toMatch(/p_secret_sha256 is null[\s\S]*?p_secret_sha256 !~ '\^\[0-9a-f\]\{64\}\$'/);
  });

  it('requires fresh durable success heartbeats from every deployed worker', () => {
    expect(sql).toContain('create table public.scheduled_job_health')
    expect(sql).toContain('record_scheduled_job_started')
    expect(sql).toContain('record_scheduled_job_result')
    expect(sql).toContain('current_run_id uuid')
    expect(sql).toContain('and current_run_id = p_run_id')
    expect(sql).toContain("job_name = 'repair'")
    expect(sql).toContain("job_name = 'reconcile'")
    expect(sql).toContain("job_name = 'email'")
    expect(sql).toContain("interval '20 minutes'")
    expect(sql).toContain("interval '36 hours'")
    expect(sql).toContain("interval '5 minutes'")
  });

  it.each([
    ['payments-repair-layer-b', '*/10 * * * *', 'select public.scheduled_repair_call();'],
    ['payments-recon-layer-c', '0 3 * * *', 'select public.scheduled_reconciliation_call();'],
    ['order-email-outbox', '* * * * *', 'select public.scheduled_order_email_call();'],
  ])('requires the active %s job with its exact schedule and command', (job, schedule, command) => {
    expect(sql).toContain(`jobname = '${job}'`);
    expect(sql).toContain(`schedule = '${schedule}'`);
    expect(sql).toContain(`command = '${command}'`);
  });

  it('keeps readiness inspection service-role-only', () => {
    const fn = 'public.is_paid_launch_scheduler_ready(text,text,text)';
    expect(sql).toContain(`revoke all on function ${fn} from public`);
    expect(sql).toContain(`revoke all on function ${fn} from anon`);
    expect(sql).toContain(`revoke all on function ${fn} from authenticated`);
    expect(sql).toContain(`grant execute on function ${fn} to service_role`);
  });
});
