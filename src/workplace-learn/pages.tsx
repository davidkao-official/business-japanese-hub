import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { PlusAccessBoundary } from '../components/PlusAccessBoundary'
import { useMembershipAccess } from '../lib/membership/MembershipAccessContext'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getLearningUnitByLearnSlug, COURSE_CORRECTION_LEARN_SLUG, type LearningTextBlock } from '../app/learningUnits'
import { NotFoundPage } from '../app/NotFoundPage'
import { fetchWorkplaceLearnPayload } from './client'
import { fetchWorkplaceSave, removeWorkplaceSave, saveWorkplaceItem } from './savesClient'
import type { WorkplaceSave } from './savesClient'
import { workplaceLearnCatalog } from './catalog'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from './sample'
import type { WorkplaceLearnCatalogEntry, WorkplaceLearnCategory, WorkplaceLearnRuntimeItem } from './types'
import { validateWorkplaceLearnRuntimeItem } from './validate'
import { readingCatalog } from '../reading/catalog'
import practiceDiscoveryDocument from '../practice-web-test/released-discovery-catalog.json'
import { practiceDiscoveryFamilyLabel, validatePracticeDiscoveryCatalog } from '../practice-web-test/discoveryCatalog'
import './workplace-learn.css'

const categoryOrder: WorkplaceLearnCategory[] = ['workplace-communication', 'thinking-problem-solving', 'documents-data', 'meetings-projects', 'workplace-vocabulary']
const defaultFreeItems: readonly WorkplaceLearnRuntimeItem[] = [sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem]

function accessLabel(access: WorkplaceLearnCatalogEntry['access'], strings: ReturnType<typeof useStrings>) {
  return access === 'free' ? strings.plus.freeLabel : strings.plus.plusLabel
}

function ItemCard({ entry, strings }: { entry: WorkplaceLearnCatalogEntry; strings: ReturnType<typeof useStrings> }) {
  const href = entry.kind === 'lesson' ? `/learn/workplace/${entry.slug}` : `/learn/vocabulary/${entry.slug}`
  return (
    <article className="workplace-learn__item">
      <div className="workplace-learn__item-meta">
        <span>{entry.kind === 'lesson' ? strings.workplaceLearn.lessonLabel : strings.workplaceLearn.vocabularyLabel}</span>
        <span className={`workplace-learn__access workplace-learn__access--${entry.access}`}>{accessLabel(entry.access, strings)}</span>
      </div>
      <h3><Link to={href} lang={entry.titleLanguage}>{entry.title}</Link></h3>
      <p lang={entry.leadLanguage}>{entry.lead}</p>
      <Link className="workplace-learn__read-link" to={href}>{strings.workplaceLearn.openItem} <span aria-hidden="true">→</span></Link>
    </article>
  )
}

export function WorkplaceLearnLandingPage({ catalogEntries = workplaceLearnCatalog }: { catalogEntries?: readonly WorkplaceLearnCatalogEntry[] }) {
  const strings = useStrings()
  const [selectedCategory, setSelectedCategory] = useState<WorkplaceLearnCategory | 'all'>('all')
  useDocumentTitle(`${strings.workplaceLearn.title} — ${strings.app.name}`)
  const entries = selectedCategory === 'all'
    ? catalogEntries
    : catalogEntries.filter((entry) => entry.category === selectedCategory)
  const lesson = getLearningUnitByLearnSlug(COURSE_CORRECTION_LEARN_SLUG)

  return (
    <section className="page workplace-learn" aria-labelledby="workplace-learn-title">
      <div className="workplace-learn__intro">
        <p className="workplace-learn__eyebrow">LEARN · WORK IN JAPAN</p>
        <h1 className="page__title" id="workplace-learn-title">{strings.workplaceLearn.title}</h1>
        <p className="page__lead">{strings.workplaceLearn.lead}</p>
        <div className="workplace-learn__browse-links">
          <Link to="/learn/vocabulary">{strings.workplaceLearn.vocabularyIndexLink} <span aria-hidden="true">→</span></Link>
          {lesson && <Link to={`/learn/${COURSE_CORRECTION_LEARN_SLUG}`}>{strings.workplaceLearn.legacyLinkPrefix}{renderLearningText([lesson.gateway.title])} <span aria-hidden="true">→</span></Link>}
        </div>
      </div>

      <section className="workplace-learn__catalog" aria-labelledby="workplace-catalog-heading">
        <div className="workplace-learn__section-heading">
          <div><p className="workplace-learn__eyebrow">{strings.workplaceLearn.categoryKicker}</p><h2 id="workplace-catalog-heading">{strings.workplaceLearn.categoryTitle}</h2></div>
          <Link to="/learn/vocabulary">{strings.workplaceLearn.vocabularyIndexLink}</Link>
        </div>
        <div className="workplace-learn__filters" role="group" aria-label={strings.workplaceLearn.filterLabel}>
          <button type="button" aria-pressed={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>{strings.workplaceLearn.allCategories}</button>
          {categoryOrder.map((category) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}>{strings.workplaceLearn.categories[category]}</button>)}
        </div>
        {entries.length ? <div className="workplace-learn__grid">{entries.map((entry) => <ItemCard key={entry.id} entry={entry} strings={strings} />)}</div> : <p className="workplace-learn__empty">{strings.workplaceLearn.emptyCategory}</p>}
      </section>
    </section>
  )
}

