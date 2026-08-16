import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLocale, useStrings } from '../../i18n/strings'
import { listLegalDocuments } from '../../legal-content'

/**
 * Legal index — platform surface listing all versioned legal documents
 * (/legal). Book-agnostic; no first-book-specific content.
 */
export function LegalIndexPage() {
  const strings = useStrings()
  const locale = useLocale()
  const documents = listLegalDocuments()
  useDocumentTitle(`${strings.legal.title} — ${strings.app.name}`)

  return (
    <section className="page" aria-labelledby="legal-index-title">
      <h1 className="page__title" id="legal-index-title">
        {strings.legal.title}
      </h1>
      <p className="page__lead">{strings.legal.lead}</p>

      <h2 className="section-title">{strings.legal.documentsLabel}</h2>
      <ul className="legal-index">
        {documents.map((doc) => (
          <li key={doc.id}>
            <Link className="legal-index__link" to={`/legal/${doc.slug}`}>
              <span className="legal-index__title">{doc.titles[locale]}</span>
              {doc.status === 'draft' && (
                <span className="legal-index__status">（{strings.legal.statusDraft}）</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
