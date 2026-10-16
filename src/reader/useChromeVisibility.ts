/**
 * Reader chrome visibility — content-first, tools on intent (research §4.4).
 *
 * On mobile the navigation bar is hidden by default and appears when the user
 * scrolls up, taps the peek handle, or otherwise interacts. On desktop the
 * chrome stays visible (focused reading with strong navigation). `toggle` is
 * the explicit-interaction escape hatch for the peek handle. Scroll-down does
 * not hide chrome while a topbar descendant has keyboard-visible focus.
 */

import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'

export interface ChromeVisibility {
  visible: boolean
  reveal: () => void
  hide: () => void
  toggle: () => void
}

function hasKeyboardVisibleFocus(topbar: HTMLElement | null | undefined): boolean {
  const activeElement = document.activeElement
  if (!activeElement || !topbar?.contains(activeElement)) return false
  try {
    return activeElement.matches(':focus-visible')
  } catch {
    return false
  }
}

export function useChromeVisibility(
  isDesktop: boolean,
  topbarRef?: RefObject<HTMLElement | null>,
): ChromeVisibility {
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
        else if (
          Math.abs(diff) > 6 &&
          (diff < 0 || !hasKeyboardVisibleFocus(topbarRef?.current))
        ) setVisible(diff < 0)
        lastY = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [isDesktop, topbarRef])

  const reveal = useCallback(() => setVisible(true), [])
  const hide = useCallback(() => setVisible(false), [])
  const toggle = useCallback(() => setVisible((current) => !current), [])

  const effectiveVisible = isDesktop || visible

  return { visible: effectiveVisible, reveal, hide, toggle }
}
