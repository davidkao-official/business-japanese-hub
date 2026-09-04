import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { AppearanceControl } from './AppearanceControl'
import { AccountControl } from './AccountControl'
import { Navigation } from './Navigation'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Header() {
  const strings = useStrings()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuTitleId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuWasOpen = useRef(false)

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    if (menuOpen) {
      menuWasOpen.current = true
      closeRef.current?.focus()
      return
    }

    if (menuWasOpen.current) {
      menuWasOpen.current = false
      triggerRef.current?.focus()
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        return
      }

      if (event.key !== 'Tab') return

      const menu = menuRef.current
      if (!menu) return

      const focusableElements = Array.from(
        menu.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (!first || !last) {
        event.preventDefault()
        menu.focus()
        return
      }

      const activeElement = document.activeElement
      if (!menu.contains(activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  return (
    <header className="site-header">
      <div className="site-header__inner" aria-hidden={menuOpen}>
        <Link className="site-header__brand" to="/">
          {strings.app.name}
        </Link>
        <div className="site-header__tools">
          {!menuOpen && (
            <>
              <Navigation />
              <AccountControl />
              <AppearanceControl />
            </>
          )}
        </div>
        <button
          ref={triggerRef}
          className="site-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-haspopup="dialog"
          aria-label={menuOpen ? strings.nav.closeMenu : strings.nav.openMenu}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>
      </div>
      {menuOpen && (
        <div
          ref={menuRef}
          className="mobile-menu"
          id={menuId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={menuTitleId}
          tabIndex={-1}
        >
          <div className="mobile-menu__top">
            <Link className="mobile-menu__brand" to="/" onClick={closeMenu}>
              {strings.app.name}
            </Link>
            <button
              ref={closeRef}
              className="mobile-menu__close btn btn--ghost"
              type="button"
              aria-label={strings.nav.closeMenu}
              onClick={closeMenu}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <h2 className="mobile-menu__title" id={menuTitleId}>
            {strings.nav.mobileMenuTitle}
          </h2>
          <div className="mobile-menu__body">
            <Navigation onNavigate={closeMenu} />
            <div className="mobile-menu__controls">
              <AccountControl />
              <AppearanceControl />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
