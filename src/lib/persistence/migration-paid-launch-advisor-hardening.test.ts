import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260904073606_paid_launch_advisor_hardening.sql'),
  'utf8',
);

describe('paid launch advisor hardening migration', () => {
  it('fixes the trigger function search path without changing its write behavior', () => {
    expect(sql).toMatch(
      /create or replace function public\.set_updated_at\(\)[\s\S]*?set search_path = pg_catalog[\s\S]*?new\.updated_at = now\(\)/,
    );
  });

  it('preserves active-only entitlement reads while evaluating auth.uid once', () => {
    expect(sql).toContain('drop policy if exists "book_entitlement_own_select" on public.book_entitlement');
    expect(sql).toMatch(
      /create policy "book_entitlement_own_select" on public\.book_entitlement[\s\S]*?for select to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id and status = 'active'\)/,
    );
  });

  it.each(['reading_state', 'bookmark'])(
    'keeps %s user-writable with a single auth.uid evaluation in both policy clauses',
    (table) => {
      expect(sql).toContain(`drop policy if exists "${table}_own_all" on public.${table}`);
      expect(sql).toMatch(
        new RegExp(
          `create policy "${table}_own_all" on public\\.${table}[\\s\\S]*?for all to authenticated[\\s\\S]*?using \\(+\\(select auth\\.uid\\(\\)\\) = user_id\\)+[\\s\\S]*?with check \\(+\\(select auth\\.uid\\(\\)\\) = user_id\\)+`,
        ),
      );
    },
  );
});
