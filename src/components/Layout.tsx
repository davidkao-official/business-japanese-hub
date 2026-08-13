import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { Footer } from './Footer'
import { Header } from './Header'

/**
 * Application shell: semantic landmarks + skip link + route-change focus
 * management.
 *
 * On client-side navigation the browser leaves focus on the header link, so a
 * keyboard or screen-reader user would have to traverse the chrome again to
 * reach the new page. We move focus to the `<main>` landmark whenever the
 * pathname changes. The very first render is skipped so a fresh page load does
 * not steal focus; back/forward navigation goes through the same location
 * subscription and is handled identically. `preventScroll` keeps the browser's
 * scroll restoration intact, and the skip link still jumps to `#main-content`.
 */
export function Layout() {
  const strings = useStrings()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPathname = useRef<string | null>(null)

  useEffect(() => {
    if (previousPathname.current === null) {
      previousPathname.current = location.pathname
      return
    }
    if (previousPathname.current !== location.pathname) {
      previousPathname.current = location.pathname
      mainRef.current?.focus({ preventScroll: true })
    }
  }, [location.pathname])

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
