import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useStrings } from '../i18n/strings'
import { READING_CATEGORIES, listReadingCatalogEntries } from '../reading/catalog'
import type { ReadingCategory } from '../reading/types'
import { listCatalogEntries } from '../reader/catalog'

export function ReadLandingPage() {
  const strings = useStrings()
  const copy = strings.reading
  const [category, setCategory] = useState<ReadingCategory | 'all'>('all')
  const entries = useMemo(
    () => listReadingCatalogEntries(category === 'all' ? undefined : category),
    [category],
  )
  const books = listCatalogEntries()
  const hasPublishedPlusReading = listReadingCatalogEntries().some((entry) => entry.access === 'plus')
  useDocumentTitle(`${copy.title} — ${strings.app.name}`)

  return (
    <section className="page reading-page" aria-labelledby="reading-title">
      <div className="reading-masthead">
        <p className="reading-eyebrow" lang="en">{copy.eyebrow}</p>
        <h1 className="reading-title" id="reading-title">{copy.title}</h1>
        <p className="reading-lead">{copy.lead}</p>
      </div>

      <section className="reading-discovery" aria-labelledby="reading-discovery-title">
        <div className="reading-section-heading">
          <div>
            <p className="reading-kicker">Read</p>
            <h2 id="reading-discovery-title">{strings.learningModes.modes.read.title}</h2>
          </div>
          <span className="reading-count" aria-live="polite">{entries.length}</span>
        </div>

        <nav className="reading-categories" aria-label={copy.categoryLabel}>
          <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
            {copy.allCategories}
          </button>
          {READING_CATEGORIES.map((candidate) => (
            <button
              type="button"
              key={candidate}
              aria-pressed={category === candidate}
              onClick={() => setCategory(candidate)}
            >
              {copy.categories[candidate]}
            </button>
          ))}
        </nav>

        {entries.length ? (
          <ul className="reading-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <article className="reading-card">
                  <div className="reading-card__meta">
                    <span>{copy.categories[entry.category]}</span>
                    <span className={`reading-access reading-access--${entry.access}`}>
                      {entry.access === 'free' ? copy.free : copy.plus}
                    </span>
                    {entry.sampleLabel && <span>{copy.sampleLabel}</span>}
                    {entry.releasedAt && <time dateTime={entry.releasedAt}>{entry.releasedAt.slice(0, 10)}</time>}
                  </div>
                  <h3 lang="zh-TW"><Link to={`/read/${entry.slug}`}>{entry.title}</Link></h3>
                  <p lang="zh-TW">{entry.summary}</p>
                  <Link className="reading-card__action" to={`/read/${entry.slug}`}>
                    {copy.openArticle}<span aria-hidden="true"> ↗</span>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="reading-empty" role="status">{copy.emptyCategory}</p>
        )}
      </section>

      {!hasPublishedPlusReading && <section className="reading-plus-note" aria-labelledby="reading-plus-title">
        <div>
          <p className="reading-kicker">Plus</p>
          <h2 id="reading-plus-title">{copy.plusUnavailableTitle}</h2>
          <p>{copy.plusUnavailableBody}</p>
        </div>
        <span className="reading-access reading-access--plus">{copy.plus}</span>
      </section>}

      <section className="reading-books" aria-labelledby="reading-books-title">
        <div>
          <p className="reading-kicker">Library</p>
          <h2 id="reading-books-title">{copy.booksTitle}</h2>
          <p>{copy.booksBody}</p>
        </div>
        <div className="reading-books__links">
          <Link className="btn btn--secondary" to="/library">{copy.browseBooks}</Link>
          {books.slice(0, 3).map(({ book }) => (
            <span className="reading-books__item" key={book.id}>
              <Link to={`/books/${book.slug}`}><span lang="ja">{book.title}</span></Link>
              <Link to={`/books/${book.slug}/read`}>{copy.openReader}</Link>
            </span>
          ))}
        </div>
      </section>
    </section>
  )
}
