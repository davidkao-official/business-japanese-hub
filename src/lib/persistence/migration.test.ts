/**
 * Contract tests for the authorization rules in supabase/migrations/0001_accounts.sql.
 *
 * These parse the migration text and assert the RLS *intent*: the exact policy
 * matrix issue #7 mandates — specifically that `book_entitlement` is
 * select-only for the owning user (no client insert/update/delete ⇒ no
 * self-grant), while reading_state/bookmark are user-writable. They do not
 * execute SQL; real enforcement is verified against a deployed Supabase
 * instance (see docs/accounts-and-entitlement.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from the project root (`pnpm test`); resolve the migration via
// cwd rather than import.meta.url, which vitest does not keep as a file URL.
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0001_accounts.sql'), 'utf8');

/** Policy command verbs (`all|select|insert|update|delete`) declared for a table. */
function policyCommandsFor(table: string): string[] {
  const commands: string[] = [];
  const re = new RegExp(`on public\\.${table}\\s+for (all|select|insert|update|delete)`, 'g');
  for (const match of sql.matchAll(re)) {
    commands.push(match[1]);
  }
  return commands;
}

describe('migration 0001_accounts — RLS policy matrix', () => {
  it('enables row level security on every user-state table', () => {
    for (const table of ['book_entitlement', 'reading_state', 'bookmark']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('book_entitlement is select-only: a client can never self-grant', () => {
    expect(policyCommandsFor('book_entitlement')).toEqual(['select']);
  });

  it('book_entitlement select policy is scoped to the owning user', () => {
    expect(sql).toMatch(
      /for select to authenticated\s+using \(auth\.uid\(\) = user_id\)/,
    );
  });

  it('reading_state and bookmark allow the owning user full access (with check)', () => {
    for (const table of ['reading_state', 'bookmark']) {
      expect(policyCommandsFor(table)).toEqual(['all']);
      expect(sql).toMatch(
        new RegExp(
          `on public\\.${table}\\s+for all to authenticated\\s+using \\(auth\\.uid\\(\\) = user_id\\)\\s+with check \\(auth\\.uid\\(\\) = user_id\\)`,
        ),
      );
    }
  });

  it('the grant write point is not callable from any client role', () => {
    // The function exists, but EXECUTE is revoked from public, anon, AND
    // authenticated (Supabase default privileges grant EXECUTE to anon/
    // authenticated for new functions — each must be explicitly revoked), and is
    // granted only to service_role (operator / ECPay server callback verification).
    const fn = 'function public.grant_entitlement(uuid, text, text, text)';
    expect(sql).toContain('function public.grant_entitlement');
    expect(sql).toContain(`revoke all on ${fn} from public`);
    expect(sql).toContain(`revoke all on ${fn} from anon`);
    expect(sql).toContain(`revoke all on ${fn} from authenticated`);
    expect(sql).toContain(`grant execute on ${fn} to service_role`);
  });

  it('keys user-state rows on stable content-model ids', () => {
    expect(sql).toContain('book_id      text not null');
    expect(sql).toContain('chapter_id text not null');
    expect(sql).toContain('block_id   text');
  });
});
