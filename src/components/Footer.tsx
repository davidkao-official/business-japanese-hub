import { Link } from 'react-router-dom'
import { useLocale, useStrings } from '../i18n/strings'
import { listLegalDocuments, SELLER_DISCLOSURE } from '../legal-content'

export function Footer() {
  const strings = useStrings()
  const locale = useLocale()
  const documents = listLegalDocuments()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <nav aria-label={strings.legal.footerLabel} className="site-footer__legal">
          <ul className="site-footer__legal-list">
            <li>
              <Link to="/legal">{strings.legal.title}</Link>
            </li>
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link to={`/legal/${doc.slug}`}>{doc.titles[locale]}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="site-footer__seller">
          {strings.legal.sellerDisclosureLabel}
          <span>{SELLER_DISCLOSURE.name}</span>
          {SELLER_DISCLOSURE.pending && (
            <span className="site-footer__seller-pending">
              （{strings.legal.sellerDisclosurePending}）
            </span>
          )}
        </p>
        <p>{strings.footer.note}</p>
      </div>
    </footer>
  )
}
