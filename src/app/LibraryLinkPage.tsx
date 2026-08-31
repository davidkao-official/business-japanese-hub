import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { resolveLibraryReference } from '../reader/libraryReference'

/** Library-owned resolver for stable cross-product Book/Chapter/block ids. */
export function LibraryLinkPage() {
  const strings = useStrings()
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId') ?? ''
  const chapterId = searchParams.get('chapterId') ?? undefined
  const blockId = searchParams.get('blockId') ?? undefined
  const result = resolveLibraryReference({ bookId, chapterId, blockId })

  useDocumentTitle(
    result.kind === 'resolved' ? strings.app.name : `${strings.libraryLink.title} — ${strings.app.name}`,
  )

  if (result.kind === 'resolved') return <Navigate to={result.href} replace />

  return (
    <section className="page" aria-labelledby="library-link-title">
      <h1 className="page__title" id="library-link-title">
        {strings.libraryLink.title}
      </h1>
      <p className="page__lead">{strings.libraryLink.message}</p>
      <Link className="page__action" to="/library">
        {strings.reader.backToLibrary}
      </Link>
    </section>
  )
}
