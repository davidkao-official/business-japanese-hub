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
    ui.aboutAudienceNextStepAfterN1,
    ui.aboutAudienceJobInterview,
    ui.aboutAudienceWorkplaceCommunication,
    ui.aboutAudienceBusinessReading,
    ui.aboutAudienceBusinessExpression,
    ui.aboutAudienceDirectJapaneseInformation,
  ] as const
  const REAL_WORLD_EXAMPLES = [
    ui.aboutMaterialPresentationsPlans,
    ui.aboutMaterialFinancialIntegratedReports,
    ui.aboutMaterialManagementPlans,
    ui.aboutMaterialBusinessIndustryNews,
    ui.aboutMaterialBooksMagazines,
    ui.aboutMaterialWorkplaceVocabulary,
    ui.aboutMaterialMeetingsDiscussions,
    ui.aboutMaterialLanguageNuance,
  ] as const
  useDocumentTitle(ui.aboutDocumentTitle)

  return (
    <article className="about-page" lang={getActiveLocale()} aria-labelledby="about-title">
      <header className="about-page__hero">
        <p className="about-page__eyebrow" lang={getActiveLocale()}>
          {ui.aboutHeroEyebrow}</p>
        <h1 className="about-page__title" id="about-title">
          {ui.aboutHeroTitle}</h1>
        <p className="about-page__tagline">
          {ui.aboutHeroTagline}</p>
        <p className="about-page__hero-copy">
          {ui.aboutHeroN1LearningContinues}</p>
        <p className="about-page__hero-copy">
          {ui.aboutHeroNextStage}</p>
        <p className="about-page__lead">
          <strong>
            {ui.aboutPlatformDescription}</strong>
        </p>
        <p className="about-page__hero-copy">{ui.aboutBeyondCertificatesGoal}</p>
        <p className="about-page__hero-copy">{ui.aboutTransitionIntroduction}</p>
        <div className="about-page__contrast" aria-label={ui.aboutLearningGoalAccessibleName}>
          <p>
            <strong>{ui.aboutReadingComprehensionGoal}</strong>
          </p>
          <p className="about-page__contrast-arrow">{ui.aboutTransitionArrow}</p>
          <p className="about-page__contrast-emphasis">
            <strong>{ui.aboutWorkingInJapaneseGoal}</strong>
          </p>
        </div>
      </header>

      <div className="about-page__sections">
        <section className="about-page__section" aria-labelledby="about-purpose-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutPurposeEyebrow}</p>
          <h2 id="about-purpose-title">{ui.aboutPurposeHeading}</h2>
          <h3>{ui.aboutPurposeLead}</h3>
          <p>{ui.aboutN1FriendsContext}</p>
          <p>{ui.aboutJobHuntingRealization}</p>
          <p>
            {ui.aboutInterviewExpressionBarrier}</p>
        </section>

        <section className="about-page__section about-page__section--distance" aria-labelledby="about-distance-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutDistanceEyebrow}</p>
          <h2 id="about-distance-title">{ui.aboutDistanceHeading}</h2>
          <p>{ui.aboutConventionalLearningIntroduction}</p>
          <p className="about-page__progression"><strong>N5 → N4 → N3 → N2 → N1</strong></p>
          <p>{ui.aboutConventionalTextbooks}</p>
          <p>{ui.aboutConventionalVocabularyBooks}</p>
          <p>{ui.aboutConventionalGrammarBooks}</p>
          <p>{ui.aboutConventionalMockTests}</p>
          <p>{ui.aboutConventionalNextStep}</p>
          <p>{ui.aboutAfterN1Question}</p>
          <p>{ui.aboutMissingLearningPath}</p>
          <p>{ui.aboutSocietyBeyondJlptLevels}</p>
          <p>{ui.aboutRealWorldMaterialsIntroduction}</p>
          <ol className="about-page__list about-page__list--examples">
            {REAL_WORLD_EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ol>
        </section>

        <section className="about-page__section" aria-labelledby="about-audience-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutAudienceEyebrow}</p>
          <h2 id="about-audience-title">{ui.aboutAudienceHeading}</h2>
          <p>{ui.aboutAudienceIntroduction}</p>
          <ol className="about-page__list about-page__list--audience">
            {AUDIENCE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <div className="about-page__audience-close">
            <p>{ui.aboutJlptGoalLead}</p>
            <p>{ui.aboutExistingJlptMaterials}</p>
            <p>{ui.aboutWorkCapabilityQuestionLead}</p>
          </div>
          <div className="about-page__question">
            <blockquote>
              <strong>{ui.aboutWorkCapabilityQuestion}</strong>
            </blockquote>
            <p className="about-page__question-close">{ui.aboutWorkCapabilitySupport}</p>
          </div>
        </section>

        <section className="about-page__section about-page__section--founders" aria-labelledby="about-founders-title">
          <p className="about-page__section-label" lang={getActiveLocale()}>
            {ui.aboutFoundersEyebrow}</p>
          <h2 id="about-founders-title">{ui.aboutFounderHeading}</h2>
          <div className="about-page__founder-story">
            <p>{ui.aboutFounderLearningJourney}</p>
            <p>
              {ui.aboutFounderN1Milestone}</p>
            <p>
              {ui.aboutFounderQualificationsExperience}</p>
            <p>
              {ui.aboutFounderMbaMilestone}</p>
            <p>
              {ui.aboutFounderConsultingExperience}</p>
            <p>{ui.aboutFounderRealizationLead}</p>
            <h3>
              <strong>{ui.aboutFounderN1WorkGap}</strong>
            </h3>
            <p>{ui.aboutFounderLearningPathGap}</p>
            <p>{ui.aboutFounderLearningPathGoal}</p>
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
          <strong lang={getActiveLocale()}>{ui.aboutLanguagesLabel}</strong>
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
