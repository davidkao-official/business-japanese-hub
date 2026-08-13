import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useStrings } from '../i18n/strings'

/**
 * Book detail — generic `/books/:slug` route. Deliberately free of any
 * book-specific data or components; the content model is a parallel track.
 */
export function BookPage() {
  const strings = useStrings()
  const { slug } = useParams<{ slug: string }>()
  useDocumentTitle(`${strings.book.title} — ${strings.app.name}`)

  return (
    <section className="page" aria-labelledby="book-title">
      <h1 className="page__title" id="book-title">
        {strings.book.title}
      </h1>
      <p className="page__lead">{strings.book.lead}</p>
      {slug && (
        <p className="page__meta" data-testid="book-slug">
          <code>{slug}</code>
        </p>
      )}
    </section>
  )
}