export function WorkplaceVocabularyIndexPage({ catalogEntries = workplaceLearnCatalog }: { catalogEntries?: readonly WorkplaceLearnCatalogEntry[] }) {
  const strings = useStrings()
  useDocumentTitle(`${strings.workplaceLearn.vocabularyIndexTitle} — Learn — ${strings.app.name}`)
  const entries = catalogEntries.filter((entry) => entry.kind === 'vocabulary')
  return (
    <section className="page workplace-learn" aria-labelledby="workplace-vocabulary-index-title">
      <Link className="workplace-learn__back" to="/learn">← {strings.workplaceLearn.backToLearn}</Link>
      <div className="workplace-learn__intro workplace-learn__intro--compact">
        <p className="workplace-learn__eyebrow">WORKPLACE VOCABULARY</p>
        <h1 className="page__title" id="workplace-vocabulary-index-title">{strings.workplaceLearn.vocabularyIndexTitle}</h1>
        <p className="page__lead">{strings.workplaceLearn.vocabularyIndexLead}</p>
      </div>
      {entries.length ? <div className="workplace-learn__grid">{entries.map((entry) => <ItemCard key={entry.id} entry={entry} strings={strings} />)}</div> : <p className="workplace-learn__empty">{strings.workplaceLearn.vocabularyEmpty}</p>}
    </section>
  )
}

type DetailLoader = typeof fetchWorkplaceLearnPayload

export function WorkplaceLessonPage({ catalogEntries = workplaceLearnCatalog, publicItems = defaultFreeItems, loadPayload = fetchWorkplaceLearnPayload }: {
  catalogEntries?: readonly WorkplaceLearnCatalogEntry[]
  publicItems?: readonly WorkplaceLearnRuntimeItem[]
  loadPayload?: DetailLoader
}) {
  const { slug = '' } = useParams()
  const strings = useStrings()
  const entry = useMemo(() => catalogEntries.find((candidate) => candidate.kind === 'lesson' && candidate.slug === slug), [catalogEntries, slug])
  useDocumentTitle(entry ? `${entry.title} — Learn — ${strings.app.name}` : `Learn — ${strings.app.name}`)
  if (!entry) return <NotFoundPage />
  return <WorkplaceDetail entry={entry} catalogEntries={catalogEntries} publicItems={publicItems} loadPayload={loadPayload} />
}

