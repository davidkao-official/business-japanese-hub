import { useLocale, useStrings, getActiveLocale, type Locale } from '../i18n/strings'
import type { LearningUiStrings } from '../i18n/learningUi'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import catalogDocument from '../practice-web-test/released-discovery-catalog.json'
import {
  findPracticeDiscoveryCategory,
  findPracticeDiscoveryDomain,
  findPracticeDiscoveryFamily,
  practiceDiscoveryCategoryLabel,
  validatePracticeDiscoveryCatalog,
  type PracticeDiscoveryMode,
} from '../practice-web-test/discoveryCatalog'
import { practiceRunnerHref, type PracticeLearningSnapshot, type PracticeReviewItem } from '../lib/learning/practiceMyLearning'
import { fetchPracticeLearningSnapshot } from '../lib/learning/practiceMyLearningClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useMembershipAccess } from '../lib/membership/MembershipAccessContext'
import { AuthPanel } from '../components/AuthPanel'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { readingCatalog } from '../reading/catalog'
import { fetchReadingSaves, removeReadingSave } from '../reading/savesClient'
import type { ReadingSave, ReadingSavesResult } from '../reading/savesClient'
import { workplaceLearnCatalog } from '../workplace-learn/catalog'
import { fetchWorkplaceSaves, removeWorkplaceSave } from '../workplace-learn/savesClient'
import type { WorkplaceSave, WorkplaceSavesResult } from '../workplace-learn/savesClient'

const catalog = validatePracticeDiscoveryCatalog(catalogDocument) ? catalogDocument : null

type PageState =
  | { kind: 'idle' }
  | { kind: 'signed-out' | 'non-member' | 'loading' | 'unavailable'; ownerId: string }
  | { kind: 'ready'; ownerId: string; snapshot: PracticeLearningSnapshot }
type SnapshotFetcher = typeof fetchPracticeLearningSnapshot
type ReadingSavesFetcher = typeof fetchReadingSaves
type ReadingSaveRemover = typeof removeReadingSave
type WorkplaceSavesFetcher = typeof fetchWorkplaceSaves
type WorkplaceSaveRemover = typeof removeWorkplaceSave

