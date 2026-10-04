import { useStrings, getActiveLocale } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import {
  COFOUNDER_PROFILE,
  FOUNDER_PROFILE,
  type PublicProfile,
} from './storefrontProfiles'

/**
 * Public About page for the platform. The narrative is intentionally kept
 * here as editorial content rather than folded into the Book or membership
 * runtime; the platform owns the presentation and the approved story owns
 * the copy.
 */
export function AboutPage() {
  const ui = useStrings().learningUi

  const AUDIENCE_ITEMS = [
    ui.aboutText09,
    ui.aboutText10,
    ui.aboutText11,
    ui.aboutText12,
    ui.aboutText13,
    ui.aboutText14,
  ] as const
  const REAL_WORLD_EXAMPLES = [
    ui.aboutText01,
    ui.aboutText02,
    ui.aboutText03,
    ui.aboutText04,
    ui.aboutText05,
    ui.aboutText06,
    ui.aboutText07,
    ui.aboutText08,
  ] as const
  useDocumentTitle(ui.aboutText15)

  return (
    <article className="about-page" lang={getActiveLocale()} aria-labelledby="about-title">
      <header className="about-page__hero">
        <p className="about-page__eyebrow" lang={getActiveLocale()}>
          {ui.aboutText16}</p>
        <h1 className="about-page__title" id="about-title">
          {ui.aboutText17}</h1>
        <p className="about-page__tagline">
          {ui.aboutText18}</p>
        <p className="about-page__hero-copy">
          {ui.aboutText19}</p>
        <p className="about-page__hero-copy">
          {ui.aboutText20}</p>
        <p className="about-page__lead">
          <strong>
            {ui.aboutText21}</strong>
        </p>
        <p className="about-page__hero-copy">{ui.aboutText22}</p>
        <p className="about-page__hero-copy">{ui.aboutText23}</p>
        <div className="about-page__contrast" aria-label={ui.aboutText24}>
          <p>
            <strong>{ui.aboutText25}</strong>
          </p>
          <p className="about-page__contrast-arrow">{ui.aboutText26}</p>
          <p className="about-page__contrast-emphasis">
            <strong>{ui.aboutText27}</strong>
          </p>
        </div>
      </header>

      <div className="about-page__sections">
        <section className="about-page__section" aria-labelledby="about-purpose-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutText28}</p>
          <h2 id="about-purpose-title">{ui.aboutText29}</h2>
          <h3>{ui.aboutText30}</h3>
          <p>{ui.aboutText31}</p>
          <p>{ui.aboutText32}</p>
          <p>
            {ui.aboutText33}</p>
        </section>

        <section className="about-page__section about-page__section--distance" aria-labelledby="about-distance-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutText34}</p>
          <h2 id="about-distance-title">{ui.aboutText35}</h2>
          <p>{ui.aboutText36}</p>
          <p className="about-page__progression"><strong>N5 → N4 → N3 → N2 → N1</strong></p>
          <p>{ui.aboutText37}</p>
          <p>{ui.aboutText38}</p>
          <p>{ui.aboutText39}</p>
          <p>{ui.aboutText40}</p>
          <p>{ui.aboutText41}</p>
          <p>{ui.aboutText42}</p>
          <p>{ui.aboutText43}</p>
          <p>{ui.aboutText44}</p>
          <p>{ui.aboutText45}</p>
          <ol className="about-page__list about-page__list--examples">
            {REAL_WORLD_EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ol>
        </section>

        <section className="about-page__section" aria-labelledby="about-audience-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutText46}</p>
          <h2 id="about-audience-title">{ui.aboutText47}</h2>
          <p>{ui.aboutText48}</p>
          <ol className="about-page__list about-page__list--audience">
            {AUDIENCE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <div className="about-page__audience-close">
            <p>{ui.aboutText49}</p>
            <p>{ui.aboutText50}</p>
            <p>{ui.aboutText51}</p>
          </div>
          <div className="about-page__question">
            <blockquote>
              <strong>{ui.aboutText52}</strong>
            </blockquote>
            <p className="about-page__question-close">{ui.aboutText53}</p>
          </div>
        </section>

        <section className="about-page__section about-page__section--founders" aria-labelledby="about-founders-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutText54}</p>
          <h2 id="about-founders-title">{ui.aboutText55}</h2>
          <div className="about-page__founder-story">
            <p>{ui.aboutText56}</p>
            <p>
              {ui.aboutText57}</p>
            <p>
              {ui.aboutText58}</p>
            <p>
              {ui.aboutText59}</p>
            <p>
              {ui.aboutText60}</p>
            <p>{ui.aboutText61}</p>
            <h3>
              <strong>{ui.aboutText62}</strong>
            </h3>
            <p>{ui.aboutText63}</p>
            <p>{ui.aboutText64}</p>
          </div>
          <div className="about-page__profiles">
            <ProfileBlock profile={FOUNDER_PROFILE} />
            <ProfileBlock profile={COFOUNDER_PROFILE} />
          </div>
        </section>
      </div>
    </article>
  )
}

function ProfileBlock({ profile }: { profile: PublicProfile }) {
  const ui = useStrings().learningUi

  return (
    <article className="about-profile" lang={profile.language}>
      <h3>{profile.heading}</h3>
      <ul>
        {profile.credentials.map((credential) => (
          <li key={credential}>{credential}</li>
        ))}
      </ul>
      {profile.languages && (
        <p className="about-profile__languages">
          <strong lang={getActiveLocale()}>{ui.aboutText65}</strong>
          <br />
          {profile.languages.map((language, index) => (
            <span key={language.label} lang={language.language}>
              {index > 0 && <span aria-hidden="true">｜</span>}
              {language.label}
            </span>
          ))}
        </p>
      )}
    </article>
  )
}
