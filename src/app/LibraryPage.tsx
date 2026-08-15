import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useStrings } from '../i18n/strings'
import { useUserState } from '../lib/persistence/UserStateContext'
import { useLibraryData } from './useLibraryData'
import { ContinueReading } from '../components/ContinueReading'
import { LibraryBookTile } from '../components/LibraryBookTile'

/** Shared page shell: the library landmark + heading stay identical across states. */
function LibraryShell({ children }: { children?: ReactNode }) {
  const strings = useStrings()
  return (
    <section className="page" aria-labelledby="library-title">
      <h1 className="page__title" id="library-title">
        {strings.library.title}
      </h1>
      {children}
    </section>
  )
}

/**
 * Personal library — the owned-book shelf (docs/ui-ux-research.md §4.3).
 * The first section is 続きを読む; then 所有している本. Only owned books are
 * shown (never the storefront inventory), and progress stays quiet (a thin
 * line + %). Signed-out and empty states are first-class.
 */
export function LibraryPage() {
  const strings = useStrings()
  const { user, authLoading } = useUserState()
  const { data, loading, error, reload } = useLibraryData()
  useDocumentTitle(`${strings.library.title} — ${strings.app.name}`)

  // While the session is being restored, a signed-in user must not briefly see
  // the signed-out state.
  if (authLoading && !user) {
    return (
      <LibraryShell>
        <p className="library-state" aria-live="polite">
          {strings.library.loading}
        </p>
      </LibraryShell>
    )
  }

  if (!user) {
    return (
      <LibraryShell>
        <p className="library-state">{strings.library.signedOut}</p>
      </LibraryShell>
    )
  }

  if (error) {
    return (
      <LibraryShell>
        <div className="library-state" role="alert">
          <p>{strings.library.loadFailed}</p>
          <button type="button" className="btn btn--ghost" onClick={reload}>
            {strings.library.retry}
          </button>
        </div>
      </LibraryShell>
    )
  }

  if (loading && !data) {
    return (
      <LibraryShell>
        <p className="library-state" aria-live="polite">
          {strings.library.loading}
        </p>
      </LibraryShell>
    )
  }

  if (data && data.books.length === 0) {
    return (
      <LibraryShell>
        <div className="library-state">
          <p>{strings.library.empty}</p>
          <Link className="btn btn--primary" to="/">
            {strings.library.browseBooks}
          </Link>
        </div>
      </LibraryShell>
    )
  }

  if (!data) {
    return <LibraryShell />
  }

  return (
    <LibraryShell>
      {data.continueReading.length > 0 && (
        <section aria-labelledby="library-continue-title">
          <h2 className="section-title" id="library-continue-title">
            {strings.library.continueReading}
          </h2>
          <ul className="continue-reading-list">
            {data.continueReading.map((item) => (
              <ContinueReading
                key={item.book.id}
                book={item.book}
                readingState={item.readingState}
                progress={item.progress}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="library-owned-title">
        <h2 className="section-title" id="library-owned-title">
          {strings.library.allOwned}
        </h2>
        <ul className="library-book-list">
          {data.books.map((item) => (
            <LibraryBookTile
              key={item.book.id}
              book={item.book}
              readingState={item.readingState}
              progress={item.progress}
            />
          ))}
        </ul>
      </section>
    </LibraryShell>
  )
}