export function MyLearningPage({
  fetchSnapshot = fetchPracticeLearningSnapshot,
  fetchSaves = fetchReadingSaves,
  deleteSave = removeReadingSave,
  fetchWorkplaceItems = fetchWorkplaceSaves,
  deleteWorkplaceItem = removeWorkplaceSave,
}: { fetchSnapshot?: SnapshotFetcher; fetchSaves?: ReadingSavesFetcher; deleteSave?: ReadingSaveRemover; fetchWorkplaceItems?: WorkplaceSavesFetcher; deleteWorkplaceItem?: WorkplaceSaveRemover } = {}) {
  const ui = useStrings().learningUi

  useDocumentTitle(ui.myDocumentTitle)
  const { user, loading: authLoading, getAccessToken } = useAuth()
  const { state: membershipState, retry: retryMembership } = useMembershipAccess()
  const [requestKey, setRequestKey] = useState(0)
  const [pageState, setPageState] = useState<PageState>({ kind: 'idle' })
  const requestGenerationRef = useRef(0)
  const currentPageState: PageState = user && pageState.kind !== 'idle' && pageState.ownerId === user.id
    ? pageState
    : { kind: 'idle' }

  useEffect(() => {
    if (authLoading || !user || membershipState.kind !== 'active-member') {
      return
    }
    let cancelled = false
    const ownerId = user.id
    const requestGeneration = ++requestGenerationRef.current
    void Promise.resolve().then(async () => {
      if (cancelled || requestGeneration !== requestGenerationRef.current) return
      setPageState({ kind: 'loading', ownerId })
      const result = await fetchSnapshot(getAccessToken, ownerId)
      if (cancelled || requestGeneration !== requestGenerationRef.current) return
      setPageState(result.kind === 'ok' ? { kind: 'ready', ownerId, snapshot: result.snapshot } : { kind: result.kind, ownerId })
    })
    return () => {
      cancelled = true
      requestGenerationRef.current += 1
    }
  }, [authLoading, fetchSnapshot, getAccessToken, membershipState.kind, requestKey, user])

  if (authLoading) return <MyLearningShell><StatePanel title={ui.myCheckingTitle} body={ui.myCheckingBody} /></MyLearningShell>
  if (!user) return <MyLearningShell><SignedOutState /></MyLearningShell>
  if (membershipState.kind === 'checking') return <MyLearningShell><StatePanel title={ui.myCheckingMembershipTitle} body={ui.myCheckingMembershipBody} /></MyLearningShell>
  if (membershipState.kind === 'non-member') return <MyLearningShell><NonMemberState /></MyLearningShell>
  if (membershipState.kind === 'unavailable') return <MyLearningShell><StatePanel title={ui.myMembershipUnavailableTitle} body={ui.myMembershipUnavailableBody} action={<button className="btn btn--secondary" type="button" onClick={retryMembership}>{ui.retry}</button>} /></MyLearningShell>
  if (currentPageState.kind === 'signed-out') return <MyLearningShell><SignedOutState /></MyLearningShell>
  if (currentPageState.kind === 'non-member') return <MyLearningShell><NonMemberState /></MyLearningShell>
  if (currentPageState.kind === 'unavailable') return <MyLearningShell><StatePanel title={ui.myAttemptsUnavailableTitle} body={ui.myAttemptsUnavailableBody} action={<button className="btn btn--secondary" type="button" onClick={() => setRequestKey((current) => current + 1)}>{ui.retry}</button>} /><ReadingSavesSection key={`reading:${user.id}`} ownerId={user.id} getAccessToken={getAccessToken} fetchSaves={fetchSaves} deleteSave={deleteSave} /><WorkplaceSavesSection key={`workplace:${user.id}`} ownerId={user.id} getAccessToken={getAccessToken} fetchSaves={fetchWorkplaceItems} deleteSave={deleteWorkplaceItem} /></MyLearningShell>
  if (currentPageState.kind === 'ready') return <MyLearningShell><MyLearningContent snapshot={currentPageState.snapshot} /><ReadingSavesSection key={`reading:${user.id}`} ownerId={user.id} getAccessToken={getAccessToken} fetchSaves={fetchSaves} deleteSave={deleteSave} /><WorkplaceSavesSection key={`workplace:${user.id}`} ownerId={user.id} getAccessToken={getAccessToken} fetchSaves={fetchWorkplaceItems} deleteSave={deleteWorkplaceItem} /></MyLearningShell>

  return <MyLearningShell><StatePanel title={ui.myLoadingTitle} body={ui.myLoadingBody} /><ReadingSavesSection key={`reading:${user.id}`} ownerId={user.id} getAccessToken={getAccessToken} fetchSaves={fetchSaves} deleteSave={deleteSave} /><WorkplaceSavesSection key={`workplace:${user.id}`} ownerId={user.id} getAccessToken={getAccessToken} fetchSaves={fetchWorkplaceItems} deleteSave={deleteWorkplaceItem} /></MyLearningShell>
}

function MyLearningShell({ children }: { children: ReactNode }) {
  const ui = useStrings().learningUi

  return <section className="page my-learning-page" lang={getActiveLocale()} aria-labelledby="my-learning-title"><div className="my-learning-page__intro"><p className="product-mode-page__eyebrow" lang={getActiveLocale()}>{ui.myEyebrow}</p><h1 className="page__title" id="my-learning-title">{ui.myTitle}</h1><p className="page__lead">{ui.myLead}</p></div>{children}</section>
}

function SignedOutState() {
  const ui = useStrings().learningUi

  return <section className="my-learning-page__state" aria-labelledby="my-learning-sign-in-title"><h2 id="my-learning-sign-in-title">{ui.mySignInTitle}</h2><p>{ui.mySignInBody}</p><AuthPanel /><Link className="page__action" to="/practice/web-test">{ui.webOpenPractice}</Link></section>
}

function NonMemberState() {
  const ui = useStrings().learningUi

  return <section className="my-learning-page__state" aria-labelledby="my-learning-member-title"><h2 id="my-learning-member-title">{ui.myMemberTitle}</h2><p>{ui.myMemberBody}</p><Link className="btn btn--primary" to="/plus">{ui.viewPlus}</Link></section>
}

