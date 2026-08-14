/**
 * Reactive media query, built on `useSyncExternalStore` so it needs no
 * setState-in-effect and no cascading renders. Returns false when
 * `window.matchMedia` is unavailable (e.g. jsdom), keeping the mobile-first
 * default the safe path in tests.
 */

import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia?.(query)
      if (!mql) return () => {}
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia?.(query)?.matches ?? false, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
