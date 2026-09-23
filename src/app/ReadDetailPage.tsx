import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { PlusAccessBoundary } from '../components/PlusAccessBoundary'
import { useStrings } from '../i18n/strings'
import { useMembershipAccess } from '../lib/membership/MembershipAccessContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { fetchReadingPayload } from '../reading/client'
import { fetchReadingSave, removeReadingSave, saveReadingItem } from '../reading/savesClient'
import type { ReadingSave, ReadingSaveError, ReadingSaveMutationResult, ReadingSaveResult } from '../reading/savesClient'
import { readingCatalog } from '../reading/catalog'
import { sampleReadingItem } from '../reading/fixtures/sample-reading'
import type { ReadingCatalogEntry, ReadingRelatedLink, ReadingRuntimeItem } from '../reading/types'
import { getLearningUnitByLearnSlug, getLearningUnitByPracticeSlug } from './learningUnits'
import { NotFoundPage } from './NotFoundPage'

type ReadingLoader = typeof fetchReadingPayload
type SaveLoader = typeof fetchReadingSave
type SaveWriter = typeof saveReadingItem
type SaveRemover = typeof removeReadingSave
type DetailState = { kind: 'unavailable' } | { kind: 'ready'; item: ReadingRuntimeItem }

export function ReadDetailPage({
  catalogEntries = readingCatalog,
  publicItems = [sampleReadingItem],
  loadPayload = fetchReadingPayload,
  loadSave = fetchReadingSave,
  writeSave = saveReadingItem,
  deleteSave = removeReadingSave,
}: {
  catalogEntries?: readonly ReadingCatalogEntry[]
  publicItems?: readonly ReadingRuntimeItem[]
  loadPayload?: ReadingLoader
  loadSave?: SaveLoader
  writeSave?: SaveWriter
  deleteSave?: SaveRemover
} = {}) {
  const { slug = '' } = useParams()
  const strings = useStrings()
  const { user, getAccessToken } = useAuth()
  const { state: membershipState } = useMembershipAccess()
  const entry = useMemo(() => catalogEntries.find((candidate) => candidate.slug === slug), [catalogEntries, slug])
  const userId = user?.id ?? null

  useDocumentTitle(entry?.seo.title ?? strings.notFound.title)

  useEffect(() => {
    const description = entry?.seo.description
    const element = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!element || !description) return
    const previous = element.content
    element.content = description
    return () => { element.content = previous }
  }, [entry?.seo.description])

  if (!entry) return <NotFoundPage />

  const item = entry.access === 'free'
    ? publicItems.find((candidate) => candidate.id === entry.id && candidate.slug === entry.slug && candidate.access === 'free')
    : undefined

  return (
    <section className="page reading-detail" aria-labelledby="reading-detail-title">
      <Link className="reading-back" to="/read">← {strings.reading.backToRead}</Link>
      {entry.access === 'plus' ? (
        <PlusAccessBoundary
          access="plus"
          preview={<><ReadingMetadata entry={entry} /><ReadingSaveControl key={`${userId}:${membershipState.kind}:${entry.id}:${entry.releaseReference?.revision ?? 'missing'}`} entry={entry} itemId={entry.id} revision={entry.releaseReference?.revision ?? null} userId={userId} membershipKind={membershipState.kind} getAccessToken={getAccessToken} loadSave={loadSave} writeSave={writeSave} deleteSave={deleteSave} canSave={Boolean(entry.releaseReference && entry.releaseReference.contentId === entry.id)} /></>}
        >
          {userId && membershipState.kind === 'active-member' && entry.releaseReference ? (
            <ActivePlusReading
              key={`${userId}:${entry.slug}:${entry.releaseReference.revision}`}
              entry={entry}
              userId={userId}
              getAccessToken={getAccessToken}
              loadPayload={loadPayload}
              saveControl={<ReadingSaveControl key={`${userId}:${membershipState.kind}:${entry.id}:${entry.releaseReference.revision}`} entry={entry} itemId={entry.id} revision={entry.releaseReference.revision} userId={userId} membershipKind={membershipState.kind} getAccessToken={getAccessToken} loadSave={loadSave} writeSave={writeSave} deleteSave={deleteSave} canSave={entry.releaseReference.contentId === entry.id} />}
            />
          ) : (
            <>
              <ReadingMetadata entry={entry} />
              <ReadingSaveControl key={`${userId}:${membershipState.kind}:${entry.id}:${entry.releaseReference?.revision ?? 'missing'}`} entry={entry} itemId={entry.id} revision={entry.releaseReference?.revision ?? null} userId={userId} membershipKind={membershipState.kind} getAccessToken={getAccessToken} loadSave={loadSave} writeSave={writeSave} deleteSave={deleteSave} canSave={Boolean(entry.releaseReference && entry.releaseReference.contentId === entry.id)} />
              <p className="reading-loading" role="status">{strings.reading.unavailable}</p>
            </>
          )}
        </PlusAccessBoundary>
      ) : item ? (
        <ReadingArticle item={item} saveControl={<ReadingSaveControl key={`${userId}:${membershipState.kind}:${entry.id}:free`} entry={entry} itemId={item.id} revision={null} userId={userId} membershipKind={membershipState.kind} getAccessToken={getAccessToken} loadSave={loadSave} writeSave={writeSave} deleteSave={deleteSave} canSave={item.japaneseMaterial.kind === 'original' && item.sampleLabel === 'non-proprietary-teaching-sample'} />} />
      ) : (
        <p className="reading-loading" role="status">{strings.reading.unavailable}</p>
      )}
    </section>
  )
}

