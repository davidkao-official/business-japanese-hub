import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  readAppearancePreference,
  resolveEffectiveTheme,
  subscribeSystemTheme,
  systemPrefersDark,
  writeStoredPreference,
} from './appearance'
import type { AppearancePreference, AppearanceStorageNotice, EffectiveTheme } from './appearance'

export interface AppearanceContextValue {
  /** This tab's preference (`system` is the default), even if saving failed. */
  preference: AppearancePreference
  /** The rendered theme after resolving `system` against the OS. */
  effectiveTheme: EffectiveTheme
  storageNotice: AppearanceStorageNotice | null
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
  const [initialPreference] = useState(readAppearancePreference)
  const [preference, setPreferenceState] = useState(initialPreference.preference)
  const [storageNotice, setStorageNotice] = useState(initialPreference.notice)
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() =>
    resolveEffectiveTheme(initialPreference.preference, systemPrefersDark()),
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

  // Keep the current tab stable while reading, answering or editing (§5.5).
  // Other tabs can persist a choice for the next load; they must not change
  // this tab's appearance or undo a session choice after a failed write.

  const setPreference = useCallback((next: AppearancePreference) => {
    setPreferenceState(next)
    setEffectiveTheme(resolveEffectiveTheme(next, systemPrefersDark()))
    setStorageNotice(writeStoredPreference(next) ? null : 'writeFailed')
  }, [])

  const value = useMemo(
    () => ({ preference, effectiveTheme, storageNotice, setPreference }),
    [preference, effectiveTheme, storageNotice, setPreference],
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
