/**
 * Reader chrome visibility — content-first, tools on intent (research §4.4).
 *
 * On mobile the navigation bar is hidden by default and appears when the user
 * scrolls up, taps the peek handle, or otherwise interacts. On desktop the
 * chrome stays visible (focused reading with strong navigation). `toggle` is
 * the explicit-interaction escape hatch for the peek handle.
 */

import { useCallback, useEffect, useState } from 'react'

export interface ChromeVisibility {
  visible: boolean
  reveal: () => void
  hide: () => void
  toggle: () => void
}

export function useChromeVisibility(isDesktop: boolean): ChromeVisibility {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (isDesktop) return
    let lastY = window.scrollY
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY
        const diff = y - lastY
        if (y < 16) setVisible(true)
        else if (Math.abs(diff) > 6) setVisible(diff < 0)
        lastY = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [isDesktop])

  const reveal = useCallback(() => setVisible(true), [])
  const hide = useCallback(() => setVisible(false), [])
  const toggle = useCallback(() => setVisible((current) => !current), [])

  const effectiveVisible = isDesktop || visible

  return { visible: effectiveVisible, reveal, hide, toggle }
}
