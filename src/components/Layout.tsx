import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { Footer } from './Footer'
import { Header } from './Header'

/**
 * Application shell: semantic landmarks + skip link + route-change focus and
 * scroll management.
 *
 * On client-side navigation the browser leaves focus on the header link, so a
 * keyboard or screen-reader user would have to traverse the chrome again to
 * reach the new page; we move focus to the `<main>` landmark. For PUSH/REPLACE
 * navigations we also reset the scroll offset to the top of the new page so a
 * long destination does not open halfway down. POP (back/forward) navigations
 * leave scroll alone so the browser restores the previous position.
 *
 * The very first render is skipped so a fresh page load neither steals focus
 * nor scrolls. The navigation type comes from `useNavigationType` (React
 * Router), not a pathname heuristic; `preventScroll` keeps the browser's own
 * restoration intact for POP.
 */
export function Layout() {
  const strings = useStrings()
  const location = useLocation()
  const navigationType = useNavigationType()
  const mainRef = useRef<HTMLElement>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
    }
  }, [location.key, navigationType])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {strings.nav.skipToContent}
      </a>
      <Header />
      <main id="main-content" ref={mainRef} className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
