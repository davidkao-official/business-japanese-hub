import { NavLink } from 'react-router-dom'
import { useStrings } from '../i18n/strings'

const NAV_ITEMS = [
  { to: '/', end: true, getLabel: (s: ReturnType<typeof useStrings>) => s.nav.home },
  // `end: true` keeps aria-current on /library only for its exact route. With a
  // prefix match, /library/missing would wrongly mark Library as the current
  // page while the catch-all renders NotFound.
  { to: '/library', end: true, getLabel: (s: ReturnType<typeof useStrings>) => s.nav.library },
] as const

/**
 * Primary site navigation.
 * `<nav aria-label>` disambiguates it from any future in-page nav; NavLink
 * automatically exposes `aria-current="page"` for the active item.
 */
export function Navigation() {
  const strings = useStrings()

  return (
    <nav aria-label={strings.nav.main} className="site-nav">
      <ul className="site-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className="site-nav__link">
              {item.getLabel(strings)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
