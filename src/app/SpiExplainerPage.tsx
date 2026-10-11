import { useStrings, getActiveLocale } from '../i18n/strings'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const SECTION_KEYS = ["spiExplainerDefinitionHeading","spiExplainerAssessmentHeading","spiExplainerVariantsHeading","spiExplainerDeliveryHeading","spiExplainerDurationHeading","spiExplainerSpeedAccuracyHeading","spiExplainerN1DifficultyHeading","spiExplainerForeignLearnerDifficultyHeading","spiExplainerTranslationBarrierHeading","spiExplainerSpeedHeading","spiExplainerAccuracyHeading","spiExplainerLargeCompanyPreparationHeading","spiExplainerAccuracyTargetHeading","spiExplainerHighScoreCaveatHeading","spiExplainerOtherTestsHeading","spiExplainerPreparationHeading","spiExplainerDavidAdviceHeading"] as const

function Section({ index, children }: { index: number; children: ReactNode }) {
  const ui = useStrings().learningUi
  const title = ui[SECTION_KEYS[index]!]
  return (
    <section className="spi-explainer__section" aria-labelledby={`spi-${index}`}>
      <h2 id={`spi-${index}`}>{title}</h2>
      {children}
    </section>
  )
}

function DavidCallout({ accessibleName, children }: { accessibleName: string; children: ReactNode }) {
  const ui = useStrings().learningUi

  return (
    <aside className="spi-explainer__david" aria-label={accessibleName}>
      <p className="spi-explainer__label">{ui.spiExplainerDavidPerspectiveLabel}</p>
      {children}
    </aside>
  )
}

/** Keeps the SPI explainer route description scoped to its mounted route lifetime. */
function useSpiExplainerDescription(): void {
  const descriptionText = useStrings().learningUi.spiExplainerMetaDescription
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const description = existing ?? document.createElement('meta')
    const created = existing === null
    if (created) {
      description.name = 'description'
      document.head.append(description)
    }
    const previous = description.content
    description.content = descriptionText
    return () => {
      if (created) description.remove()
      else description.content = previous
    }
  }, [descriptionText])
}