export function WorkplaceVocabularyPage({ catalogEntries = workplaceLearnCatalog, publicItems = defaultFreeItems, loadPayload = fetchWorkplaceLearnPayload }: {
  catalogEntries?: readonly WorkplaceLearnCatalogEntry[]
  publicItems?: readonly WorkplaceLearnRuntimeItem[]
  loadPayload?: DetailLoader
}) {
  const { slug = '' } = useParams()
  const strings = useStrings()
  const entry = useMemo(() => catalogEntries.find((candidate) => candidate.kind === 'vocabulary' && candidate.slug === slug), [catalogEntries, slug])
  useDocumentTitle(entry ? `${entry.title} — ${strings.workplaceLearn.vocabularyIndexTitle} — ${strings.app.name}` : `Learn — ${strings.app.name}`)
  if (!entry) return <NotFoundPage />
  return <WorkplaceDetail entry={entry} catalogEntries={catalogEntries} publicItems={publicItems} loadPayload={loadPayload} />
}

function WorkplaceDetail({ entry, catalogEntries, publicItems, loadPayload }: {
  entry: WorkplaceLearnCatalogEntry
  catalogEntries: readonly WorkplaceLearnCatalogEntry[]
  publicItems: readonly WorkplaceLearnRuntimeItem[]
  loadPayload: DetailLoader
}) {
  const strings = useStrings()
  const { user, getAccessToken } = useAuth()
  const { state: membership } = useMembershipAccess()
  const candidate = entry.access === 'free'
    ? publicItems.find((item) => item.id === entry.id && item.slug === entry.slug && item.kind === entry.kind && item.access === 'free')
    : undefined
  const checked = candidate ? validateWorkplaceLearnRuntimeItem(candidate) : null
  const local = checked?.ok && catalogMatchesRuntime(entry, checked.value) ? checked.value : undefined
  const backHref = entry.kind === 'vocabulary' ? '/learn/vocabulary' : '/learn'
  const saveControlKey = `${user?.id ?? 'signed-out'}:${membership.kind}:${entry.id}:${entry.releaseReference?.revision ?? 'sample'}`

  return (
    <section className="page workplace-learn workplace-learn__detail" aria-labelledby="workplace-detail-title">
      <Link className="workplace-learn__back" to={backHref}>← {entry.kind === 'vocabulary' ? strings.workplaceLearn.backToVocabulary : strings.workplaceLearn.backToLearn}</Link>
      {entry.access === 'plus' ? (
        <PlusAccessBoundary access="plus" preview={<><DetailPreview entry={entry} strings={strings} /><WorkplaceSaveControl key={saveControlKey} entry={entry} contentReady={false} /></>}>
          {user?.id && membership.kind === 'active-member' && entry.releaseReference ? (
            <ActivePlusWorkplaceItem key={`${user.id}:${entry.id}:${entry.releaseReference.revision}`} entry={entry} userId={user.id} getAccessToken={getAccessToken} loadPayload={loadPayload} catalogEntries={catalogEntries} />
          ) : <><DetailPreview entry={entry} strings={strings} /><WorkplaceSaveControl key={saveControlKey} entry={entry} contentReady={false} /><p className="workplace-learn__status" role="status">{membership.kind === 'checking' ? strings.workplaceLearn.loading : membership.kind === 'active-member' ? strings.workplaceLearn.unavailable : ''}</p></>}
        </PlusAccessBoundary>
      ) : local ? <WorkplaceArticle item={local} catalogEntries={catalogEntries} saveControl={<WorkplaceSaveControl key={saveControlKey} entry={entry} contentReady />} /> : <p className="workplace-learn__status" role="status">{strings.workplaceLearn.unavailable}</p>}
    </section>
  )
}

function ActivePlusWorkplaceItem({ entry, userId, getAccessToken, loadPayload, catalogEntries }: {
  entry: WorkplaceLearnCatalogEntry
  userId: string
  getAccessToken: () => Promise<string | null>
  loadPayload: DetailLoader
  catalogEntries: readonly WorkplaceLearnCatalogEntry[]
}) {
  const [item, setItem] = useState<WorkplaceLearnRuntimeItem | null>(null)
  const [failed, setFailed] = useState(false)
  const strings = useStrings()
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    void loadPayload(entry, getAccessToken, userId, controller.signal).then((result) => {
      if (!current || controller.signal.aborted) return
      if (result.kind === 'ok' && result.item.access === 'plus') setItem(result.item)
      else setFailed(true)
    }).catch(() => { if (current && !controller.signal.aborted) setFailed(true) })
    return () => { current = false; controller.abort() }
  }, [entry, getAccessToken, loadPayload, userId])
  const saveControl = <WorkplaceSaveControl key={`${userId}:${entry.id}:${entry.releaseReference?.revision ?? ''}`} entry={entry} contentReady={item !== null} />
  if (item) return <WorkplaceArticle item={item} catalogEntries={catalogEntries} saveControl={saveControl} />
  return <><DetailPreview entry={entry} strings={strings} />{saveControl}<p className="workplace-learn__status" role="status">{failed ? strings.workplaceLearn.unavailable : strings.workplaceLearn.loading}</p></>
}

