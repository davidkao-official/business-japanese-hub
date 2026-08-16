/**
 * Contract tests for supabase/migrations/0004_scheduled_jobs.sql — pg_cron/pg_net
 * scheduled jobs for repair (Layer B) + reconciliation (Layer C).
 *
 * The critical security property: `scheduled_repair_call()` is SECURITY DEFINER,
 * reads a Vault secret, and triggers the privileged repair-reconcile Edge
 * Function — it must NEVER be callable by a client role. Supabase default
 * privileges grant EXECUTE to anon/authenticated for new functions, so the
 * migration must explicitly revoke public/anon/authenticated and keep EXECUTE
 * only on the server boundary (service_role; pg_cron runs as postgres superuser
 * which bypasses ACL). These tests parse the SQL text and assert that intent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0004_scheduled_jobs.sql'), 'utf8');

const FN = 'public.scheduled_repair_call()';

describe('migration 0004_scheduled_jobs — scheduled-repair SECURITY DEFINER boundary', () => {
  it('defines the repair call as SECURITY DEFINER with a locked search_path', () => {
    expect(sql).toMatch(
      /create or replace function public\.scheduled_repair_call\(\)[\s\S]*?security definer[\s\S]*?set search_path = public/,
    );
  });

  it('never exposes the secret value in the migration', () => {
    expect(sql).not.toMatch(/scheduled_job_secret\s*=\s*['"][^'"]+['"]/);
  });

  it('closes EXECUTE to EVERY client role (public, anon, authenticated)', () => {
    expect(sql).toContain(`revoke all on function ${FN} from public`);
    expect(sql).toContain(`revoke all on function ${FN} from anon`);
    expect(sql).toContain(`revoke all on function ${FN} from authenticated`);
  });

  it('keeps EXECUTE only on the server boundary (service_role)', () => {
    expect(sql).toContain(`grant execute on function ${FN} to service_role`);
  });

  it('schedules the Layer B and Layer C jobs idempotently', () => {
    expect(sql).toMatch(/cron\.schedule\(/);
    expect(sql).toContain('payments-repair-layer-b');
    expect(sql).toContain('payments-recon-layer-c');
  });
});