function MyLearningContent({ snapshot }: { snapshot: PracticeLearningSnapshot }) {
  const locale = useLocale()
  const ui = useStrings(locale).learningUi

  const nextAction = snapshot.nextAction.kind === 'start-practice'
    ? { title: ui.myStartTitle, body: ui.myStartBody, href: '/practice/web-test', label: ui.myStartAction }
    : snapshot.nextAction.kind === 'review-mistake'
      ? actionFor(snapshot.nextAction.item, true, ui, locale)
      : actionFor(snapshot.nextAction.item, false, ui, locale)
  const empty = snapshot.recentAttempts.length === 0
  return <>
    <section className="my-learning-page__next" aria-labelledby="my-learning-next-title"><p className="my-learning-page__section-label">{ui.myNextStep}</p><h2 id="my-learning-next-title">{empty ? ui.myEmptyTitle : nextAction.title}</h2><p>{empty ? ui.myEmptyBody : nextAction.body}</p>{nextAction.href ? <Link className="btn btn--primary" to={nextAction.href}>{nextAction.label}</Link> : <p role="status">{ui.myRecordUnavailable}</p>}</section>
    {(snapshot.actionableMistakes.length > 0 || !empty) && <section className="my-learning-page__section" aria-labelledby="my-learning-review-title"><div><p className="my-learning-page__section-label">{ui.myReviewLabel}</p><h2 id="my-learning-review-title">{ui.myMistakesTitle}</h2><p>{ui.myMistakesBody}</p></div>{snapshot.actionableMistakes.length > 0 ? <ul className="my-learning-page__review-list">{snapshot.actionableMistakes.map((item) => { const action = actionFor(item, true, ui, locale); return <li key={`${item.contentId}:${item.questionId}`}><span>{categoryLabelFor(item, ui, locale)}</span>{action.href ? <Link to={action.href}>{ui.myReviewQuestion}</Link> : <span role="status">{ui.myCannotOpen}</span>}</li> })}</ul> : <p>{ui.myNoMistakes}</p>}</section>}
    {!empty && <section className="my-learning-page__section" aria-labelledby="my-learning-recent-title"><p className="my-learning-page__section-label">{ui.myEvidenceLabel}</p><h2 id="my-learning-recent-title">{ui.myRecentAttempts}</h2><ul className="my-learning-page__recent-list">{snapshot.recentAttempts.slice(0, 5).map((attempt) => <li key={`${attempt.contentId}:${attempt.questionId}:${attempt.createdAt}`}><span>{categoryLabelFor(attempt, ui, locale)}</span><span>{attempt.correct ? ui.answerCorrect : ui.answerIncorrect}</span><time dateTime={attempt.createdAt}>{new Date(attempt.createdAt).toLocaleDateString(getActiveLocale())}</time></li>)}</ul></section>}
    {!empty && <section className="my-learning-page__section" aria-labelledby="my-learning-signal-title"><p className="my-learning-page__section-label">{ui.myCategoryRecords}</p><h2 id="my-learning-signal-title">{ui.myFocusTitle}</h2>{snapshot.weakArea ? <p>{ui.myWeakAreaSummary(weakAreaCategoryLabel(snapshot.weakArea, ui, locale), snapshot.weakArea.sampleCount, snapshot.weakArea.incorrectCount, snapshot.weakArea.accuracyPercent)}</p> : <p>{ui.myInsufficientData}</p>}</section>}
  </>
}

type ReadingSaveState = { kind: 'loading' } | { kind: 'ready'; items: ReadingSave[] } | { kind: 'unavailable'; result?: ReadingSavesResult }

