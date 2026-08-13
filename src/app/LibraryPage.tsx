import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useStrings } from '../i18n/strings'

/** Personal library — platform-level placeholder, content model arrives later. */
export function LibraryPage() {
  const strings = useStrings()
  useDocumentTitle(`${strings.library.title} — ${strings.app.name}`)

  return (
    <section className="page" aria-labelledby="library-title">
      <h1 className="page__title" id="library-title">
        {strings.library.title}
      </h1>
      <p className="page__lead">{strings.library.lead}</p>
    </section>
  )
}