/** The body lives only inside an active membership child, which unmounts on loss of access. */
function ActivePlusReading({
  entry,
  userId,
  getAccessToken,
  loadPayload,
  saveControl,
}: {
  entry: ReadingCatalogEntry
  userId: string
  getAccessToken: () => Promise<string | null>
  loadPayload: ReadingLoader
  saveControl: ReactNode
}) {
  const strings = useStrings()
  const [detailState, setDetailState] = useState<DetailState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    void loadPayload(entry, getAccessToken, userId, controller.signal).then((result) => {
      if (!current || controller.signal.aborted) return
      setDetailState(result.kind === 'ok'
        ? { kind: 'ready', item: result.item }
        : { kind: 'unavailable' })
    }).catch(() => {
      if (current && !controller.signal.aborted) setDetailState({ kind: 'unavailable' })
    })
    return () => {
      current = false
      controller.abort()
    }
  }, [entry, getAccessToken, loadPayload, userId])

  if (detailState?.kind === 'ready') return <ReadingArticle item={detailState.item} saveControl={saveControl} />
  return (
    <>
      <ReadingMetadata entry={entry} />
      {saveControl}
      <p className="reading-loading" role="status">
        {detailState?.kind === 'unavailable' ? strings.reading.unavailable : strings.plus.states.checkingBody}
      </p>
    </>
  )
}

function ReadingMetadata({ entry }: { entry: ReadingCatalogEntry }) {
  const strings = useStrings()
  return (
    <div className="reading-preview-meta">
      <h1 id="reading-detail-title" lang="zh-TW">{entry.title}</h1>
      <p lang="zh-TW">{entry.summary}</p>
      <p>{strings.reading.source}: {entry.source.url
        ? <a href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.label}</a>
        : entry.source.label}</p>
      <p>{strings.reading.publishedOn}: {entry.releasedAt
        ? <time dateTime={entry.releasedAt}>{entry.releasedAt.slice(0, 10)}</time>
        : strings.reading.notDated}</p>
    </div>
  )
}

