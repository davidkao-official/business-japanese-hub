import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { CAREER_GAME_HREF, PRODUCT_MODE_BY_ID, PRODUCT_MODES, type ProductModeId } from './productModes'

export function ProductModePage({ mode }: { mode: ProductModeId }) {
  const content = PRODUCT_MODE_BY_ID[mode]
  useDocumentTitle(`${content.title} — Business Japanese Hub`)

  return (
    <section className="page product-mode-page" aria-labelledby={`${content.id}-title`}>
      <div className="product-mode-page__intro">
        <p className="product-mode-page__eyebrow" lang="en">
          {content.label}
        </p>
        <h1 className="page__title" id={`${content.id}-title`}>
          {content.title}
        </h1>
        <p className="page__lead">{content.lead}</p>
      </div>

      {mode === 'read' ? <ReadModeLinks /> : null}
      {mode === 'experience' ? <ExperienceModeLink /> : null}

      <nav className="product-mode-page__next" aria-label="Learning modes">
        <h2>Continue exploring</h2>
        <ul>
          {PRODUCT_MODES.filter((candidate) => candidate.id !== mode).map((candidate) => (
            <li key={candidate.id}>
              <Link to={candidate.href}>
                <span lang="en">{candidate.label}</span>
                <span>{candidate.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}

function ReadModeLinks() {
  return (
    <section className="product-mode-page__capability" aria-labelledby="read-capability-title">
      <h2 id="read-capability-title">Long-form reading</h2>
      <p>
        The existing Library and Book/Reader routes remain available as Read capabilities.
      </p>
      <div className="product-mode-page__actions">
        <Link className="btn btn--primary" to="/library">
          Browse the Library
        </Link>
        <Link className="btn btn--secondary" to="/books/meeting-japanese">
          View a book
        </Link>
      </div>
    </section>
  )
}

function ExperienceModeLink() {
  return (
    <section className="product-mode-page__capability" aria-labelledby="experience-capability-title">
      <h2 id="experience-capability-title">Career Game</h2>
      <p>
        Follow the separate Experience runtime to apply workplace judgment in a story-driven case.
      </p>
      <a className="btn btn--primary" href={CAREER_GAME_HREF}>
        Open Career Game
      </a>
    </section>
  )
}
