import { useStrings, getActiveLocale } from '../i18n/strings'
import type { LearningUiStrings } from '../i18n/learningUi'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import catalogDocument from '../practice-web-test/released-discovery-catalog.json'
import {
  findPracticeDiscoveryCategory,
  findPracticeDiscoveryDomain,
  findPracticeDiscoveryFamily,
  practiceDiscoveryCategoryLabel,
  practiceDiscoveryFamilyLabel,
  validatePracticeDiscoveryCatalog,
  type PracticeDiscoveryCategory,
  type PracticeDiscoveryDomain,
  type PracticeDiscoveryFamily,
  type PracticeDiscoveryMode,
} from '../practice-web-test/discoveryCatalog'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NotFoundPage } from './NotFoundPage'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { fetchPracticePayload, submitPracticeAttempt, type PracticeAttemptInput } from '../practice-web-test/client'
import { resolveQuestionCheckpoints, scoreAnswer, selectableQuestions, scoreQuestion, supportOverlay, type RunnerResponse, type RuntimeQuestion } from '../practice-web-test/runtime'
import type { PracticeRepresentation } from '../practice-web-test/contract'
import type { PracticeAnswer } from '../practice-web-test/contract'

const catalog = validatePracticeDiscoveryCatalog(catalogDocument) ? catalogDocument : null



type RunnerPersistence = 'pending' | 'saved' | 'failed' | 'signed-out' | 'forbidden' | 'missing' | 'stale' | 'invalid' | 'invalid-response-time'
type RunnerAnswer = { questionId: string; questionVersion: number; correct: boolean; category: string; checkpointMeasured: number; checkpointMisses: number; elapsedMs: number; persistence: RunnerPersistence }
type RunnerQuestionIdentity = { id: string; version: number }
type RunnerRetryContext = {
  scopeKey: string
  answerIndex: number
  questionPrefix: RunnerQuestionIdentity[]
  checkpointIdentities: RunnerQuestionIdentity[]
  answers: RunnerAnswer[]
}

function sameQuestionIdentities(left: RunnerQuestionIdentity[], right: RunnerQuestionIdentity[]): boolean {
  return left.length === right.length && left.every((identity, index) =>
    identity.id === right[index]?.id && identity.version === right[index]?.version)
}

function labelForFamily(testFamily: string): string {
  return catalog ? practiceDiscoveryFamilyLabel(catalog.releaseIdentity.contentId, testFamily) ?? '' : ''
}

function labelForCategory(
  testFamily: string,
  domain: PracticeDiscoveryDomain['domain'],
  category: PracticeDiscoveryCategory,
): string {
  return catalog
    ? practiceDiscoveryCategoryLabel(catalog.releaseIdentity.contentId, testFamily, domain, category.category, getActiveLocale()) ?? ''
    : ''
}

function titleFor(...parts: string[]): string {
  return `${parts.join('｜')} — Business Japanese Hub`
}

function CatalogUnavailable() {
  return <NotFoundPage />
}

function reloadCurrentDocument(): void {
  globalThis.location.reload()
}

