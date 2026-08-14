import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { listBooks } from '../reader/catalog'
import { useStrings } from '../i18n/strings'

export function HomePage() {
  const strings = useStrings()
  const books = listBooks()
  useDocumentTitle(strings.home.title)

  return (
    <section className="page" aria-labelledby="home-title">
      <h1 className="page__title" id="home-title">
        {strings.home.title}
      </h1>
      <p className="page__lead">{strings.home.lead}</p>

      {books.length > 0 && (
        <section aria-labelledby="sample-books-title">
          <h2 className="page__subtitle" id="sample-books-title">
            {strings.home.sampleBooks}
          </h2>
          <ul className="book-list">
            {books.map((book) => (
              <li key={book.id} className="book-list__item">
                <Link className="book-list__card" to={`/books/${book.slug}`}>
                  <span className="book-list__title">{book.title}</span>
                  {book.subtitle && <span className="book-list__subtitle">{book.subtitle}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