type WorkplaceSaveControlState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; save: WorkplaceSave | null }
  | { kind: 'stale' }
  | { kind: 'conflict' }
  | { kind: 'busy'; action: 'save' | 'remove' }

function WorkplaceSaveControl({ entry, contentReady }: { entry: WorkplaceLearnCatalogEntry; contentReady: boolean }) {
  const strings = useStrings()
  const { user, getAccessToken } = useAuth()
  const { state: membership, retry: retryMembership } = useMembershipAccess()
  const [state, setState] = useState<WorkplaceSaveControlState>({ kind: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const activeRequest = useRef<AbortController | null>(null)
  const revision = entry.access === 'free' ? null : entry.releaseReference?.revision ?? null

  useEffect(() => {
    const controller = new AbortController()
    activeRequest.current = controller
    if (!user?.id || membership.kind !== 'active-member' || !contentReady || (entry.access === 'plus' && !entry.releaseReference)) {
      return () => controller.abort()
    }
    void fetchWorkplaceSave(entry.id, getAccessToken, user.id, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.kind !== 'ok') {
        setState(result.kind === 'signed-out' ? { kind: 'signed-out' } : { kind: 'unavailable' })
        return
      }
      setState(result.save && (!result.save.current || !currentWorkplaceEntryMatches(entry, result.save))
        ? { kind: 'stale' }
        : { kind: 'ready', save: result.save })
    }).catch(() => { if (!controller.signal.aborted) setState({ kind: 'unavailable' }) })
    return () => {
      controller.abort()
      activeRequest.current?.abort()
      activeRequest.current = null
    }
  }, [contentReady, entry, getAccessToken, membership.kind, retryKey, user?.id])

  const mutate = async (action: 'save' | 'remove') => {
    if (!user?.id || membership.kind !== 'active-member' || state.kind === 'busy' || !contentReady) return
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setState({ kind: 'busy', action })
    try {
      const result = action === 'save'
        ? await saveWorkplaceItem(entry.id, revision, getAccessToken, user.id, controller.signal)
        : await removeWorkplaceSave(entry.id, getAccessToken, user.id, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'stale') setState(action === 'save' ? { kind: 'conflict' } : { kind: 'unavailable' })
      else if (result.kind === 'signed-out') setState({ kind: 'signed-out' })
      else if (result.kind !== 'ok') setState({ kind: 'unavailable' })
      else if (action === 'remove') setState({ kind: 'ready', save: null })
      else if (result.save) setState({ kind: 'ready', save: result.save })
      else setState({ kind: 'unavailable' })
    } catch {
      if (!controller.signal.aborted) setState({ kind: 'unavailable' })
    }
  }

  let message: string
  if (!user?.id || membership.kind === 'signed-out') message = strings.workplaceLearn.saveSignedOut
  else if (membership.kind === 'checking') message = strings.workplaceLearn.saveCheckingMembership
  else if (membership.kind === 'non-member') message = strings.workplaceLearn.saveNonMember
  else if (membership.kind === 'unavailable') message = strings.workplaceLearn.saveMembershipUnavailable
  else if (!contentReady || (entry.access === 'plus' && !entry.releaseReference)) message = strings.workplaceLearn.saveContentLoading
  else if (state.kind === 'signed-out') message = strings.workplaceLearn.saveSignedOut
  else if (state.kind === 'loading') message = strings.workplaceLearn.saveLoading
  else if (state.kind === 'stale') message = strings.workplaceLearn.saveStale
  else if (state.kind === 'conflict') message = strings.workplaceLearn.saveConflict
  else if (state.kind === 'unavailable') message = strings.workplaceLearn.saveUnavailable
  else if (state.kind === 'busy') message = strings.workplaceLearn.saveWorking
  else if (state.save) message = strings.workplaceLearn.saveSaved
  else message = strings.workplaceLearn.saveReady

  const allowed = Boolean(user?.id) && membership.kind === 'active-member' && contentReady && !(entry.access === 'plus' && !entry.releaseReference)
  const busy = state.kind === 'busy'
  const showRemove = allowed && ((state.kind === 'busy' && state.action === 'remove') || state.kind === 'stale' || (state.kind === 'ready' && state.save !== null))
  const showSave = allowed && ((state.kind === 'busy' && state.action === 'save') || (state.kind === 'ready' && state.save === null))

  return <section className="workplace-learn__save" aria-label={strings.workplaceLearn.saveLabel} aria-busy={busy}>
    <p className="workplace-learn__save-label">{strings.workplaceLearn.saveLabel}</p>
    <p role="status">{message}</p>
    {showSave && <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void mutate('save')}>{busy ? strings.workplaceLearn.saveWorking : strings.workplaceLearn.saveAction}</button>}
    {showRemove && <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void mutate('remove')}>{busy ? strings.workplaceLearn.saveWorking : strings.workplaceLearn.removeSave}</button>}
    {allowed && state.kind === 'unavailable' && <button className="btn btn--secondary" type="button" onClick={() => setRetryKey((key) => key + 1)}>{strings.workplaceLearn.saveRetry}</button>}
    {allowed && state.kind === 'conflict' && <button className="btn btn--secondary" type="button" onClick={() => setRetryKey((key) => key + 1)}>{strings.workplaceLearn.saveRetry}</button>}
    {membership.kind === 'unavailable' && <button className="btn btn--secondary" type="button" onClick={retryMembership}>{strings.workplaceLearn.saveRetry}</button>}
    {membership.kind === 'non-member' && <Link className="btn btn--secondary" to="/plus">{strings.plus.plusLabel}</Link>}
  </section>
}

