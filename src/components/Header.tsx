import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { AppearanceControl } from './AppearanceControl'
import { AccountControl } from './AccountControl'
import { Navigation } from './Navigation'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type CloseFocusTarget = 'trigger' | 'desktop'

export function Header() {
  const strings = useStrings()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuTitleId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const desktopBrandRef = useRef<HTMLAnchorElement>(null)
  const menuWasOpen = useRef(false)
  const closeFocusTarget = useRef<CloseFocusTarget>('trigger')
  const lastLocationKey = useRef(location.key)

  const closeMenu = () => {
    closeFocusTarget.current = 'trigger'
    setMenuOpen(false)
  }

  const closeMenuTo = (focusTarget: CloseFocusTarget) => {
    closeFocusTarget.current = focusTarget
    setMenuOpen(false)
  }

  useEffect(() => {
    if (menuOpen) {
      menuWasOpen.current = true
      closeFocusTarget.current = 'trigger'
      closeRef.current?.focus()
      return
    }

    if (menuWasOpen.current) {
      menuWasOpen.current = false
      const focusTarget =
        closeFocusTarget.current === 'desktop' ? desktopBrandRef.current : triggerRef.current
      closeFocusTarget.current = 'trigger'
      focusTarget?.focus()
    }
  }, [menuOpen])

  useEffect(() => {
    if (lastLocationKey.current === location.key) return
    lastLocationKey.current = location.key
    closeMenu()
  }, [location.key])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const desktopQuery = window.matchMedia('(min-width: 50rem)')
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenuTo('desktop')
    }

    if (typeof desktopQuery.addEventListener === 'function') {
      desktopQuery.addEventListener('change', closeOnDesktop)
      return () => desktopQuery.removeEventListener('change', closeOnDesktop)
    }

    desktopQuery.addListener(closeOnDesktop)
    return () => desktopQuery.removeListener(closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>('.skip-link, .app-main, .site-footer'),
    )
    const previousBackgroundState = backgroundElements.map((element) => ({
      element,
      inert: Boolean(element.inert),
      ariaHidden: element.getAttribute('aria-hidden'),
    }))

    for (const element of backgroundElements) {
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    }

    return () => {
      for (const { element, inert, ariaHidden } of previousBackgroundState) {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      }
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
      ).filter(
        (element) =>
          !element.matches('input[type="radio"]') || (element as HTMLInputElement).checked,
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
        <Link ref={desktopBrandRef} className="site-header__brand" to="/">
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
