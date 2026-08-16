/**
 * Contract tests for supabase/migrations/0006_paypal.sql — the additive
 * PayPal/USD adapter migration (#21).
 *
 * These parse the migration text and assert the intent: the `payments.provider`
 * CHECK is widened from the single approved adapter (`ecpay`) to also accept
 * `paypal`, and the migration is purely additive (no column drops / data
 * changes). They do not execute SQL; real enforcement is verified against a
 * deployed Supabase instance (see docs/payments/implementation-contract.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0006_paypal.sql'), 'utf8');

describe('migration 0006_paypal — provider widening', () => {
  it('widens the payments.provider CHECK to accept both ecpay and paypal', () => {
    expect(sql).toMatch(/check \(provider in \('ecpay', 'paypal'\)\)/);
  });

  it('keeps the drop/add constraint shape (idempotent, additive)', () => {
    expect(sql).toContain('drop constraint if exists payments_provider_check');
    expect(sql).toContain('add constraint payments_provider_check');
  });

  it('is purely additive — no destructive operations', () => {
    expect(sql).not.toMatch(/drop\s+(column|table)/i);
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).not.toMatch(/truncate/i);
  });
});
