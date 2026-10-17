import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { useStrings } from '../i18n/strings'
import { AccountControl } from './AccountControl'

/** G2 (#202): explain historical Book access without offering a new purchase. */
export function BookAccessNotice({ children }: { children?: ReactNode }) {
  const strings = useStrings()
  const { user, loading } = useAuth()

  return (
    <div className="book-access-notice">
      <p className="book-access-notice__message">{strings.book.noLongerOffered}</p>
      <div className="cta-row">
        {children}
        <Link className="btn btn--secondary" to="/read">{strings.book.browseFreeReading}</Link>
        {!user && !loading && <AccountControl />}
      </div>
    </div>
  )
}
