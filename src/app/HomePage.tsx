import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useStrings } from '../i18n/strings'

export function HomePage() {
  const strings = useStrings()
  useDocumentTitle(strings.home.title)

  return (
    <section className="page" aria-labelledby="home-title">
      <h1 className="page__title" id="home-title">
        {strings.home.title}
      </h1>
      <p className="page__lead">{strings.home.lead}</p>
    </section>
  )
}
