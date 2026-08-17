import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  APPEARANCE_STORAGE_KEY,
  readStoredPreference,
  resolveEffectiveTheme,
  subscribeSystemTheme,
  systemPrefersDark,
  writeStoredPreference,
} from './appearance'
import type { AppearancePreference, EffectiveTheme } from './appearance'

export interface AppearanceContextValue {
  /** The user's saved preference (`system` is the default). */
  preference: AppearancePreference
  /** The rendered theme after resolving `system` against the OS. */
  effectiveTheme: EffectiveTheme
  setPreference: (preference: AppearancePreference) => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

/**
 * Apply the effective theme to `<html data-theme>` and mirror the effective
 * `--color-bg` onto the injected theme-color metas, so the mobile browser
 * chrome follows the *effective* theme rather than only the OS scheme. When the
 * computed token is unavailable (e.g. non-CSS test environments) the metas are
 * left untouched — the CSS cascade still themes the document.
 */
function applyEffectiveTheme(effective: EffectiveTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = effective
  const computedBg = getComputedStyle(root).getPropertyValue('--color-bg').trim()
  if (!computedBg) return
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', computedBg)
  })
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<AppearancePreference>(() =>
    readStoredPreference(),
  )
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() =>
    resolveEffectiveTheme(readStoredPreference(), systemPrefersDark()),
  )

  // Keep <html data-theme> aligned with the effective theme (initial paint and
  // every change), and mirror the browser-chrome color.
  useEffect(() => {
    applyEffectiveTheme(effectiveTheme)
  }, [effectiveTheme])

  // In System mode, follow OS theme changes live without a reload.
  useEffect(() => {
    if (preference !== 'system') return
    const applyOs = () => setEffectiveTheme(systemPrefersDark() ? 'dark' : 'light')
    applyOs()
    return subscribeSystemTheme(applyOs)
  }, [preference])

  // Cross-tab sync: reconcile when another tab writes/clears the preference.
  // Same-tab changes update context state directly in `setPreference`; we never
  // re-read storage after our own write, because a failed write would otherwise
  // let the read fall back to `system` and silently undo the in-memory choice.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reconcile = () => {
      const stored = readStoredPreference()
      setPreferenceState(stored)
      setEffectiveTheme(resolveEffectiveTheme(stored, systemPrefersDark()))
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) reconcile()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setPreference = useCallback((next: AppearancePreference) => {
    setPreferenceState(next)
    setEffectiveTheme(resolveEffectiveTheme(next, systemPrefersDark()))
    writeStoredPreference(next)
  }, [])

  const value = useMemo(
    () => ({ preference, effectiveTheme, setPreference }),
    [preference, effectiveTheme, setPreference],
  )

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext)
  if (!context) {
    throw new Error('useAppearance must be used within <AppearanceProvider>')
  }
  return context
}
