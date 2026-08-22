import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260822174000_payment_event_outcomes.sql'),
  'utf8',
);

describe('payment event outcomes migration', () => {
  it('stages live-table checks before validation to avoid a table-scan write lock', () => {
    expect(sql).toMatch(/add constraint payment_events_processing_result_check[\s\S]*?not valid/);
    expect(sql).toMatch(/add constraint payment_events_processing_completion_check[\s\S]*?not valid/);
    expect(sql).toContain('validate constraint payment_events_processing_result_check');
    expect(sql).toContain('validate constraint payment_events_processing_completion_check');
  });
});