function DetailPreview({ entry, strings }: { entry: WorkplaceLearnCatalogEntry; strings: ReturnType<typeof useStrings> }) {
  return <div className="workplace-learn__detail-header"><div className="workplace-learn__item-meta"><span>{strings.workplaceLearn.categories[entry.category]}</span><span className={`workplace-learn__access workplace-learn__access--${entry.access}`}>{accessLabel(entry.access, strings)}</span></div><h1 id="workplace-detail-title" lang={entry.titleLanguage}>{entry.title}</h1><p lang={entry.leadLanguage}>{entry.lead}</p></div>
}

function WorkplaceArticle({ item, catalogEntries, saveControl }: { item: WorkplaceLearnRuntimeItem; catalogEntries: readonly WorkplaceLearnCatalogEntry[]; saveControl: ReactNode }) {
  const strings = useStrings()
  const related = (id: string) => catalogEntries.find((entry) => entry.id === id)
  const links = item.relatedLinks.map((link) => ({ link, href: resolveRelatedHref(link, catalogEntries) }))
  return (
    <article className="workplace-learn__article">
      <DetailPreview entry={{ schemaVersion: item.schemaVersion, kind: item.kind, id: item.id, slug: item.slug, title: item.title, titleLanguage: item.titleLanguage, lead: item.lead, leadLanguage: item.leadLanguage, category: item.category, tags: item.tags, access: item.access, ...(item.sampleLabel ? { sampleLabel: item.sampleLabel } : {}) }} strings={strings} />
      {saveControl}
      {item.sampleLabel && <p className="workplace-learn__sample-note">{strings.workplaceLearn.sampleNote}</p>}
      {item.kind === 'lesson' ? <LessonBody item={item} related={related} strings={strings} /> : <VocabularyBody item={item} catalogEntries={catalogEntries} strings={strings} />}
      {links.length > 0 && <nav className="workplace-learn__related" aria-label={strings.workplaceLearn.related}><h2>{strings.workplaceLearn.related}</h2><ul>{links.map(({ link, href }) => <li key={`${link.kind}:${link.targetId}`}>{href ? <Link to={href} lang={link.labelLanguage}>{link.label} <span aria-hidden="true">→</span></Link> : <span className="workplace-learn__related-unavailable"><span lang={link.labelLanguage}>{link.label}</span> · {strings.workplaceLearn.relatedUnavailable}</span>}</li>)}</ul></nav>}
    </article>
  )
}