/** Keeps the Web Test route description scoped to its mounted route lifetime. */
function useWebTestDescription(): void {
  const descriptionText = useStrings().learningUi.webDescription
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

export function WebTestHubPage() {
  const ui = useStrings().learningUi

  useDocumentTitle(ui.webDocumentTitle)
  useWebTestDescription()
  if (!catalog) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang={getActiveLocale()} aria-labelledby="web-test-hub-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang={getActiveLocale()}>{ui.webEyebrow}</p>
        <h1 className="page__title" id="web-test-hub-title">{ui.webTitle}</h1>
        <p className="page__lead">
          {ui.webLead}</p>
        <p className="web-test-hub__explainer-hint">
          <Link to="/practice/web-test/about-spi">{ui.webExplainerLink}</Link>
        </p>
      </div>

      <section className="web-test-hub__families" aria-labelledby="web-test-family-title">
        <h2 id="web-test-family-title">{ui.webChooseTest}</h2>
        <ul>
          {catalog.families.map((family) => (
            <li key={family.testFamily}>
              <Link className="web-test-hub__family-link" to={`/practice/web-test/${family.testFamily}`}>
                <span className="web-test-hub__family-title">{labelForFamily(family.testFamily)}</span>
                <span>{releasedCount(family)} {ui.webPublishedCountSuffix}</span>
                <span>{ui.webChooseVerbal}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="web-test-hub__disclaimer">
        {ui.webDisclaimer}</p>
    </section>
  )
}

export function WebTestFamilyPage() {
  const ui = useStrings().learningUi

  const { family: familyParam } = useParams()
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  useDocumentTitle(family ? titleFor(labelForFamily(family.testFamily), ui.webTitle) : ui.pageNotFound)
  if (!catalog || !family) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang={getActiveLocale()} aria-labelledby="web-test-family-page-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang={getActiveLocale()}>{ui.practicePrefix} {labelForFamily(family.testFamily)}</p>
        <h1 className="page__title" id="web-test-family-page-title">{labelForFamily(family.testFamily)}</h1>
        <p className="page__lead">{ui.webDomainLead}</p>
      </div>
      <section className="web-test-hub__families" aria-labelledby="web-test-domain-title">
        <h2 id="web-test-domain-title">{ui.webChooseDomain}</h2>
        <ul>
          {family.domains.map((domain) => (
            <li key={domain.domain}>
              <Link className="web-test-hub__family-link" to={`/practice/web-test/${family.testFamily}/${domain.domain}`}>
                <span className="web-test-hub__family-title">{(domain.domain === 'verbal' ? ui.webVerbal : ui.webNonverbal)}</span>
                <span>{releasedCount(domain)} {ui.webPublishedCountSuffix}</span>
                <span>{ui.webBrowseCategories}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <Link className="page__action" to="/practice/web-test">{ui.webBackToTests}</Link>
    </section>
  )
}

export function WebTestCategoryPage() {
  const ui = useStrings().learningUi

  const { family: familyParam, domain: domainParam } = useParams()
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  const domain = catalog && findPracticeDiscoveryDomain(catalog, familyParam, domainParam)
  useDocumentTitle(
    family && domain
      ? titleFor((domain.domain === 'verbal' ? ui.webVerbal : ui.webNonverbal), labelForFamily(family.testFamily), ui.webTitle)
      : ui.pageNotFound,
  )
  if (!catalog || !family || !domain) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang={getActiveLocale()} aria-labelledby="web-test-category-page-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang={getActiveLocale()}>{ui.practicePrefix} {labelForFamily(family.testFamily)} · {(domain.domain === 'verbal' ? ui.webVerbal : ui.webNonverbal)}</p>
        <h1 className="page__title" id="web-test-category-page-title">{(domain.domain === 'verbal' ? ui.webVerbal : ui.webNonverbal)}</h1>
        <p className="page__lead">{ui.webCategoryLead}</p>
      </div>
      <section className="web-test-hub__families" aria-labelledby="web-test-category-title">
        <h2 id="web-test-category-title">{ui.webChooseCategory}</h2>
        <ul>
          {domain.categories.map((category) => (
            <li className="web-test-hub__category" key={category.category}>
              <h3>{labelForCategory(family.testFamily, domain.domain, category)}</h3>
              <p>{category.releasedCount} {ui.webPublishedCountSuffix}</p>
              <ul className="web-test-hub__mode-list">
                {category.modes.map((mode) => (
                  <li key={mode}>
                    <Link to={runnerEntryHref(family.testFamily, domain.domain, category.category, mode)}>
                      {(mode === 'untimed-learning' ? ui.webUntimed : ui.webTimed)}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <Link className="page__action" to={`/practice/web-test/${family.testFamily}`}>{ui.webBackToDomains}</Link>
    </section>
  )
}

/**
 * Stable direct-load handoff for #116. It names a released selection but does
 * not fetch, render, or infer access to proprietary question content.
 */
export function WebTestRunnerEntryPage() {
  const ui = useStrings().learningUi

  const { family: familyParam, domain: domainParam, category: categoryParam } = useParams()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  const reviewQuestionId = searchParams.get('review')
  const reviewVersionParam = searchParams.get('reviewVersion')
  const reviewVersion = reviewVersionParam === null ? null : Number(reviewVersionParam)
  const hasReviewParams = searchParams.has('review') || searchParams.has('reviewVersion')
  const validReview = !hasReviewParams || (
    searchParams.has('review') && searchParams.has('reviewVersion') &&
    typeof reviewQuestionId === 'string' && reviewQuestionId.length > 0 && reviewQuestionId.length <= 128 && reviewQuestionId.trim() === reviewQuestionId &&
    reviewVersion !== null && Number.isSafeInteger(reviewVersion) && reviewVersion > 0
  )
  const searchKeys = [...searchParams.keys()]
  const validSearch = validReview && searchKeys.length === (hasReviewParams ? 3 : 1) &&
    searchKeys.includes('mode') && (!hasReviewParams || (searchKeys.includes('review') && searchKeys.includes('reviewVersion')))
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  const domain = catalog && findPracticeDiscoveryDomain(catalog, familyParam, domainParam)
  const category = catalog && findPracticeDiscoveryCategory(catalog, familyParam, domainParam, categoryParam)
  const validMode = typeof mode === 'string' && category?.modes.includes(mode as PracticeDiscoveryMode)
  const { user, loading: authLoading, getAccessToken } = useAuth()
  const [state, setState] = useState<RunnerState>({ kind: 'idle' })
  const [index, setIndex] = useState(0)
  const [response, setResponse] = useState<RunnerResponse>('')
  const [answers, setAnswers] = useState<RunnerAnswer[]>([])
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [lastExplanation, setLastExplanation] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ question: RuntimeQuestion; correct: boolean } | null>(null)
  const [checkpointIndex, setCheckpointIndex] = useState<number | null>(null)
  const [checkpointResponse, setCheckpointResponse] = useState<RunnerResponse>('')
  const [checkpointFeedback, setCheckpointFeedback] = useState<boolean | null>(null)
  const [persistence, setPersistence] = useState<'idle' | RunnerPersistence>('idle')
  const [retryAvailable, setRetryAvailable] = useState(false)
  const answersRef = useRef<RunnerAnswer[]>([])
  const startedAt = useRef<number>(0)
  const questionHeadingRef = useRef<HTMLHeadingElement>(null)
  const feedbackHeadingRef = useRef<HTMLHeadingElement>(null)
  const completionHeadingRef = useRef<HTMLHeadingElement>(null)
  const checkpointHeadingRef = useRef<HTMLHeadingElement>(null)
  const checkpointAdvanceFocusRef = useRef(false)
  const checkpointResponsesRef = useRef<PracticeAttemptInput['checkpointResponses']>([])
  const lastAttemptRef = useRef<PracticeAttemptInput | null>(null)
  const lastAttemptAnswerIndexRef = useRef<number | null>(null)
  const lastAttemptUserIdRef = useRef<string | null>(null)
  const lastAttemptScopeKeyRef = useRef<string | null>(null)
  const lastAttemptPersistenceRef = useRef<RunnerPersistence | null>(null)
  const retryContextRef = useRef<RunnerRetryContext | null>(null)
  const primaryElapsedMsRef = useRef<number | null>(null)
  const persistenceGenerationRef = useRef(0)
  const userId = user?.id
  const selectionKey = [catalog?.releaseIdentity.revision ?? '', family?.testFamily ?? '', domain?.domain ?? '', category?.category ?? '', mode ?? '', reviewQuestionId ?? '', reviewVersionParam ?? '', userId ?? ''].join('|')
  const selectionScopeKey = [catalog?.releaseIdentity.revision ?? '', family?.testFamily ?? '', domain?.domain ?? '', category?.category ?? '', mode ?? '', reviewQuestionId ?? '', reviewVersionParam ?? ''].join('|')
  const updateAnswers = (update: (current: RunnerAnswer[]) => RunnerAnswer[]) => {
    const next = update(answersRef.current)
    answersRef.current = next
    setAnswers(next)
  }
  useEffect(() => {
    persistenceGenerationRef.current += 1
    let cancelled = false
    if (!catalog || !family || !domain || !category || !validSearch || !validMode) return
    const pendingRetry = lastAttemptRef.current !== null &&
      lastAttemptAnswerIndexRef.current !== null &&
      lastAttemptUserIdRef.current !== null &&
      lastAttemptScopeKeyRef.current === selectionScopeKey &&
      (userId === undefined || userId === lastAttemptUserIdRef.current) &&
      (lastAttemptPersistenceRef.current === 'pending' || lastAttemptPersistenceRef.current === 'failed' || lastAttemptPersistenceRef.current === 'signed-out' || lastAttemptPersistenceRef.current === 'forbidden')
    if (!pendingRetry) {
      lastAttemptRef.current = null
      lastAttemptAnswerIndexRef.current = null
      lastAttemptUserIdRef.current = null
      lastAttemptScopeKeyRef.current = null
      lastAttemptPersistenceRef.current = null
      retryContextRef.current = null
    }
    setRetryAvailable(userId !== undefined && pendingRetry)
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setState({ kind: userId ? 'loading' : 'idle' })
      setIndex(0)
      setResponse('')
      setAnswers([])
      answersRef.current = []
      setFeedback(null)
      setCheckpointIndex(null)
      setCheckpointResponse('')
      setCheckpointFeedback(null)
      setPersistence('idle')
      setLastCorrect(null)
      setLastExplanation(null)
      startedAt.current = 0
      checkpointResponsesRef.current = []
      primaryElapsedMsRef.current = null
      const restoredPersistence = lastAttemptPersistenceRef.current === 'pending' ? 'failed' : lastAttemptPersistenceRef.current ?? 'failed'
      setPersistence(userId && pendingRetry ? restoredPersistence : 'idle')
      if (authLoading || !userId) return
      const result = await fetchPracticePayload(catalog.releaseIdentity.contentId, catalog.releaseIdentity.revision, getAccessToken, userId)
      if (cancelled) return
      if (result.kind !== 'ok') { setState({ kind: result.kind }); return }
      const questions = selectableQuestions(result.payload, family!.testFamily, domain!.domain, category!.category, mode!)
      if (questions.length === 0) { setState({ kind: 'unavailable' }); return }
      const selectedQuestions = reviewQuestionId === null
        ? questions
        : questions.filter((entry) => entry.id === reviewQuestionId && entry.version === reviewVersion)
      if (selectedQuestions.length === 0) { setState({ kind: 'stale-review' }); return }
      if (selectedQuestions.some((entry) => resolveQuestionCheckpoints(result.payload, entry) === null)) { setState({ kind: 'unavailable' }); return }
      const retryAttempt = pendingRetry ? lastAttemptRef.current : null
      const retryContext = pendingRetry ? retryContextRef.current : null
      if (retryAttempt && retryContext && retryContext.scopeKey === selectionScopeKey) {
        const retryQuestion = selectedQuestions[retryContext.answerIndex]
        const checkpoints = retryQuestion ? resolveQuestionCheckpoints(result.payload, retryQuestion) ?? [] : []
        const currentPrefix = selectedQuestions.slice(0, retryContext.answerIndex + 1).map(({ id, version }) => ({ id, version }))
        const checkpointIdentities = checkpoints.map(({ id, version }) => ({ id, version }))
        const checkpointResponses = retryAttempt.checkpointResponses ?? []
        const validCheckpointResponses = checkpointResponses.length === checkpoints.length && checkpointResponses.every((checkpointResponse, checkpointIndex) =>
          checkpointResponse.checkpointId === checkpoints[checkpointIndex]?.id &&
          checkpointResponse.checkpointVersion === checkpoints[checkpointIndex]?.version)
        const validRetryContext = Boolean(retryQuestion &&
          retryQuestion.id === retryAttempt.questionId && retryQuestion.version === retryAttempt.questionVersion &&
          retryContext.answers.length === retryContext.answerIndex + 1 &&
          sameQuestionIdentities(retryContext.questionPrefix, currentPrefix) &&
          sameQuestionIdentities(retryContext.questionPrefix, retryContext.answers.map(({ questionId, questionVersion }) => ({ id: questionId, version: questionVersion }))) &&
          sameQuestionIdentities(retryContext.checkpointIdentities, checkpointIdentities) &&
          validCheckpointResponses)
        if (validRetryContext && retryQuestion) {
          const retryResponse = retryAttempt.answer
          const correct = scoreQuestion(retryQuestion, retryResponse)
          const restoredAnswers = retryContext.answers.map((answer, answerIndex) => answerIndex === retryContext.answerIndex
            ? { ...answer, persistence: restoredPersistence }
            : answer)
          const finalCheckpointResponse = checkpointResponses.at(-1)
          const finalCheckpoint = checkpoints.at(-1)
          setIndex(retryContext.answerIndex)
          setAnswers(restoredAnswers)
          answersRef.current = restoredAnswers
          setResponse(retryResponse)
          setFeedback({ question: retryQuestion, correct })
          setLastCorrect(correct)
          setLastExplanation(retryQuestion.coreExplanation.concise)
          setCheckpointIndex(finalCheckpoint ? checkpoints.length - 1 : null)
          setCheckpointResponse(finalCheckpointResponse?.response ?? '')
          setCheckpointFeedback(finalCheckpoint && finalCheckpointResponse
            ? scoreAnswer(finalCheckpoint.answer, finalCheckpointResponse.response)
            : null)
          checkpointResponsesRef.current = checkpointResponses
          primaryElapsedMsRef.current = retryAttempt.responseTimeMs
          setPersistence(restoredPersistence)
          setRetryAvailable(true)
          startedAt.current = Date.now()
        } else {
          lastAttemptRef.current = null
          lastAttemptAnswerIndexRef.current = null
          lastAttemptUserIdRef.current = null
          lastAttemptScopeKeyRef.current = null
          lastAttemptPersistenceRef.current = null
          retryContextRef.current = null
          setRetryAvailable(false)
          setPersistence('idle')
        }
      } else if (pendingRetry) {
        lastAttemptRef.current = null
        lastAttemptAnswerIndexRef.current = null
        lastAttemptUserIdRef.current = null
        lastAttemptScopeKeyRef.current = null
        lastAttemptPersistenceRef.current = null
        retryContextRef.current = null
        setRetryAvailable(false)
        setPersistence('idle')
      }
      setState({ kind: 'ready', payload: result.payload, questions: selectedQuestions, selectionKey })
      if (!(pendingRetry && retryContextRef.current) && selectedQuestions[0]?.answer.input.kind === 'ordering') setResponse(selectedQuestions[0].answer.input.choices.map((choice) => choice.id))
      startedAt.current = Date.now()
    })
    return () => { cancelled = true; persistenceGenerationRef.current += 1 }
  }, [authLoading, userId, getAccessToken, selectionKey, selectionScopeKey, family, domain, category, mode, reviewQuestionId, reviewVersion, validMode, validReview, validSearch])
  const question = state.kind === 'ready' ? state.questions[index] : undefined
  const finish = index >= (state.kind === 'ready' ? state.questions.length : 0)
  useEffect(() => {
    if (checkpointAdvanceFocusRef.current && checkpointIndex !== null) {
      checkpointAdvanceFocusRef.current = false
      checkpointHeadingRef.current?.focus()
    } else if (feedback && checkpointFeedback === null) feedbackHeadingRef.current?.focus()
    else if (checkpointIndex !== null) checkpointHeadingRef.current?.focus()
    else if (feedback) feedbackHeadingRef.current?.focus()
    else if (question) questionHeadingRef.current?.focus()
    else if (finish) completionHeadingRef.current?.focus()
  }, [feedback, checkpointFeedback, checkpointIndex, question, question?.id, finish])
  useDocumentTitle(
    family && domain && category && validSearch && validMode
      ? titleFor(labelForCategory(family.testFamily, domain.domain, category), (domain.domain === 'verbal' ? ui.webVerbal : ui.webNonverbal), labelForFamily(family.testFamily))
      : ui.pageNotFound,
  )
  if (!catalog || !family || !domain || !category || !validSearch || !validMode) return <CatalogUnavailable />

  const viewState = !authLoading && !user
    ? { kind: 'signed-out' as const }
    : state.kind === 'ready' && state.selectionKey !== selectionKey
      ? { kind: 'loading' as const }
      : state
  const persistAttempt = async (attempt: PracticeAttemptInput, answerIndex: number) => {
    const generation = ++persistenceGenerationRef.current
    const operationSelectionKey = selectionKey
    const operationUserId = userId
    if (!operationUserId) {
      setPersistence('failed')
      setRetryAvailable(false)
      return
    }
    lastAttemptRef.current = attempt
    lastAttemptAnswerIndexRef.current = answerIndex
    lastAttemptUserIdRef.current = operationUserId
    lastAttemptScopeKeyRef.current = selectionScopeKey
    lastAttemptPersistenceRef.current = 'pending'
    if (state.kind === 'ready' && state.questions[answerIndex]?.id === attempt.questionId && state.questions[answerIndex]?.version === attempt.questionVersion) {
      const retryQuestion = state.questions[answerIndex]!
      const checkpoints = resolveQuestionCheckpoints(state.payload, retryQuestion) ?? []
      retryContextRef.current = {
        scopeKey: selectionScopeKey,
        answerIndex,
        questionPrefix: state.questions.slice(0, answerIndex + 1).map(({ id, version }) => ({ id, version })),
        checkpointIdentities: checkpoints.map(({ id, version }) => ({ id, version })),
        answers: answersRef.current.map((answer) => ({ ...answer })),
      }
    }
    setRetryAvailable(true)
    setPersistence('pending')
    const result = await submitPracticeAttempt(attempt, getAccessToken, operationUserId)
    if (generation !== persistenceGenerationRef.current || operationSelectionKey !== selectionKey || operationUserId !== userId) return
    const status: RunnerPersistence = result.kind === 'ok' ? 'saved' : result.kind === 'invalid-response-time' ? 'invalid-response-time' : result.kind === 'stale' ? 'stale' : result.kind === 'invalid' ? 'invalid' : result.kind === 'signed-out' ? 'signed-out' : result.kind === 'forbidden' ? 'forbidden' : result.kind === 'missing' ? 'missing' : 'failed'
    lastAttemptPersistenceRef.current = status
    if (status !== 'failed' && status !== 'signed-out' && status !== 'forbidden') {
      lastAttemptRef.current = null
      lastAttemptAnswerIndexRef.current = null
      lastAttemptUserIdRef.current = null
      lastAttemptScopeKeyRef.current = null
      lastAttemptPersistenceRef.current = null
      retryContextRef.current = null
      setRetryAvailable(false)
    } else {
      setRetryAvailable(true)
    }
    setPersistence(status)
    updateAnswers((current) => current.map((answer, index) => index === answerIndex ? { ...answer, persistence: status } : answer))
  }
  const retryPersist = () => {
    if (lastAttemptRef.current && lastAttemptAnswerIndexRef.current !== null && lastAttemptUserIdRef.current === userId && lastAttemptScopeKeyRef.current === selectionScopeKey) void persistAttempt(lastAttemptRef.current, lastAttemptAnswerIndexRef.current)
  }
  const attemptId = () => globalThis.crypto.randomUUID()
  return (
      <section className="page web-test-hub" lang={getActiveLocale()} aria-labelledby="web-test-runner-entry-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang={getActiveLocale()}>{ui.practicePrefix} {labelForFamily(family.testFamily)} · {(domain.domain === 'verbal' ? ui.webVerbal : ui.webNonverbal)}</p>
        <h1 className="page__title" id="web-test-runner-entry-title">{labelForCategory(family.testFamily, domain.domain, category)}</h1>
        <p className="page__lead">{(mode === 'untimed-learning' ? ui.webUntimed : ui.webTimed)} · {category.releasedCount} {ui.webPublishedCountSuffix}</p>
      </div>
      <RunnerStateView questionHeadingRef={questionHeadingRef} feedbackHeadingRef={feedbackHeadingRef} completionHeadingRef={completionHeadingRef} checkpointHeadingRef={checkpointHeadingRef} categoryLabel={labelForCategory(family.testFamily, domain.domain, category)} state={viewState} finish={finish} question={question} response={response} answers={answers} feedback={feedback} checkpointIndex={checkpointIndex} checkpointResponse={checkpointResponse} checkpointFeedback={checkpointFeedback} persistence={persistence} canRetryPersist={retryAvailable} lastCorrect={lastCorrect} lastExplanation={lastExplanation} setResponse={setResponse} setCheckpointResponse={setCheckpointResponse} onRetryPersist={retryPersist} onSubmit={() => {
        if (!question || state.kind !== 'ready' || response === '') return
        const correct = scoreQuestion(question, response)
        const primaryElapsedMs = Date.now() - startedAt.current
        primaryElapsedMsRef.current = primaryElapsedMs
        setLastCorrect(correct)
        setLastExplanation(question.coreExplanation.concise)
        setFeedback({ question, correct })
        const checkpoints = state.kind === 'ready' ? resolveQuestionCheckpoints(state.payload, question) ?? [] : []
        setCheckpointIndex(checkpoints.length > 0 ? 0 : null)
        setCheckpointResponse(checkpoints.length > 0 ? initialResponse(checkpoints[0]!.answer) : '')
        setCheckpointFeedback(null)
        checkpointResponsesRef.current = []
        setPersistence('idle')
        updateAnswers((current) => [...current, { questionId: question.id, questionVersion: question.version, correct, category: question.category, checkpointMeasured: 0, checkpointMisses: 0, elapsedMs: primaryElapsedMs, persistence: 'pending' }])
        if (checkpoints.length === 0) void persistAttempt({ contentId: catalog.releaseIdentity.contentId, revision: catalog.releaseIdentity.revision, questionId: question.id, questionVersion: question.version, answer: response, responseTimeMs: primaryElapsedMs, clientIdempotencyKey: attemptId() }, answers.length)
      }} onCheckpointSubmit={() => {
        if (state.kind !== 'ready' || !question || checkpointIndex === null || checkpointFeedback !== null) return
        const checkpoint = resolveQuestionCheckpoints(state.payload, question)?.[checkpointIndex]
        if (!checkpoint || checkpointResponse === '') return
        const correct = scoreAnswer(checkpoint.answer, checkpointResponse)
        checkpointResponsesRef.current = [...(checkpointResponsesRef.current ?? []), { checkpointId: checkpoint.id, checkpointVersion: checkpoint.version, response: checkpointResponse }]
        setCheckpointFeedback(correct)
        updateAnswers((current) => current.map((answer, position) => position === current.length - 1 ? { ...answer, checkpointMeasured: answer.checkpointMeasured + 1, checkpointMisses: answer.checkpointMisses + (correct ? 0 : 1) } : answer))
        const checkpoints = resolveQuestionCheckpoints(state.payload, question) ?? []
        if (checkpointIndex + 1 >= checkpoints.length) void persistAttempt({ contentId: catalog.releaseIdentity.contentId, revision: catalog.releaseIdentity.revision, questionId: question.id, questionVersion: question.version, answer: response, responseTimeMs: primaryElapsedMsRef.current ?? 0, clientIdempotencyKey: attemptId(), checkpointResponses: checkpointResponsesRef.current }, answers.length - 1)
      }} onCheckpointNext={() => {
        if (state.kind !== 'ready' || !question || checkpointIndex === null) return
        const checkpoints = resolveQuestionCheckpoints(state.payload, question) ?? []
        if (checkpointIndex + 1 >= checkpoints.length && persistence !== 'saved' && persistence !== 'invalid-response-time') return
        if (checkpointIndex + 1 < checkpoints.length) {
          checkpointAdvanceFocusRef.current = true
          setCheckpointIndex(checkpointIndex + 1)
          setCheckpointResponse(initialResponse(checkpoints[checkpointIndex + 1]!.answer))
          setCheckpointFeedback(null)
          setPersistence('idle')
        } else {
          persistenceGenerationRef.current += 1
          lastAttemptRef.current = null
          lastAttemptAnswerIndexRef.current = null
          lastAttemptUserIdRef.current = null
          lastAttemptScopeKeyRef.current = null
          lastAttemptPersistenceRef.current = null
          setRetryAvailable(false)
          const nextQuestion = state.questions[index + 1]
          setIndex((current) => current + 1)
          setResponse(nextQuestion?.answer.input.kind === 'ordering' ? nextQuestion.answer.input.choices.map((choice) => choice.id) : '')
          setFeedback(null)
          setCheckpointIndex(null)
          setCheckpointResponse('')
          setCheckpointFeedback(null)
          checkpointResponsesRef.current = []
          setPersistence('idle')
          setLastCorrect(null)
          setLastExplanation(null)
          startedAt.current = Date.now()
        }
      }} onNext={() => {
        if (persistence !== 'saved' && persistence !== 'invalid-response-time') return
        persistenceGenerationRef.current += 1
        lastAttemptRef.current = null
        lastAttemptAnswerIndexRef.current = null
        lastAttemptUserIdRef.current = null
        lastAttemptScopeKeyRef.current = null
        lastAttemptPersistenceRef.current = null
        setRetryAvailable(false)
        const nextQuestion = state.kind === 'ready' ? state.questions[index + 1] : undefined
        setIndex((current) => current + 1)
        setResponse(nextQuestion?.answer.input.kind === 'ordering' ? nextQuestion.answer.input.choices.map((choice) => choice.id) : '')
        setFeedback(null)
        setCheckpointIndex(null)
        setCheckpointResponse('')
          setCheckpointFeedback(null)
          setPersistence('idle')
          primaryElapsedMsRef.current = null
        setLastCorrect(null)
        setLastExplanation(null)
        startedAt.current = Date.now()
      }} />
      <Link className="page__action" to={`/practice/web-test/${family.testFamily}/${domain.domain}`}>{ui.webBackToCategories}</Link>
    </section>
  )
}

type RunnerState = { kind: 'idle' | 'loading' | 'signed-out' | 'forbidden' | 'unavailable' | 'missing' | 'stale-review' } | { kind: 'ready'; payload: import('../content-delivery/privatePracticeQuestionBank').PracticeRuntimePayload; questions: RuntimeQuestion[]; selectionKey: string }

function RunnerStateView({ questionHeadingRef, feedbackHeadingRef, completionHeadingRef, checkpointHeadingRef, categoryLabel, state, finish, question, response, answers, feedback, checkpointIndex, checkpointResponse, checkpointFeedback, persistence, canRetryPersist, lastCorrect, lastExplanation, setResponse, setCheckpointResponse, onRetryPersist, onSubmit, onCheckpointSubmit, onCheckpointNext, onNext }: { questionHeadingRef: RefObject<HTMLHeadingElement | null>; feedbackHeadingRef: RefObject<HTMLHeadingElement | null>; completionHeadingRef: RefObject<HTMLHeadingElement | null>; checkpointHeadingRef: RefObject<HTMLHeadingElement | null>; categoryLabel: string; state: RunnerState; finish: boolean; question?: RuntimeQuestion; response: RunnerResponse; answers: RunnerAnswer[]; feedback: { question: RuntimeQuestion; correct: boolean } | null; checkpointIndex: number | null; checkpointResponse: RunnerResponse; checkpointFeedback: boolean | null; persistence: 'idle' | RunnerPersistence; canRetryPersist: boolean; lastCorrect: boolean | null; lastExplanation: string | null; setResponse: (value: RunnerResponse) => void; setCheckpointResponse: (value: RunnerResponse) => void; onRetryPersist: () => void; onSubmit: () => void; onCheckpointSubmit: () => void; onCheckpointNext: () => void; onNext: () => void }) {
  const ui = useStrings().learningUi

  if (state.kind === 'signed-out') return <section className="web-test-hub__runner-handoff"><h2>{ui.webSignInTitle}</h2><p>{ui.webSignInBody}</p></section>
  if (state.kind === 'forbidden') return <section className="web-test-hub__runner-handoff"><h2>{ui.webMembershipTitle}</h2><p>{ui.webMembershipBody}</p></section>
  if (state.kind === 'stale-review') return <section className="web-test-hub__runner-handoff"><h2>{ui.webStaleReviewTitle}</h2><p>{ui.webStaleReviewBody}</p></section>
  if (state.kind === 'missing' || state.kind === 'unavailable') return <section className="web-test-hub__runner-handoff"><h2>{ui.webUnavailableTitle}</h2><p>{ui.webUnavailableBody}</p></section>
  if (state.kind === 'idle' || state.kind === 'loading') return <section className="web-test-hub__runner-handoff"><h2>{ui.webLoadingTitle}</h2><p>{ui.webLoadingBody}</p></section>
  if (finish) {
    const categoryResults = Array.from(new Set(answers.map((answer) => answer.category))).map((category) => {
      const categoryAnswers = answers.filter((answer) => answer.category === category)
      return `${categoryLabel}：${categoryAnswers.filter((answer) => answer.correct).length}／${categoryAnswers.length}`
    })
    const correctCount = answers.filter((answer) => answer.correct).length
    const accuracy = answers.length === 0 ? 0 : Math.round((correctCount / answers.length) * 100)
    const measured = answers.reduce((total, answer) => total + answer.checkpointMeasured, 0)
    const misses = answers.reduce((total, answer) => total + answer.checkpointMisses, 0)
    const invalidCount = answers.filter((answer) => answer.persistence === 'invalid-response-time').length
    const completionPersistence = invalidCount > 0
      ? ui.webPartiallySaved
      : answers.length > 0 && answers.every((answer) => answer.persistence === 'saved')
        ? ui.webSaved
        : ui.webNotFullySaved
    return <section className="web-test-hub__runner-handoff"><h2 ref={completionHeadingRef} tabIndex={-1}>{ui.webFinished}</h2><p>{ui.webCompletionSummary(correctCount, answers.length, accuracy)} · {completionPersistence}</p>{categoryResults.map((result) => <p key={result}>{result}</p>)}<p>{ui.webElapsed(Math.round(answers.reduce((total, answer) => total + answer.elapsedMs, 0) / 1000))}</p><p>{measured > 0 ? ui.webCheckpointMisses(misses, measured) : ui.webCheckpointsInsufficient}</p></section>
  }
  if (state.kind !== 'ready' || !question) return null
  const answer = question.answer
  // V1 uses the Japanese core explanation; native-language support stays dormant.
  const overlay = getActiveLocale() === 'ja' ? undefined : supportOverlay(state.payload, question)
  const retryNotice = canRetryPersist && persistence === 'failed' ? <p role="alert">{ui.webSaveUncertain}<button type="button" onClick={onRetryPersist}>{ui.webRetrySave}</button></p>
    : canRetryPersist && persistence === 'signed-out' ? <p role="alert">{ui.webSessionExpired}<button type="button" onClick={onRetryPersist}>{ui.webRetrySave}</button></p>
      : canRetryPersist && persistence === 'forbidden' ? <p role="alert">{ui.webSaveMembershipUnavailable}<button type="button" onClick={onRetryPersist}>{ui.webRetrySave}</button></p>
        : null
  if (feedback?.question.id === question.id) {
    const checkpoints = state.kind === 'ready' ? resolveQuestionCheckpoints(state.payload, question) ?? [] : []
    const checkpoint = checkpointIndex === null ? undefined : checkpoints[checkpointIndex]
    return <section className="web-test-hub__runner" aria-live="polite"><p role="status">{feedback.correct ? ui.answerCorrect : ui.answerIncorrect}</p><h2 ref={feedbackHeadingRef} tabIndex={-1}>{ui.webAnswerExplanation}</h2><h3 lang="ja">{question.promptJa}</h3>{question.promptRepresentation && <RepresentationView representation={question.promptRepresentation} label={ui.webQuestionRepresentation} />}<p>{ui.webCorrectAnswerLabel}<span lang="ja">{answerLabel(answer)}</span></p><p lang="ja">{question.coreExplanation.concise}</p><p lang="ja">{question.coreExplanation.whatIsAskedJa}</p>{question.coreExplanation.representation && <RepresentationView representation={question.coreExplanation.representation} label={ui.webAnswerRepresentation} />}{overlay?.concise && <p lang="zh-TW">{overlay.concise}</p>}{overlay?.whatIsAsked && <p lang="zh-TW">{overlay.whatIsAsked}</p>}{overlay?.representationExplanation && <p lang="zh-TW">{overlay.representationExplanation}</p>}{overlay?.commonMisread && <p lang="zh-TW">{overlay.commonMisread}</p>}{overlay?.keyTerms?.map((term) => <p key={term.termId} lang="zh-TW"><span lang="ja">{term.surface}</span>：{term.meaning}{term.note && `（${term.note}）`}</p>)}{persistence === 'pending' && <p role="status">{ui.webSaving}</p>}{persistence === 'saved' && <p role="status">{ui.webSaved}</p>}{retryNotice}{persistence === 'missing' && <p role="alert">{ui.webMissingQuestion}<button type="button" onClick={reloadCurrentDocument}>{ui.webReloadQuestion}</button></p>}{persistence === 'stale' && <p role="alert">{ui.webUpdatedQuestion}<button type="button" onClick={reloadCurrentDocument}>{ui.webReloadQuestion}</button></p>}{persistence === 'invalid' && <p role="alert">{ui.webInvalidResponse}</p>}{persistence === 'invalid-response-time' && <p role="alert">{ui.webInvalidTime}</p>}{checkpoint && <section aria-labelledby="checkpoint-title"><h3 id="checkpoint-title" ref={checkpointHeadingRef} tabIndex={-1}>{ui.webCheckpointLabel}{checkpointIndex! + 1}</h3><p lang="ja">{checkpoint.promptJa}</p>{checkpointFeedback !== null ? <><p role="status">{checkpointFeedback ? ui.webCheckpointCorrect : ui.webCheckpointIncorrect}</p><button type="button" disabled={checkpointIndex! + 1 >= checkpoints.length && persistence !== 'saved' && persistence !== 'invalid-response-time'} onClick={onCheckpointNext}>{checkpointIndex! + 1 < checkpoints.length ? ui.webNextCheckpoint : ui.webNextQuestion}</button></> : <>{renderInput(checkpoint.answer, checkpointResponse, setCheckpointResponse, ui)}<button type="button" disabled={checkpointResponse === '' || (Array.isArray(checkpointResponse) && checkpointResponse.length === 0)} onClick={onCheckpointSubmit}>{ui.webSubmitCheckpoint}</button></>}</section>}{!checkpoint && <button type="button" disabled={persistence !== 'saved' && persistence !== 'invalid-response-time'} onClick={onNext}>{ui.webNextQuestion}</button>}</section>
  }
  return <section className="web-test-hub__runner" aria-live="polite">{persistence === 'pending' && <p role="status">{ui.webSaving}</p>}{persistence === 'saved' && <p role="status">{ui.webSaved}</p>}{retryNotice}{lastCorrect !== null && <p role="status">{lastCorrect ? ui.answerCorrect : ui.answerIncorrect}{lastExplanation && <>：<span lang="ja">{lastExplanation}</span></>}</p>}<p>{ui.webQuestionPosition(answers.length + 1, state.questions.length)}</p><h2 ref={questionHeadingRef} tabIndex={-1} lang="ja">{question.promptJa}</h2>
    {question.promptRepresentation && <RepresentationView representation={question.promptRepresentation} label={ui.webQuestionRepresentation} />}
    {renderInput(answer, response, setResponse, ui)}
    <button type="button" disabled={response === '' || (Array.isArray(response) && response.length === 0)} onClick={onSubmit}>{ui.webSubmitAnswer}</button>
  </section>
}

function RepresentationView({ representation, label }: { representation: PracticeRepresentation; label: string }) {
  const ui = useStrings().learningUi

  if (representation.kind === 'equation') return <figure aria-label={label}><figcaption>{label}</figcaption><pre lang="ja">{representation.expression}</pre></figure>
  if (representation.kind === 'table') return <figure aria-label={label}><figcaption>{label}</figcaption><table><thead><tr>{representation.columns.map((column) => <th lang="ja" key={column} scope="col">{column}</th>)}</tr></thead><tbody>{representation.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td lang="ja" key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></figure>
  if (representation.kind === 'diagram') { const labels = new Map(representation.nodes.map((node) => [node.id, node.label])); return <figure aria-label={label}><figcaption lang="ja">{representation.altText}</figcaption><ul>{representation.nodes.map((node) => <li lang="ja" key={node.id}>{node.label}</li>)}</ul>{representation.edges.map((edge, index) => <p lang="ja" key={`${edge.from}-${edge.to}-${index}`}>{labels.get(edge.from) ?? edge.from} → {labels.get(edge.to) ?? edge.to}{edge.label ? `：${edge.label}` : ''}</p>)}</figure> }
  if (representation.kind === 'elimination') return <figure aria-label={label}><figcaption>{label}</figcaption><ul>{representation.candidates.map((candidate) => <li lang="ja" key={candidate}>{candidate}</li>)}</ul><ol>{representation.steps.map((step) => <li lang="ja" key={step}>{step}</li>)}</ol></figure>
  if (representation.kind === 'logic-grid') return <figure aria-label={label}><figcaption>{label}</figcaption><table><thead><tr><th scope="col">{ui.webGridRow}</th>{representation.columns.map((column) => <th lang="ja" key={column} scope="col">{column}</th>)}</tr></thead><tbody>{representation.rows.map((row) => <tr key={row}><th scope="row" lang="ja">{row}</th>{representation.columns.map((column) => <td key={column}>{({ yes: ui.webYes, no: ui.webNo, unknown: ui.webUnknown })[representation.cells.find((cell) => cell.row === row && cell.column === column)?.value ?? 'unknown']}</td>)}</tr>)}</tbody></table></figure>
  return <figure aria-label={label}><figcaption lang="ja">{representation.label}</figcaption><p lang="ja">{representation.content}</p></figure>
}

function answerLabel(answer: RuntimeQuestion['answer']): string {
  if (answer.input.kind === 'single-choice') {
    const expected = answer.expectedAnswer as { kind: 'single-choice'; choiceId: string }
    return answer.input.choices.find((choice) => choice.id === expected.choiceId)?.textJa ?? expected.choiceId
  }
  if (answer.input.kind === 'multi-select' || answer.input.kind === 'ordering') {
    const expected = answer.expectedAnswer as { kind: 'multi-select' | 'ordering'; choiceIds: string[] }
    const input = answer.input as { choices: Array<{ id: string; textJa: string }> }
    return expected.choiceIds.map((id) => input.choices.find((choice) => choice.id === id)?.textJa ?? id).join('、')
  }
  if (answer.input.kind === 'number' && answer.expectedAnswer.kind === 'number') return String(answer.expectedAnswer.value)
  return ''
}

function initialResponse(answer: PracticeAnswer): RunnerResponse {
  if (answer.input.kind === 'ordering') return answer.input.choices.map((choice) => choice.id)
  if (answer.input.kind === 'multi-select') return []
  return ''
}

function renderInput(answer: RuntimeQuestion['answer'], response: RunnerResponse, setResponse: (value: RunnerResponse) => void, ui: LearningUiStrings) {
  if (answer.input.kind === 'short-text') return <label>{ui.webTextAnswer}<input type="text" value={typeof response === 'string' ? response : ''} onChange={(event) => setResponse(event.currentTarget.value)} /></label>
  if (answer.input.kind === 'number') return <label>{ui.webNumberAnswer}<input type="number" value={typeof response === 'number' ? response : ''} onChange={(event) => setResponse(event.currentTarget.value === '' ? '' : Number(event.currentTarget.value))} /></label>
  if (answer.input.kind === 'ordering') {
    const input = answer.input as Extract<RuntimeQuestion['answer'], { input: { kind: 'ordering' } }>['input']
    const ordered = Array.isArray(response) ? response : input.choices.map((choice) => choice.id)
    return <fieldset><legend>{ui.webOrderAnswer}</legend><ol>{ordered.map((choiceId, position) => { const choice = input.choices.find((entry) => entry.id === choiceId)!; return <li key={choice.id}><span lang="ja">{choice.textJa}</span>{choice.representation && <RepresentationView representation={choice.representation} label={ui.webChoiceRepresentation(choice.textJa)} />}<button type="button" aria-label={ui.webMoveUpLabel(choice.textJa)} disabled={position === 0} onClick={() => setResponse(ordered.map((id, i) => i === position - 1 ? ordered[position]! : i === position ? ordered[position - 1]! : id))}>{ui.webMoveUp}</button><button type="button" aria-label={ui.webMoveDownLabel(choice.textJa)} disabled={position === ordered.length - 1} onClick={() => setResponse(ordered.map((id, i) => i === position ? ordered[position + 1]! : i === position + 1 ? ordered[position]! : id))}>{ui.webMoveDown}</button></li> })}</ol></fieldset>
  }
  if (answer.input.kind === 'single-choice' || answer.input.kind === 'multi-select') return <fieldset><legend>{ui.webChooseAnswer}</legend>{answer.input.choices.map((choice) => <label key={choice.id}><input type={answer.input.kind === 'multi-select' ? 'checkbox' : 'radio'} name="practice-answer" value={choice.id} checked={Array.isArray(response) ? response.includes(choice.id) : response === choice.id} onChange={() => setResponse(answer.input.kind === 'multi-select' ? (Array.isArray(response) ? response.includes(choice.id) ? response.filter((id) => id !== choice.id) : [...response, choice.id] : [choice.id]) : choice.id)} /> <span lang="ja">{choice.textJa}</span>{choice.representation && <RepresentationView representation={choice.representation} label={ui.webChoiceRepresentation(choice.textJa)} />}</label>)}</fieldset>
  return null
}

function releasedCount(source: PracticeDiscoveryFamily | PracticeDiscoveryDomain): number {
  if ('testFamily' in source) return source.domains.reduce((total, domain) => total + releasedCount(domain), 0)
  return source.categories.reduce((total, category) => total + category.releasedCount, 0)
}

function runnerEntryHref(
  family: string,
  domain: PracticeDiscoveryDomain['domain'],
  category: string,
  mode: PracticeDiscoveryMode,
): string {
  return `/practice/web-test/${family}/${domain}/${category}?mode=${encodeURIComponent(mode)}`
}
