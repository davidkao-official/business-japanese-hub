import { Link } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { AppearanceControl } from './AppearanceControl'
import { AccountControl } from './AccountControl'
import { Navigation } from './Navigation'

export function Header() {
  const strings = useStrings()

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-header__brand" to="/">
          {strings.app.name}
        </Link>
        <div className="site-header__tools">
          <Navigation />
          <AccountControl />
          <AppearanceControl />
        </div>
      </div>
    </header>
  )
}