function currentWorkplaceEntryMatches(entry: WorkplaceLearnCatalogEntry, save: WorkplaceSave): boolean {
  if (save.itemId !== entry.id || save.kind !== entry.kind) return false
  if (entry.access === 'free') return save.revision === null && entry.sampleLabel === 'non-proprietary-teaching-sample'
  return entry.releaseReference?.contentId === entry.id && entry.releaseReference.revision === save.revision
}

function LessonBody({ item, related, strings }: { item: Extract<WorkplaceLearnRuntimeItem, { kind: 'lesson' }>; related: (id: string) => WorkplaceLearnCatalogEntry | undefined; strings: ReturnType<typeof useStrings> }) {
  return <div className="workplace-learn__body">
    <section><h2>{strings.workplaceLearn.situation}</h2><p lang="zh-TW">{item.situation}</p></section>
    <section><h2>{strings.workplaceLearn.meaning}</h2><p lang="zh-TW">{item.meaningInContextZhTW}</p></section>
    <section><h2>{strings.workplaceLearn.objective}</h2><p lang="zh-TW">{item.learningObjective}</p><p lang="zh-TW">{item.coreJudgment}</p></section>
    <section><h2>{strings.workplaceLearn.whatToDo}</h2><p lang="zh-TW">{item.whatToDo}</p></section>
    <section><h2>{strings.workplaceLearn.whatToSay}</h2><blockquote lang="ja">{item.whatToSayJapanese}</blockquote><p lang="zh-TW">{item.whyItWorksZhTW}</p></section>
    {item.examples.length > 0 && <section><h2>{strings.workplaceLearn.examples}</h2>{item.examples.map((example, index) => <div className="workplace-learn__example" key={`${example.context}-${index}`}><p className="workplace-learn__example-context" lang="zh-TW">{example.context}</p><blockquote lang="ja">{example.japanese}</blockquote><p lang="zh-TW">{example.explanationZhTW}</p></div>)}</section>}
    <section className="workplace-learn__caution"><h2>{strings.workplaceLearn.caution}</h2><p lang="zh-TW">{item.cautionZhTW}</p>{item.relationshipContext && <p lang="zh-TW">{item.relationshipContext}</p>}</section>
    {item.relatedVocabularyIds.length > 0 && <section><h2>{strings.workplaceLearn.relatedVocabulary}</h2><ul>{item.relatedVocabularyIds.map((id) => { const vocab = related(id); return <li key={id}>{vocab?.kind === 'vocabulary' ? <Link to={`/learn/vocabulary/${vocab.slug}`} lang={vocab.titleLanguage}>{vocab.title} →</Link> : <span className="workplace-learn__related-unavailable">{strings.workplaceLearn.relatedUnavailable}</span>}</li> })}</ul></section>}
    {item.practiceTypes.includes('rewrite') && <section className="workplace-learn__self-practice"><h2>{strings.workplaceLearn.selfPracticeTitle}</h2><p>{strings.workplaceLearn.selfPracticePrompt}</p><label htmlFor={`${item.id}-rewrite`}>{strings.workplaceLearn.selfPracticeLabel}</label><textarea id={`${item.id}-rewrite`} lang="ja" rows={4} /><p className="workplace-learn__self-practice-note">{strings.workplaceLearn.selfPracticeNoSave}</p></section>}
    <p className="workplace-learn__takeaway" lang="zh-TW">{item.transferTakeaway}</p>
  </div>
}