function ReadingArticle({ item, saveControl }: { item: ReadingRuntimeItem; saveControl?: ReactNode }) {
  const strings = useStrings()
  return (
    <article className="reading-article">
      <header className="reading-article__header">
        <p className="reading-eyebrow" lang="en">{strings.reading.eyebrow}</p>
        <div className="reading-card__meta">
          <span>{strings.reading.categories[item.category]}</span>
          <span className={`reading-access reading-access--${item.access}`}>
            {item.access === 'free' ? strings.reading.free : strings.reading.plus}
          </span>
          {item.sampleLabel && <span>{strings.reading.sampleLabel}</span>}
        </div>
        <h1 id="reading-detail-title" lang="zh-TW">{item.title}</h1>
        <p className="reading-article__summary" lang="zh-TW">{item.summary}</p>
        <dl className="reading-source">
          <div>
            <dt>{strings.reading.source}</dt>
            <dd>{item.source.url
              ? <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label}</a>
              : item.source.label}</dd>
          </div>
          <div>
            <dt>{strings.reading.publishedOn}</dt>
            <dd>{item.releasedAt
              ? <time dateTime={item.releasedAt}>{item.releasedAt.slice(0, 10)}</time>
              : strings.reading.notDated}</dd>
          </div>
          {item.source.publishedAt && (
            <div>
              <dt>{strings.reading.sourceDate}</dt>
              <dd><time dateTime={item.source.publishedAt}>{item.source.publishedAt.slice(0, 10)}</time></dd>
            </div>
          )}
        </dl>
      </header>

      {saveControl}

      <section className="reading-material" aria-labelledby="reading-material-title">
        <h2 id="reading-material-title">{strings.reading.japaneseMaterial}</h2>
        <ReadingParagraphs text={item.japaneseMaterial.text} lang="ja" />
      </section>

      <div className="reading-article__body">
        <section aria-labelledby="reading-explanation-title">
          <h2 id="reading-explanation-title">{strings.reading.explanation}</h2>
          <ReadingParagraphs text={item.explanationZhTW} lang="zh-TW" />
        </section>
        {item.vocabulary.length > 0 && <section aria-labelledby="reading-vocabulary-title">
          <h2 id="reading-vocabulary-title">{strings.reading.vocabulary}</h2>
          <dl className="reading-vocabulary">
            {item.vocabulary.map((word) => (
              <div key={`${word.term}-${word.meaningZhTW}`}>
                <dt lang="ja">{word.term}{word.reading ? <span lang="ja">（{word.reading}）</span> : null}</dt>
                <dd lang="zh-TW">{word.meaningZhTW}{word.noteZhTW ? <p>{word.noteZhTW}</p> : null}</dd>
              </div>
            ))}
          </dl>
        </section>}
        {item.logicAnalysis.length > 0 && <section aria-labelledby="reading-logic-title">
          <h2 id="reading-logic-title">{strings.reading.logic}</h2>
          <ol className="reading-logic">
            {item.logicAnalysis.map((point) => (
              <li key={`${point.label}-${point.explanationZhTW}`}>
                <h3 lang="zh-TW">{point.label}</h3>
                {point.japaneseText && <blockquote lang="ja">{point.japaneseText}</blockquote>}
                <p lang="zh-TW">{point.explanationZhTW}</p>
              </li>
            ))}
          </ol>
        </section>}
        <section className="reading-context" aria-labelledby="reading-context-title">
          <h2 id="reading-context-title">{strings.reading.businessContext}</h2>
          <ReadingParagraphs text={item.businessContextZhTW} lang="zh-TW" />
        </section>
        {item.davidCommentary && (
          <section className="reading-commentary" aria-labelledby="reading-commentary-title">
            <h2 id="reading-commentary-title">{strings.reading.davidCommentary}</h2>
            <ReadingParagraphs text={item.davidCommentary} lang="zh-TW" />
          </section>
        )}
      </div>

      <RelatedReading links={item.relatedLinks} />
    </article>
  )
}

type SaveViewState = { kind: 'loading' } | { kind: 'empty' } | { kind: 'saved'; save: ReadingSave } |
  { kind: 'error'; error: ReadingSaveError }

