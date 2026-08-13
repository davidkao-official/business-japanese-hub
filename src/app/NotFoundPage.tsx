import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useStrings } from '../i18n/strings'

export function NotFoundPage() {
  const strings = useStrings()
  useDocumentTitle(strings.notFound.title)

  return (
    <section className="page" aria-labelledby="not-found-title">
      <h1 className="page__title" id="not-found-title">
        {strings.notFound.title}
      </h1>
      <p className="page__lead">{strings.notFound.message}</p>
      <Link className="page__action" to="/">
        {strings.notFound.backHome}
      </Link>
    </section>
  )
}
