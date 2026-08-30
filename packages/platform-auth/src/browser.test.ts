import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSupabaseClientFromEnv,
  type BrowserPlatformEnvironment,
} from './browser'

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const configuredEnvironment: BrowserPlatformEnvironment = {
  VITE_SUPABASE_URL: 'https://shared-project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-anon-key',
}

describe('shared browser platform client', () => {
  beforeEach(() => {
    createClient.mockClear()
  })

  it('fails closed when either public Supabase setting is absent', () => {
    expect(createSupabaseClientFromEnv('library', {})).toBeNull()
    expect(
      createSupabaseClientFromEnv('career-game', {
        VITE_SUPABASE_URL: configuredEnvironment.VITE_SUPABASE_URL,
      }),
    ).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('uses one backend namespace while distinguishing the two frontends diagnostically', () => {
    createSupabaseClientFromEnv('library', configuredEnvironment)
    createSupabaseClientFromEnv('career-game', configuredEnvironment)

    expect(createClient).toHaveBeenNthCalledWith(
      1,
      'https://shared-project.supabase.co',
      'public-anon-key',
      {
        global: {
          headers: { 'X-Client-Info': 'business-japanese-hub/library' },
        },
      },
    )
    expect(createClient).toHaveBeenNthCalledWith(
      2,
      'https://shared-project.supabase.co',
      'public-anon-key',
      {
        global: {
          headers: { 'X-Client-Info': 'business-japanese-hub/career-game' },
        },
      },
    )
  })
})
