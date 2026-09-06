import { NavLink } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { PRODUCT_MODES } from '../app/productModes'

const NAV_ITEMS = [
  // Keep the brand's home destination available while the five learning
  // modes define the service's primary IA. Historical Library stays a
  // compatibility/content route and is intentionally not listed here.
  { to: '/', end: true, getLabel: (s: ReturnType<typeof useStrings>) => s.nav.home },
  ...PRODUCT_MODES.map((mode) => ({
    to: mode.href,
    end: true,
    getLabel: () => mode.label,
  })),
  { to: '/about', end: true, getLabel: () => 'About' },
] as const

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
            <NavLink to={item.to} end={item.end} className="site-nav__link" onClick={onNavigate}>
              {item.getLabel(strings)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