function ReadingSavesSection({
  ownerId, getAccessToken, fetchSaves, deleteSave,
}: {
  ownerId: string
  getAccessToken: () => Promise<string | null>
  fetchSaves: ReadingSavesFetcher
  deleteSave: ReadingSaveRemover
}) {
  const ui = useStrings().learningUi

  const [state, setState] = useState<ReadingSaveState>({ kind: 'loading' })
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const activeRequestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    activeRequestRef.current = controller
    void fetchSaves(getAccessToken, ownerId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setState(result.kind === 'ok' ? { kind: 'ready', items: result.items } : { kind: 'unavailable', result })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ kind: 'unavailable' })
    })
    return () => {
      controller.abort()
      activeRequestRef.current?.abort()
      activeRequestRef.current = null
    }
  }, [fetchSaves, getAccessToken, ownerId])

  const retry = async () => {
    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller
    setState({ kind: 'loading' })
    try {
      const result = await fetchSaves(getAccessToken, ownerId, controller.signal)
      if (controller.signal.aborted) return
      setState(result.kind === 'ok' ? { kind: 'ready', items: result.items } : { kind: 'unavailable', result })
    } catch {
      if (!controller.signal.aborted) setState({ kind: 'unavailable' })
    }
  }

  const remove = async (itemId: string) => {
    if (busyItemId) return
    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller
    setBusyItemId(itemId)
    try {
      const result = await deleteSave(itemId, getAccessToken, ownerId, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'ok') {
        setState({ kind: 'loading' })
        const refreshed = await fetchSaves(getAccessToken, ownerId, controller.signal)
        if (controller.signal.aborted) return
        setState(refreshed.kind === 'ok' ? { kind: 'ready', items: refreshed.items } : { kind: 'unavailable', result: refreshed })
      } else setState({ kind: 'unavailable', result })
    } catch {
      if (!controller.signal.aborted) setState({ kind: 'unavailable' })
    } finally {
      if (!controller.signal.aborted) setBusyItemId(null)
    }
  }

  return (
    <section className="my-learning-page__section my-learning-reading-saves" aria-labelledby="my-learning-reading-title">
      <p className="my-learning-page__section-label">{ui.readLabel}</p>
      <h2 id="my-learning-reading-title">{ui.mySavedReadingTitle}</h2>
      <p>{ui.mySavedReadingBody}</p>
      {state.kind === 'loading' && <p role="status">{ui.myReadingLoading}</p>}
      {state.kind === 'unavailable' && <div role="status"><p>{state.result?.kind === 'forbidden' ? ui.myPlusUnavailable : ui.myReadingUnavailable}</p><button type="button" className="btn btn--secondary" onClick={() => void retry()}>{ui.retry}</button></div>}
      {state.kind === 'ready' && state.items.length === 0 && <p>{ui.myReadingEmpty}</p>}
      {state.kind === 'ready' && state.items.length > 0 && <ul className="my-learning-reading-saves__list">{state.items.map((save) => {
        const entry = currentSavedReadingEntry(save)
        return <li key={save.itemId}>
          <div className="my-learning-reading-saves__item">
            {entry ? <Link to={`/read/${entry.slug}`} lang="ja">{entry.title}</Link> : <span role="status">{ui.mySavedItemUnavailable}</span>}
            <time dateTime={save.savedAt}>{new Date(save.savedAt).toLocaleDateString(getActiveLocale())}</time>
          </div>
          <button type="button" className="btn btn--secondary" disabled={busyItemId !== null} onClick={() => void remove(save.itemId)}>{busyItemId === save.itemId ? ui.working : ui.remove}</button>
        </li>
      })}</ul>}
    </section>
  )
}

function currentSavedReadingEntry(save: ReadingSave) {
  const entry = readingCatalog.find((candidate) => candidate.id === save.itemId)
  if (!entry) return null
  if (entry.access === 'free') {
    return save.revision === null && entry.source.type === 'original' && entry.sampleLabel === 'non-proprietary-teaching-sample'
      ? entry
      : null
  }
  return entry.releaseReference?.contentId === entry.id && entry.releaseReference.revision === save.revision
    ? entry
    : null
}

type WorkplaceSavesState = { kind: 'loading' } | { kind: 'ready'; items: WorkplaceSave[] } | { kind: 'unavailable'; result?: WorkplaceSavesResult }

function WorkplaceSavesSection({ ownerId, getAccessToken, fetchSaves, deleteSave }: {
  ownerId: string
  getAccessToken: () => Promise<string | null>
  fetchSaves: WorkplaceSavesFetcher
  deleteSave: WorkplaceSaveRemover
}) {
  const ui = useStrings().learningUi

  const [state, setState] = useState<WorkplaceSavesState>({ kind: 'loading' })
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const activeRequestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    activeRequestRef.current = controller
    void fetchSaves(getAccessToken, ownerId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setState(result.kind === 'ok' ? { kind: 'ready', items: result.items } : { kind: 'unavailable', result })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ kind: 'unavailable' })
    })
    return () => {
      controller.abort()
      activeRequestRef.current?.abort()
      activeRequestRef.current = null
    }
  }, [fetchSaves, getAccessToken, ownerId, retryKey])

  const retry = () => {
    activeRequestRef.current?.abort()
    setState({ kind: 'loading' })
    setRetryKey((key) => key + 1)
  }

  const remove = async (itemId: string) => {
    if (busyItemId) return
    activeRequestRef.current?.abort()
    const controller = new AbortController()
    activeRequestRef.current = controller
    setBusyItemId(itemId)
    try {
      const result = await deleteSave(itemId, getAccessToken, ownerId, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind !== 'ok') {
        setState({ kind: 'unavailable', result })
        return
      }
      setState({ kind: 'loading' })
      const refreshed = await fetchSaves(getAccessToken, ownerId, controller.signal)
      if (controller.signal.aborted) return
      setState(refreshed.kind === 'ok' ? { kind: 'ready', items: refreshed.items } : { kind: 'unavailable', result: refreshed })
    } catch {
      if (!controller.signal.aborted) setState({ kind: 'unavailable' })
    } finally {
      if (!controller.signal.aborted) setBusyItemId(null)
    }
  }

  return <section className="my-learning-page__section my-learning-workplace-saves" aria-labelledby="my-learning-workplace-title">
    <p className="my-learning-page__section-label">{ui.workplaceLabel}</p>
    <h2 id="my-learning-workplace-title">{ui.mySavedWorkplaceTitle}</h2>
    <p>{ui.mySavedWorkplaceBody}</p>
    {state.kind === 'loading' && <p role="status">{ui.myWorkplaceLoading}</p>}
    {state.kind === 'unavailable' && <div role="status"><p>{state.result?.kind === 'forbidden' ? ui.myPlusUnavailable : ui.myWorkplaceUnavailable}</p><button type="button" className="btn btn--secondary" onClick={retry}>{ui.retry}</button></div>}
    {state.kind === 'ready' && state.items.length === 0 && <p>{ui.myWorkplaceEmpty}</p>}
    {state.kind === 'ready' && state.items.length > 0 && <ul className="my-learning-workplace-saves__list">{state.items.map((save) => {
      const entry = currentSavedWorkplaceEntry(save)
      const href = entry?.kind === 'lesson' ? `/learn/workplace/${entry.slug}` : entry ? `/learn/vocabulary/${entry.slug}` : null
      return <li key={save.itemId}>
        <div className="my-learning-workplace-saves__item">
          {href && entry ? <Link to={href} lang={entry.titleLanguage}>{entry.title}</Link> : <span role="status">{ui.mySavedItemUnavailable}</span>}
          <time dateTime={save.savedAt}>{new Date(save.savedAt).toLocaleDateString(getActiveLocale())}</time>
        </div>
        <button type="button" className="btn btn--secondary" disabled={busyItemId !== null} onClick={() => void remove(save.itemId)}>{busyItemId === save.itemId ? ui.working : ui.remove}</button>
      </li>
    })}</ul>}
  </section>
}