function VocabularyBody({ item, catalogEntries, strings }: { item: Extract<WorkplaceLearnRuntimeItem, { kind: 'vocabulary' }>; catalogEntries: readonly WorkplaceLearnCatalogEntry[]; strings: ReturnType<typeof useStrings> }) {
  return <div className="workplace-learn__body workplace-learn__vocabulary-body">
    <dl><div><dt>{strings.workplaceLearn.termLabel}</dt><dd lang="ja">{item.term}</dd></div><div><dt>{strings.workplaceLearn.reading}</dt><dd lang="ja">{item.reading}</dd></div><div><dt>{strings.workplaceLearn.meaningLabel}</dt><dd lang="zh-TW">{item.meaningZhTW}</dd></div><div><dt>{strings.workplaceLearn.nuance}</dt><dd lang="zh-TW">{item.workplaceNuanceZhTW}</dd></div><div><dt>{strings.workplaceLearn.usage}</dt><dd lang="zh-TW">{item.usageContext}</dd></div><div><dt>{strings.workplaceLearn.register}</dt><dd lang="zh-TW">{item.register}</dd></div>{item.relationshipContext && <div><dt>{strings.workplaceLearn.relationship}</dt><dd lang="zh-TW">{item.relationshipContext}</dd></div>}</dl>
    <section><h2>{strings.workplaceLearn.example}</h2><p className="workplace-learn__example-context" lang="zh-TW">{item.example.context}</p><blockquote lang="ja">{item.example.japanese}</blockquote><p lang="zh-TW">{item.example.explanationZhTW}</p></section>
    <section className="workplace-learn__caution"><h2>{strings.workplaceLearn.caution}</h2><p lang="zh-TW">{item.cautionZhTW}</p></section>
    {item.relatedTermIds.length > 0 && <section><h2>{strings.workplaceLearn.relatedVocabulary}</h2><ul>{item.relatedTermIds.map((id) => { const term = catalogEntries.find((entry) => entry.id === id && entry.kind === 'vocabulary'); return <li key={id}>{term ? <Link to={`/learn/vocabulary/${term.slug}`} lang={term.titleLanguage}>{term.title} →</Link> : <span className="workplace-learn__related-unavailable">{strings.workplaceLearn.relatedUnavailable}</span>}</li> })}</ul></section>}
  </div>
}

function catalogMatchesRuntime(entry: WorkplaceLearnCatalogEntry, item: WorkplaceLearnRuntimeItem): boolean {
  return item.id === entry.id && item.slug === entry.slug && item.kind === entry.kind && item.access === entry.access
    && item.schemaVersion === entry.schemaVersion && item.title === entry.title && item.lead === entry.lead
    && item.titleLanguage === entry.titleLanguage && item.leadLanguage === entry.leadLanguage
    && item.category === entry.category && item.tags.length === entry.tags.length && item.tags.every((tag, index) => tag === entry.tags[index])
    && item.sampleLabel === entry.sampleLabel
}

function resolveRelatedHref(
  link: WorkplaceLearnRuntimeItem['relatedLinks'][number],
  catalogEntries: readonly WorkplaceLearnCatalogEntry[],
): string | null {
  if (link.kind === 'learn') {
    const entry = catalogEntries.find((candidate) => candidate.id === link.targetId)
    if (entry) return entry.kind === 'lesson' ? `/learn/workplace/${entry.slug}` : `/learn/vocabulary/${entry.slug}`
    return null
  }
  if (link.kind === 'read') {
    const entry = readingCatalog.find((candidate) => candidate.id === link.targetId)
    return entry ? `/read/${entry.slug}` : null
  }
  if (!validatePracticeDiscoveryCatalog(practiceDiscoveryDocument)
    || practiceDiscoveryDocument.releaseIdentity.contentId !== link.targetId) return null
  const family = practiceDiscoveryDocument.families.find((candidate) => practiceDiscoveryFamilyLabel(link.targetId, candidate.testFamily) !== undefined)
  return family ? `/practice/web-test/${family.testFamily}` : null
}

function renderLearningText(segments: LearningTextBlock) {
  return segments.map((segment, index) => <span key={`${segment.lang}-${index}`} lang={segment.lang}>{segment.text}</span>)
}
