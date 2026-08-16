import { Link, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useLocale, useStrings } from '../../i18n/strings'
import type { AppStrings } from '../../i18n/strings'
import { getLegalDocumentBySlug } from '../../legal-content'
import type { LegalDocumentStatus } from '../../legal-content'

function statusText(strings: AppStrings, status: LegalDocumentStatus): string {
  switch (status) {
    case 'draft':
      return strings.legal.statusDraft
    case 'review':
      return strings.legal.statusReview
    case 'live':
      return strings.legal.statusLive
  }
}

/**
 * Versioned legal document page (/legal/:slug). Renders a single document's
 * localized title, version/status metadata, the draft-review notice (visible
 * while the document is pre-review), and its structured body sections.
 * Book-agnostic platform surface.
 */
export function LegalPage() {
  const { slug } = useParams<{ slug: string }>()
  const strings = useStrings()
  const locale = useLocale()
  const document = slug ? getLegalDocumentBySlug(slug) : undefined
  const title = document ? document.titles[locale] : strings.legal.documentNotFound
  useDocumentTitle(`${title} — ${strings.app.name}`)

  if (!document) {
    return (
      <section className="page" aria-labelledby="legal-not-found-title">
        <h1 className="page__title" id="legal-not-found-title">
          {strings.legal.documentNotFound}
        </h1>
        <Link className="page__action" to="/legal">
          {strings.legal.backToIndex}
        </Link>
      </section>
    )
  }

  const body = document.bodies[locale]

  return (
    <section className="page legal-doc" aria-labelledby="legal-doc-title">
      <h1 className="page__title" id="legal-doc-title">
        {document.titles[locale]}
      </h1>
      <p className="legal-doc__meta">
        {strings.legal.versionLabel} {document.version}
        {' · '}
        {strings.legal.statusLabel} {statusText(strings, document.status)}
        {' · '}
        {strings.legal.revisedLabel} {document.revisedAt}
      </p>

      {document.status === 'draft' && (
        <p className="legal-draft-banner" role="note">
          {strings.legal.draftNotice}
        </p>
      )}

      <div className="legal-doc__body">
        {body.map((section, index) => (
          <section
            key={`${document.slug}-${index}`}
            className="legal-doc__section"
            aria-labelledby={`legal-${document.slug}-section-${index}`}
          >
            <h2 id={`legal-${document.slug}-section-${index}`}>{section.heading}</h2>
            {section.paragraphs.map((paragraph, pIndex) => (
              <p key={pIndex}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}
