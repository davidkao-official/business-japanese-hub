import { Link, Navigate, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getBookBySlug } from './catalog'
import { useStrings } from '../i18n/strings'
import { ReaderShell } from './ReaderShell'

function ReaderNotFound({ message }: { message: string }) {
  const strings = useStrings()
  return (
    <section className="reader-notfound">
      <h1 className="reader-notfound__title">{message}</h1>
      <Link className="reader-notfound__link" to="/library">
        {strings.reader.backToLibrary}
      </Link>
    </section>
  )
}

/**
 * Reader route resolver: `/books/:slug/read` (redirects to the first chapter)
 * and `/books/:slug/read/:chapterSlug`. Reads the book through the catalog seam
 * so the reader itself never touches content specifics.
 *
 * The three states are distinguished for both the document title and the body:
 * missing book, valid book with an unknown chapter, and the redirect path
 * (valid book, no chapter slug) which must not flash a not-found title.
 */
export function ReaderPage() {
  const strings = useStrings()
  const { slug, chapterSlug } = useParams<{ slug: string; chapterSlug?: string }>()
  const book = slug ? getBookBySlug(slug) : undefined

  // Resolve the chapter once; the render paths below reuse it instead of
  // re-running the lookup.
  const chapter = book && chapterSlug ? book.chapters.find((c) => c.slug === chapterSlug) : undefined

  let title = strings.reader.bookNotFound
  if (book && chapterSlug && !chapter) {
    title = strings.reader.chapterNotFound
  } else if (book && chapter) {
    title = `${chapter.title} — ${book.title}`
  } else if (book) {
    // Redirect path (or a book with no chapters): title the destination.
    const first = book.chapters[0]
    title = first ? `${first.title} — ${book.title}` : strings.reader.bookNotFound
  }
  useDocumentTitle(title)

  if (!book) {
    return <ReaderNotFound message={strings.reader.bookNotFound} />
  }

  if (chapterSlug) {
    if (!chapter) return <ReaderNotFound message={strings.reader.chapterNotFound} />
    return <ReaderShell key={book.id} book={book} chapter={chapter} />
  }

  const first = book.chapters[0]
  if (!first) return <ReaderNotFound message={strings.reader.bookNotFound} />
  return <Navigate to={`/books/${book.slug}/read/${first.slug}`} replace />
}