function ReadingSaveControl({
  entry, itemId, revision, userId, membershipKind, getAccessToken, loadSave, writeSave, deleteSave, canSave,
}: {
  entry: ReadingCatalogEntry
  itemId: string
  revision: string | null
  userId: string | null
  membershipKind: string
  getAccessToken: () => Promise<string | null>
  loadSave: SaveLoader
  writeSave: SaveWriter
  deleteSave: SaveRemover
  canSave: boolean
}) {
  const strings = useStrings()
  const { retry } = useMembershipAccess()
  const [state, setState] = useState<SaveViewState>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const eligibleMember = Boolean(userId && membershipKind === 'active-member')

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return
    setState({ kind: 'loading' })
    const result: ReadingSaveResult = await loadSave(itemId, getAccessToken, userId, signal)
    if (signal?.aborted) return
    setState(result.kind === 'ok'
      ? result.save ? { kind: 'saved', save: result.save } : { kind: 'empty' }
      : { kind: 'error', error: result })
  }, [getAccessToken, itemId, loadSave, userId])

  useEffect(() => {
    if (!eligibleMember || !userId) return
    const controller = new AbortController()
    void loadSave(itemId, getAccessToken, userId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setState(result.kind === 'ok'
        ? result.save ? { kind: 'saved', save: result.save } : { kind: 'empty' }
        : { kind: 'error', error: result })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ kind: 'error', error: { kind: 'unavailable' } })
    })
    return () => controller.abort()
  }, [eligibleMember, entry.slug, itemId, revision, userId, getAccessToken, loadSave])

  const act = async (remove: boolean) => {
    if (!userId || busy) return
    setBusy(true)
    try {
      const result: ReadingSaveMutationResult = remove
        ? await deleteSave(itemId, getAccessToken, userId)
        : canSave ? await writeSave(itemId, revision, getAccessToken, userId) : { kind: 'stale' }
      if (result.kind === 'ok') await refresh()
      else setState({ kind: 'error', error: result })
    } catch {
      setState({ kind: 'error', error: { kind: 'unavailable' } })
    } finally {
      setBusy(false)
    }
  }

  const stateText = () => {
    if (membershipKind === 'checking') return strings.reading.saveCheckingMembership
    if (membershipKind === 'signed-out' || !userId) return strings.reading.saveSignIn
    if (membershipKind === 'non-member') return strings.reading.savePlusRequired
    if (membershipKind === 'unavailable') return strings.reading.saveUnavailable
    if (state.kind === 'loading') return strings.reading.saveLoading
    if (state.kind === 'error') {
      if (state.error.kind === 'forbidden') return strings.reading.savePlusRequired
      if (state.error.kind === 'signed-out') return strings.reading.saveSignIn
      if (state.error.kind === 'stale') return strings.reading.saveStale
      return strings.reading.saveUnavailable
    }
    if (state.kind === 'saved' && state.save.revision !== revision) return strings.reading.saveStale
    return state.kind === 'saved' ? strings.reading.saveSaved : strings.reading.saveReady
  }
  const stale = state.kind === 'saved' && state.save.revision !== revision
  const active = eligibleMember && state.kind !== 'loading' && state.kind !== 'error'

  return (
    <aside className="reading-save" aria-label={strings.reading.saveLabel}>
      <p role="status">{stateText()}</p>
      {eligibleMember && state.kind === 'error' && <button type="button" className="reading-save__button" onClick={() => { void refresh().catch(() => setState({ kind: 'error', error: { kind: 'unavailable' } })) }}>{strings.reading.saveRetry}</button>}
      {membershipKind === 'unavailable' && <button type="button" className="reading-save__button" onClick={retry}>{strings.reading.saveRetry}</button>}
      {active && state.kind === 'empty' && canSave && <button type="button" className="reading-save__button" disabled={busy} onClick={() => void act(false)}>{busy ? strings.reading.saveWorking : strings.reading.saveAction}</button>}
      {active && state.kind === 'saved' && <div className="reading-save__actions">
        {stale && canSave && <button type="button" className="reading-save__button" disabled={busy} onClick={() => void act(false)}>{strings.reading.saveCurrentVersion}</button>}
        <button type="button" className="reading-save__button reading-save__button--quiet" disabled={busy} onClick={() => void act(true)}>{busy ? strings.reading.saveWorking : strings.reading.removeSave}</button>
      </div>}
    </aside>
  )
}

function ReadingParagraphs({ text, lang }: { text: string; lang: 'ja' | 'zh-TW' }) {
  return text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n+/).filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph, index) => <p key={index} lang={lang}>{paragraph}</p>)
}

function RelatedReading({ links }: { links: readonly ReadingRelatedLink[] }) {
  const strings = useStrings()
  const destinations = links.flatMap((link) => {
    const href = relatedHref(link)
    return href ? [{ ...link, href }] : []
  })
  if (!destinations.length) return null
  return (
    <nav className="reading-related" aria-label={strings.reading.related}>
      <h2>{strings.reading.related}</h2>
      <ul>
        {destinations.map((link) => <li key={`${link.kind}-${link.targetId}`}><Link to={link.href}><span lang="zh-TW">{link.label}</span> <span aria-hidden="true">↗</span></Link></li>)}
      </ul>
    </nav>
  )
}

function relatedHref(link: ReadingRelatedLink): string | null {
  if (link.kind === 'learn') {
    return getLearningUnitByLearnSlug(link.targetId) ? `/learn/${link.targetId}` : null
  }
  if (link.kind === 'practice') {
    return getLearningUnitByPracticeSlug(link.targetId) ? `/practice/${link.targetId}` : null
  }
  const entry = readingCatalog.find((candidate) => candidate.id === link.targetId)
  return entry ? `/read/${entry.slug}` : null
}
