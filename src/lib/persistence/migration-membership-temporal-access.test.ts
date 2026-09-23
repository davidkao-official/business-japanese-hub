import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260923110000_plus_membership_temporal_access_windows.sql',
  ),
  'utf8',
)

const resolver = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/membership.ts'),
  'utf8',
)

describe('#165 temporal membership authorization sidecar', () => {
  it('materializes bounded per-stream paid windows without changing immutable events', () => {
    expect(migration).toContain('create table public.plus_membership_access_window')
    expect(migration).toContain('grant_event_id text not null references public.plus_membership_event(event_id)')
    expect(migration).toContain('check (access_end > access_start)')
    expect(migration).toContain('create trigger plus_membership_event_refresh_access_windows')
    expect(migration).toContain('after insert on public.plus_membership_event')
    expect(migration).toContain('delete from public.plus_membership_access_window')
    expect(migration).toContain("event_type = 'membership_started'")
    expect(migration).toContain('and reducer_version = 1')
    expect(migration).toContain("v_event.event_type = 'membership_payment_failed'")
    expect(migration).toContain('set access_end = v_event.occurred_at')
    expect(migration).toContain("'membership_renewed',")
    expect(migration).toContain("'membership_reactivated',")
    expect(migration).toContain("'membership_restored'")
    expect(migration).not.toMatch(/update\s+public\.plus_membership_event/i)
    expect(migration).not.toMatch(/delete\s+from\s+public\.plus_membership_event/i)
  })

  it('makes database time and the newest already-effective qualified stream the read authority', () => {
    expect(migration).toContain('v_now timestamptz := statement_timestamp()')
    expect(migration).toContain('effective_start <= v_now')
    expect(migration).toContain('order by start_occurred_at desc, start_event_id desc')
    expect(migration).toContain('window.access_start <= v_now')
    expect(migration).toContain('v_now < window.access_end')
    expect(migration).toContain("jsonb_build_object('access', 'active')")
    expect(migration).toContain("jsonb_build_object('access', 'non-member')")
    expect(migration).toContain('grant execute on function public.resolve_plus_membership_access(uuid)')
    expect(migration).toContain('to service_role')
    expect(migration).toContain('revoke all on function public.resolve_plus_membership_access(uuid)')
  })

  it('keeps browsers away from both windows and internal rebuild authority', () => {
    expect(migration).toContain(
      'revoke all on public.plus_membership_access_window from public, anon, authenticated',
    )
    expect(migration).toContain(
      'revoke all on function public.rebuild_plus_membership_access_windows(text, text, text)',
    )
    expect(migration).toContain('from public, anon, authenticated, service_role')
  })

  it('moves the shared resolver from snapshot rows to the service-only temporal RPC', () => {
    expect(resolver).toContain("db.rpc('resolve_plus_membership_access', { p_user_id: userId })")
    expect(resolver).not.toContain(".from('plus_membership_access')")
    expect(resolver).not.toContain('Date.now')
    expect(resolver).toContain("if (access === 'active' || access === 'non-member') return access")
    expect(resolver).toContain("return 'unavailable'")
  })
})
