import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  isAppearancePreference,
  readStoredPreference,
  resolveEffectiveTheme,
  subscribeSystemTheme,
  systemPrefersDark,
  writeStoredPreference,
} from './appearance'

interface MediaQueryListLike {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

/** Install a controllable `(prefers-color-scheme: dark)` mock. */
function installMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const mql: MediaQueryListLike = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_event: string, cb: () => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_event: string, cb: () => void) => listeners.delete(cb)),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mql))
  return {
    mql,
    setMatches(next: boolean) {
      mql.matches = next
      for (const cb of listeners) cb()
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isAppearancePreference', () => {
  it('accepts the three canonical values', () => {
    expect(isAppearancePreference('system')).toBe(true)
    expect(isAppearancePreference('light')).toBe(true)
    expect(isAppearancePreference('dark')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isAppearancePreference('sepia')).toBe(false)
    expect(isAppearancePreference('')).toBe(false)
    expect(isAppearancePreference(null)).toBe(false)
    expect(isAppearancePreference(undefined)).toBe(false)
    expect(isAppearancePreference(1)).toBe(false)
  })
})

describe('resolveEffectiveTheme', () => {
  it('always resolves an explicit preference regardless of the OS', () => {
    expect(resolveEffectiveTheme('light', true)).toBe('light')
    expect(resolveEffectiveTheme('light', false)).toBe('light')
    expect(resolveEffectiveTheme('dark', true)).toBe('dark')
    expect(resolveEffectiveTheme('dark', false)).toBe('dark')
  })

  it('delegates system to the OS color scheme', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark')
    expect(resolveEffectiveTheme('system', false)).toBe('light')
  })
})

describe('systemPrefersDark', () => {
  it('returns false when matchMedia is unavailable', () => {
    expect(systemPrefersDark()).toBe(false)
  })

  it('reflects the OS color scheme when matchMedia exists', () => {
    installMatchMedia(true)
    expect(systemPrefersDark()).toBe(true)
    vi.unstubAllGlobals()
    installMatchMedia(false)
    expect(systemPrefersDark()).toBe(false)
  })
})

describe('readStoredPreference', () => {
  it('defaults to system with no saved value', () => {
    window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
    expect(readStoredPreference()).toBe('system')
  })

  it('returns a saved explicit preference', () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')
    expect(readStoredPreference()).toBe('dark')
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'light')
    expect(readStoredPreference()).toBe('light')
  })

  it('fails safe to system for an invalid persisted value', () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'neon')
    expect(readStoredPreference()).toBe('system')
  })

  it('fails safe to system when storage read throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied')
    })
    expect(readStoredPreference()).toBe('system')
  })
})

describe('writeStoredPreference', () => {
  it('persists the preference so it can be read back', () => {
    writeStoredPreference('dark')
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark')
    writeStoredPreference('system')
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('system')
  })

  it('does not throw when storage write is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => writeStoredPreference('light')).not.toThrow()
  })
})

describe('subscribeSystemTheme', () => {
  it('subscribes and unsubscribes the change listener', () => {
    const { mql } = installMatchMedia(false)
    const onChange = vi.fn()
    const unsubscribe = subscribeSystemTheme(onChange)
    expect(mql.addEventListener).toHaveBeenCalledWith('change', onChange)

    unsubscribe()
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', onChange)
  })

  it('returns a no-op unsubscribe when matchMedia is unavailable', () => {
    const unsubscribe = subscribeSystemTheme(() => {})
    expect(unsubscribe).not.toThrow()
  })
})
