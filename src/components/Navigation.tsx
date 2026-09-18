import { NavLink } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { PRODUCT_MODES } from '../app/productModes'

interface NavItem {
  to: string
  end: boolean
  labelLanguage?: 'en'
  tone?: 'membership'
  getLabel: (strings: ReturnType<typeof useStrings>) => string
  getAriaLabel?: (strings: ReturnType<typeof useStrings>) => string
}

const NAV_ITEMS: readonly NavItem[] = [
  // Keep the brand's home destination available while the five learning
  // modes define the service's primary IA. Historical Library stays a
  // compatibility/content route and is intentionally not listed here.
  { to: '/', end: true, getLabel: (strings) => strings.nav.home },
  ...PRODUCT_MODES.map((mode) => ({
    to: mode.href,
    end: true,
    labelLanguage: 'en' as const,
    getLabel: () => mode.label,
  })),
  {
    to: '/plus',
    end: true,
    tone: 'membership',
    getLabel: (strings) => strings.nav.plus,
    getAriaLabel: (strings) => strings.nav.plusName,
  },
  { to: '/about', end: true, getLabel: () => 'About' },
]

/**
 * Primary site navigation.
 * `<nav aria-label>` disambiguates it from any future in-page nav; NavLink
 * automatically exposes `aria-current="page"` for the active item.
 */
export function Navigation({ onNavigate }: { onNavigate?: () => void } = {}) {
  const strings = useStrings()

  return (
    <nav aria-label={strings.nav.main} className="site-nav">
      <ul className="site-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={`site-nav__link${item.tone ? ` site-nav__link--${item.tone}` : ''}`}
              aria-label={item.getAriaLabel?.(strings)}
              onClick={onNavigate}
            >
              {item.labelLanguage ? (
                <span lang={item.labelLanguage}>{item.getLabel(strings)}</span>
              ) : (
                item.getLabel(strings)
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
