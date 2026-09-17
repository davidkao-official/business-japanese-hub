import { Link } from 'react-router-dom'
import { PlusAccessBoundary } from '../components/PlusAccessBoundary'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { PRODUCT_MODES } from './productModes'

export function PlusPage() {
  const strings = useStrings()
  const plus = strings.plus
  useDocumentTitle(`${strings.app.name} Plus`)

  return (
    <section className="page plus-page" aria-labelledby="plus-title">
      <div className="plus-hero">
        <p className="plus-page__eyebrow">{plus.eyebrow}</p>
        <h1 className="page__title" id="plus-title">
          Business Japanese Hub Plus
        </h1>
        <p className="page__lead">{plus.lead}</p>

        <div className="plus-price" aria-label={`${plus.priceLabel} ${plus.priceAmount} ${plus.pricePeriod}`}>
          <p className="plus-price__label">{plus.priceLabel}</p>
          <p className="plus-price__amount">
            <span lang="en">{plus.priceAmount}</span>
            <span className="plus-price__period">{plus.pricePeriod}</span>
          </p>
          <p className="plus-price__disclosure">{plus.priceDisclosure}</p>
        </div>
      </div>

      <section className="plus-availability" aria-labelledby="plus-availability-title">
        <div>
          <p className="plus-page__eyebrow">{plus.priceLabel}</p>
          <h2 id="plus-availability-title">{plus.availabilityTitle}</h2>
        </div>
        <p>{plus.availabilityBody}</p>
      </section>

      <section className="plus-audience" aria-labelledby="plus-audience-title">
        <div>
          <h2 id="plus-audience-title">{plus.audienceTitle}</h2>
          <p>{plus.audienceBody}</p>
        </div>
        <div className="plus-journey">
          <h3>{plus.journeyTitle}</h3>
          <ol>
            {plus.journeySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="plus-value" aria-labelledby="plus-value-title">
        <h2 id="plus-value-title">{plus.valueTitle}</h2>
        <div className="plus-value__grid">
          <article>
            <p className="plus-value__label" lang="en">
              {plus.freeTitle}
            </p>
            <p>{plus.freeBody}</p>
          </article>
          <article>
            <p className="plus-value__label" lang="en">
              {plus.plusTitle}
            </p>
            <p>{plus.plusBody}</p>
          </article>
        </div>
        <div className="plus-value__learning-system">
          <h3>{plus.learningSystemTitle}</h3>
          <p>{plus.learningSystemBody}</p>
        </div>
      </section>

      <PlusAccessBoundary access="public">
        <nav className="plus-free-links" aria-label={strings.learningModes.navigationLabel}>
          {PRODUCT_MODES.map((mode) => (
            <Link key={mode.id} to={mode.href}>
              <span lang="en">{mode.label}</span>
              <span>{strings.learningModes.modes[mode.id].summary}</span>
            </Link>
          ))}
        </nav>
      </PlusAccessBoundary>

      <section className="plus-membership" aria-labelledby="plus-membership-title">
        <div className="plus-membership__intro">
          <h2 id="plus-membership-title">{plus.accessTitle}</h2>
          <p>{plus.accessBody}</p>
        </div>
        <PlusAccessBoundary
          preview={<PlusSurfaceList title={plus.previewTitle} body={plus.previewBody} />}
        >
          <PlusSurfaceList title={plus.plusTitle} body={plus.plusBody} />
        </PlusAccessBoundary>
      </section>
    </section>
  )
}

function PlusSurfaceList({ title, body }: { title: string; body: string }) {
  const plus = useStrings().plus

  return (
    <div className="plus-surfaces">
      <h3>{title}</h3>
      <p>{body}</p>
      <ul>
        {plus.surfaces.map((surface) => (
          <li key={surface.title}>
            <strong lang="en">{surface.title}</strong>
            <span>{surface.body}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
