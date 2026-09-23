import { Link } from 'react-router-dom'
import { useLocale, useStrings } from '../i18n/strings'
import { legalContentLocaleFor, listLegalDocuments, SELLER_DISCLOSURE } from '../legal-content'
import { AppearanceControl } from './AppearanceControl'

export function Footer() {
  const strings = useStrings()
  const locale = useLocale()
  const legalLocale = legalContentLocaleFor(locale)
  const documents = listLegalDocuments()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <Link className="site-footer__brand" to="/">
            {strings.app.name}
          </Link>
          <div className="site-footer__appearance">
            <AppearanceControl />
          </div>
          <nav aria-label={strings.legal.footerLabel} className="site-footer__legal">
            <ul className="site-footer__legal-list">
              <li>
                <Link to="/legal">{strings.legal.title}</Link>
              </li>
              {documents.map((doc) => (
                <li key={doc.id}>
                  <Link lang={legalLocale} to={`/legal/${doc.slug}`}>{doc.titles[legalLocale]}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="site-footer__details">
          <p className="site-footer__seller">
            {strings.legal.sellerDisclosureLabel}
            <span>{SELLER_DISCLOSURE.name}</span>
            {SELLER_DISCLOSURE.pending && (
              <span className="site-footer__seller-pending">
                （{strings.legal.sellerDisclosurePending}）
              </span>
            )}
          </p>
          <p className="site-footer__copyright">{strings.footer.note}</p>
        </div>
      </div>
    </footer>
  )
}
