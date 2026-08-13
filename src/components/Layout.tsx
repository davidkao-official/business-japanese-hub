import { Outlet } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { Footer } from './Footer'
import { Header } from './Header'

/**
 * Application shell: semantic landmarks + skip link.
 * `<main>` is focusable so keyboard users can tab past the nav via the
 * skip link; the negative tabindex keeps it out of the tab order.
 */
export function Layout() {
  const strings = useStrings()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {strings.nav.skipToContent}
      </a>
      <Header />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
