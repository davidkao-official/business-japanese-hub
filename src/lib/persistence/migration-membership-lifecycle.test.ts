import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260922100000_plus_membership_lifecycle.sql'),
  'utf8',
);

describe('#164 membership lifecycle migration', () => {
  it('seeds the approved monthly plans without date-based repricing', () => {
    expect(sql).toContain("'plus_early_access_monthly', 'TWD', 29900, 'month', true");
    expect(sql).toContain("'plus_standard_monthly', 'TWD', 39900, 'month', false");
    expect(sql).not.toMatch(/current_date|now\(\).*39900|39900.*now\(\)/i);
  });

  it('audits every lifecycle event and constrains the event vocabulary', () => {
    expect(sql).toContain('create table public.plus_membership_event');
    for (const event of [
      'membership_started', 'membership_renewed', 'membership_payment_failed',
      'membership_canceled', 'membership_reactivated', 'membership_expired',
      'membership_revoked', 'membership_refunded', 'membership_reversed',
      'membership_disputed', 'membership_restored',
    ]) expect(sql).toContain(`'${event}'`);
    expect(sql).toContain('event_id text primary key');
    expect(sql).toContain('source_system text not null');
    expect(sql).toContain('source_customer_id text not null');
    expect(sql).toContain('source_subscription_id text not null');
    expect(sql).toContain('unique (source_system, source_event_id)');
    expect(sql).toContain('membership_status text not null');
    expect(sql).not.toContain('p_membership_status');
  });

  it('makes replay and stale ordering behavior part of the server writer', () => {
    expect(sql).toContain('on conflict (source_system, source_event_id) do nothing');
    expect(sql).toContain("return 'replayed'");
    expect(sql).toContain("return 'stale'");
    expect(sql).toContain('v_event.occurred_at, v_event.event_id');
    expect(sql).toContain('on conflict (user_id) do update');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('before looking for state');
    expect(sql).toContain("when 'membership_started' then 'active'");
    expect(sql).toContain("when 'membership_refunded' then 'revoked'");
    expect(sql).toContain("when 'membership_canceled' then case when p_cancel_at_period_end then 'active' else 'canceled' end");
    expect(sql).toContain('source_subscription_id <> v_state.source_subscription_id');
    expect(sql).toContain('membership source event identity conflict');
  });

  it('keeps all lifecycle writes server-only and projects the #139 seam', () => {
    for (const table of ['plus_membership_plan', 'plus_membership_event', 'plus_membership_state']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from public, anon, authenticated`);
    }
    expect(sql).toContain('insert into public.plus_membership_access');
    expect(sql).toContain('revoke insert, update, delete on public.plus_membership_access from service_role');
    expect(sql).toContain('grant select on public.plus_membership_access to service_role');
    expect(sql).toContain('grant execute on function public.record_plus_membership_event');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('user_id uuid not null,');
    expect(sql).toContain('source_customer_id text not null');
    const eventTable = sql.split('create table public.plus_membership_event')[1].split('comment on table public.plus_membership_event')[0];
    expect(eventTable).not.toMatch(/references auth\.users/i);
  });

  it('does not introduce provider-specific or Book commerce identifiers', () => {
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(sql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(sql).not.toMatch(/\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i);
  });
});