export function SpiExplainerPage() {
  const ui = useStrings().learningUi

  useDocumentTitle(ui.spiExplainerDocumentTitle)
  useSpiExplainerDescription()

  return (
    <article className="spi-explainer" lang={getActiveLocale()} aria-labelledby="spi-explainer-title">
      <header className="spi-explainer__hero">
        <p className="spi-explainer__eyebrow" lang={getActiveLocale()}>{ui.spiExplainerHeroEyebrow}</p>
        <h1 id="spi-explainer-title">{ui.spiExplainerHeroTitle}</h1>
        <p className="spi-explainer__dek">{ui.spiExplainerHeroDescription}</p>
        <p>{ui.spiExplainerCareerChangeIntroduction}</p>
        <DavidCallout accessibleName={ui.spiExplainerSelectionImpactAccessibleName}>
          <p>{ui.spiExplainerPreparationAnecdote}</p>
          <p>{ui.spiExplainerInterviewOpportunityLead}<strong>{ui.spiExplainerInterviewOpportunityEmphasis}</strong></p>
        </DavidCallout>
        <p>{ui.spiExplainerEarlyPreparationAdvice}</p>
      </header>

      <aside className="spi-explainer__source-note">
        <strong>{ui.spiExplainerEditorialNoteTitle}</strong>
        <span>{ui.spiExplainerEditorialNoteBody}</span>
      </aside>

      <div className="spi-explainer__sections">
        <Section index={0}>
          <p>{ui.spiExplainerDefinitionBody}</p>
        </Section>

        <Section index={1}>
          <p>{ui.spiExplainerAssessmentBody}</p>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>{ui.spiExplainerAssessmentFieldColumn}</th><th>{ui.spiExplainerAssessmentContentColumn}</th></tr></thead><tbody><tr><th scope="row">{ui.spiExplainerAbilityTestLabel}</th><td>{ui.spiExplainerAbilityTestDescription}</td></tr><tr><th scope="row">{ui.spiExplainerPersonalityTestLabel}</th><td>{ui.spiExplainerPersonalityTestDescription}</td></tr></tbody></table></div>
        </Section>

        <Section index={2}>
          <p>{ui.spiExplainerVariantsBody}</p>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>{ui.spiExplainerVariantTypeColumn}</th><th>{ui.spiExplainerVariantAudienceColumn}</th><th>{ui.spiExplainerVariantContentColumn}</th></tr></thead><tbody><tr><th scope="row">SPI-U</th><td>{ui.spiExplainerUniversityGraduateAudience}</td><td>{ui.spiExplainerVariantContentDescription}</td></tr><tr><th scope="row">SPI-G</th><td>{ui.spiExplainerMidCareerAudience}</td><td>{ui.spiExplainerVariantContentDescription}</td></tr><tr><th scope="row">SPI-H</th><td>{ui.spiExplainerHighSchoolGraduateAudience}</td><td>{ui.spiExplainerVariantContentDescription}</td></tr></tbody></table></div>
          <p className="spi-explainer__warning">{ui.spiExplainerMidCareerPreparationWarning}</p>
        </Section>

        <Section index={3}>
          <p>{ui.spiExplainerDeliveryBody}</p>
          <ul className="spi-explainer__chips"><li>{ui.spiExplainerTestCenterLabel}</li><li>{ui.spiExplainerInHouseCbtLabel}</li><li>{ui.spiExplainerWebTestingLabel}</li><li>{ui.spiExplainerPaperTestingLabel}</li></ul>
        </Section>

        <Section index={4}>
          <div className="spi-explainer__table-wrap">
            <table>
              <caption>{ui.spiExplainerDurationTableCaption}</caption>
              <thead><tr><th scope="col">{ui.spiExplainerDurationItemColumn}</th><th scope="col">{ui.spiExplainerDurationDescriptionColumn}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{ui.spiExplainerPersonalityTestLabel}</th><td>{ui.spiExplainerPersonalityTestDuration}</td></tr>
                <tr><th scope="row">{ui.spiExplainerAbilityTestLabel}</th><td>{ui.spiExplainerAbilityTestDuration}</td></tr>
                <tr><th scope="row">{ui.spiExplainerActualDurationLabel}</th><td>{ui.spiExplainerActualDurationDescription}</td></tr>
                <tr><th scope="row">{ui.spiExplainerDurationEditorialNoteLabel}</th><td>{ui.spiExplainerDurationEditorialNoteBody}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="spi-explainer__source">{ui.spiExplainerDurationSource}</p>
        </Section>

        <Section index={5}>
          <p>{ui.spiExplainerSpeedAccuracyBody}</p>
        </Section>

        <Section index={6}>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>JLPT</th><th>SPI</th></tr></thead><tbody><tr><td>{ui.spiExplainerJlptKnowledgeComparison}</td><td>{ui.spiExplainerSpiAppliedSkillsComparison}</td></tr><tr><td>{ui.spiExplainerJlptPacingComparison}</td><td>{ui.spiExplainerSpiTimePressureComparison}</td></tr></tbody></table></div>
          <p className="spi-explainer__pullquote">{ui.spiExplainerJlptSpiComparisonQuote}</p>
        </Section>

        <Section index={7}>
          <p>{ui.spiExplainerPracticeTopicsBody}</p>
          <p>{ui.spiExplainerForeignLearnerDifficultyBody}<strong>{ui.spiExplainerN1ScoreCaveat}</strong></p>
        </Section>

        <Section index={8}>
          <div className="spi-explainer__translation"><p><strong>{ui.spiExplainerNativeSpeakerLabel}</strong><br />{ui.spiExplainerNativeSpeakerProcess}</p><p><strong>{ui.spiExplainerTranslatingApplicantLabel}</strong><br />{ui.spiExplainerTranslatingApplicantProcess}</p></div>
          <p>{ui.spiExplainerDirectComprehensionAdvice}</p>
        </Section>

        <Section index={9}>
          <p>{ui.spiExplainerSpeedBody}</p>
        </Section>

        <Section index={10}>
          <p>{ui.spiExplainerAccuracyBody}</p>
        </Section>

        <Section index={11}>
          <p>{ui.spiExplainerScreeningBody}</p>
          <DavidCallout accessibleName={ui.spiExplainerScreeningOutcomeAccessibleName}>
            <p>{ui.spiExplainerScreeningOutcomeAnecdote}</p>
            <p>{ui.spiExplainerScreeningOutcomeLead}<strong>{ui.spiExplainerScreeningOutcomeEmphasis}</strong></p>
          </DavidCallout>
        </Section>

        <Section index={12}>
          <p>{ui.spiExplainerAccuracyTargetBody}</p>
        </Section>

        <Section index={13}>
          <p>{ui.spiExplainerHighScoreCaveatBody}</p>
        </Section>

        <Section index={14}>
          <p>{ui.spiExplainerOtherTestsBody}</p>
          <ul className="spi-explainer__chips"><li>SPI</li><li>玉手箱</li><li>TG-WEB</li><li>CAB</li><li>GAB</li></ul>
        </Section>

        <Section index={15}>
          <p>{ui.spiExplainerPreparationIntroduction}</p>
          <ul className="spi-explainer__skills"><li>{ui.spiExplainerReadingVocabularySkill}</li><li>{ui.spiExplainerReasoningConditionsSkill}</li><li>{ui.spiExplainerMentalArithmeticSkill}</li><li>{ui.spiExplainerFormulasChartsSkill}</li></ul>
          <p>{ui.spiExplainerShortPracticeAdvice}</p>
        </Section>

        <Section index={16}>
          <p>{ui.spiExplainerN1AdviceLead}<strong>{ui.spiExplainerN1AdviceEmphasis}</strong></p>
          <p>{ui.spiExplainerEmployerSkillsAdvice}</p>
          <p className="spi-explainer__pullquote">{ui.spiExplainerN1SpiAdviceQuote}</p>
          <p>{ui.spiExplainerInterviewOpportunityBody}</p>
          <DavidCallout accessibleName={ui.spiExplainerPreparationStartAccessibleName}>
            <p>{ui.spiExplainerPreparationStartAdvice}</p>
          </DavidCallout>
          <p className="spi-explainer__closing">{ui.spiExplainerClosingStatement}</p>
        </Section>
      </div>

      <footer className="spi-explainer__sources" aria-label={ui.spiExplainerSourcesHeading}>
        <h2>{ui.spiExplainerSourcesHeading}</h2>
        <p>{ui.spiExplainerSourcesEditorialNote}</p>
        <ul>
          <li><a href="https://www.spi.recruit.co.jp/" target="_blank" rel="noreferrer">{ui.spiExplainerOfficialWebsiteLink}</a></li>
          <li><a href="https://www.spi.recruit.co.jp/spi3/faq/" target="_blank" rel="noreferrer">{ui.spiExplainerFaqLink}</a></li>
          <li><a href="https://www.spi.recruit.co.jp/lp/spi_lp01a.html" target="_blank" rel="noreferrer">{ui.spiExplainerOverviewDurationLink}</a></li>
          <li><a href="https://www.spi.recruit.co.jp/testcenter/" target="_blank" rel="noreferrer">{ui.spiExplainerTestCenterLink}</a></li>
        </ul>
      </footer>

      <footer className="spi-explainer__cta">
        <p className="spi-explainer__label" lang={getActiveLocale()}>{ui.spiExplainerPracticeCtaEyebrow}</p>
        <h2>{ui.spiExplainerPracticeCtaTitle}</h2>
        <Link className="btn btn--primary" to="/practice/web-test">{ui.webTitle}</Link>
      </footer>
    </article>
  )
}
