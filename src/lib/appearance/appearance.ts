/**
 * Appearance preference — application-wide System / Light / Dark theme (#42).
 *
 * Pure, framework-free logic shared by the React provider and the pre-paint
 * inline script in index.html. Every read/write of persisted state fails safe
 * to `system` and never throws, so restricted storage contexts (privacy mode,
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

/** Safe persisted-preference read; invalid/missing storage resolves to `system`. */
export function readStoredPreference(): AppearancePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return isAppearancePreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

/** Safe persisted-preference write; storage failure leaves the session default. */
export function writeStoredPreference(preference: AppearancePreference): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference)
  } catch {
    // Storage unavailable — the in-memory preference still applies this session.
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
