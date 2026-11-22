/**
 * Appearance preference — application-wide System / Light / Dark theme (#42).
 *
 * Pure, framework-free logic shared by the React provider and the pre-paint
 * inline script in index.html. Reads fail safe to `system`; writes report
 * failure without throwing, so restricted storage contexts (privacy mode,
 * iframe sandbox) cannot break rendering.
 */

export type AppearancePreference = 'system' | 'light' | 'dark'
export type EffectiveTheme = 'light' | 'dark'

export const APPEARANCE_STORAGE_KEY = 'business-japanese-hub.appearance'

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

export const APPEARANCE_PREFERENCES: readonly AppearancePreference[] = [
  'system',
  'light',
  'dark',
]

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** OS/browser color preference; false when matchMedia is unavailable. */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(SYSTEM_THEME_QUERY).matches
}

/** Effective rendered theme for a preference. `system` delegates to the OS. */
export function resolveEffectiveTheme(
  preference: AppearancePreference,
  prefersDark: boolean,
): EffectiveTheme {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

export type AppearanceStorageNotice = 'readFailed' | 'invalidStored' | 'writeFailed'

/** Missing storage is normal; unreadable or invalid storage needs a notice. */
export function readAppearancePreference(): {
  preference: AppearancePreference
  notice: AppearanceStorageNotice | null
} {
  if (typeof window === 'undefined') return { preference: 'system', notice: null }
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (raw === null) return { preference: 'system', notice: null }
    if (isAppearancePreference(raw)) return { preference: raw, notice: null }
    return { preference: 'system', notice: 'invalidStored' }
  } catch {
    return { preference: 'system', notice: 'readFailed' }
  }
}

/** Compatibility helper for consumers that only need the safe preference. */
export function readStoredPreference(): AppearancePreference {
  return readAppearancePreference().preference
}

/** A failed write must not undo the current tab's in-memory choice. */
export function writeStoredPreference(preference: AppearancePreference): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference)
    return true
  } catch {
    return false
  }
}

/** Subscribe to live OS theme changes. Returns an unsubscribe function. */
export function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mql = window.matchMedia(SYSTEM_THEME_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}