function currentSavedWorkplaceEntry(save: WorkplaceSave) {
  if (!save.current) return null
  const entry = workplaceLearnCatalog.find((candidate) => candidate.id === save.itemId && candidate.kind === save.kind)
  if (!entry) return null
  if (entry.access === 'free') return save.revision === null && entry.sampleLabel === 'non-proprietary-teaching-sample' ? entry : null
  return entry.releaseReference?.contentId === entry.id && entry.releaseReference.revision === save.revision ? entry : null
}


function actionFor(item: PracticeReviewItem, review: boolean, ui: LearningUiStrings, locale: Locale): { title: string; body: string; href: string | null; label: string } {
  const href = safeRunnerHref(item, review)
  return review
    ? { title: ui.myReviewTitle, body: ui.myReviewBody, href, label: ui.myReviewQuestion }
    : { title: ui.myContinueTitle, body: ui.myContinueBody(categoryLabelFor(item, ui, locale)), href, label: ui.myContinueAction }
}

function categoryLabelFor(item: Pick<PracticeReviewItem, 'contentId' | 'contentRevision' | 'testFamily' | 'domain' | 'category'>, ui: LearningUiStrings, locale: Locale): string {
  if (!catalog || item.contentId !== catalog.releaseIdentity.contentId) return ui.myUnknownCategory
  return practiceDiscoveryCategoryLabel(catalog.releaseIdentity.contentId, item.testFamily, item.domain, item.category, locale) ?? ui.myUnknownCategory
}

function weakAreaCategoryLabel(weakArea: NonNullable<PracticeLearningSnapshot['weakArea']>, ui: LearningUiStrings, locale: Locale): string {
  if (!catalog) return ui.myUnknownCategory
  return practiceDiscoveryCategoryLabel(catalog.releaseIdentity.contentId, 'spi', weakArea.domain, weakArea.category, locale) ?? ui.myUnknownCategory
}

function safeRunnerHref(item: PracticeReviewItem, review: boolean): string | null {
  if (!catalog || item.contentId !== catalog.releaseIdentity.contentId || item.contentRevision !== catalog.releaseIdentity.revision) return null
  const family = findPracticeDiscoveryFamily(catalog, item.testFamily)
  const domain = findPracticeDiscoveryDomain(catalog, item.testFamily, item.domain)
  const category = findPracticeDiscoveryCategory(catalog, item.testFamily, item.domain, item.category)
  if (!family || !domain || !category || !category.modes.includes(item.practiceMode as PracticeDiscoveryMode)) return null
  return practiceRunnerHref(item, review)
}

function StatePanel({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <section className="my-learning-page__state" aria-live="polite"><h2>{title}</h2><p>{body}</p>{action}</section>
}
