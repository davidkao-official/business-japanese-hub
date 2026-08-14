import { Link, Navigate, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getBookBySlug } from './catalog'
import { useStrings } from '../i18n/strings'
import { ReaderShell } from './ReaderShell'

function ReaderNotFound() {
  const strings = useStrings()
  return (
    <section className="reader-notfound">
      <h1 className="reader-notfound__title">{strings.reader.bookNotFound}</h1>
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
 */
export function ReaderPage() {
  const strings = useStrings()
  const { slug, chapterSlug } = useParams<{ slug: string; chapterSlug?: string }>()
  const book = slug ? getBookBySlug(slug) : undefined

  const title = book?.title ?? ''
  const chapter = book && chapterSlug ? book.chapters.find((c) => c.slug === chapterSlug) : undefined
  useDocumentTitle(chapter ? `${chapter.title} — ${title}` : strings.reader.bookNotFound)

  if (!book) {
    return <ReaderNotFound />
  }

  if (chapterSlug) {
    const resolved = book.chapters.find((c) => c.slug === chapterSlug)
    if (!resolved) return <ReaderNotFound />
    return <ReaderShell key={book.id} book={book} chapter={resolved} />
  }

  const first = book.chapters[0]
  if (!first) return <ReaderNotFound />
  return <Navigate to={`/books/${book.slug}/read/${first.slug}`} replace />
}
