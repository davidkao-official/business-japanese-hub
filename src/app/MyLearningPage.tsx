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

const catalog = validatePracticeDiscoveryCatalog(catalogDocument) ? catalogDocument : null

type PageState =
  | { kind: 'idle' }
  | { kind: 'signed-out' | 'non-member' | 'loading' | 'unavailable'; ownerId: string }
  | { kind: 'ready'; ownerId: string; snapshot: PracticeLearningSnapshot }
type SnapshotFetcher = typeof fetchPracticeLearningSnapshot

export function MyLearningPage({ fetchSnapshot = fetchPracticeLearningSnapshot }: { fetchSnapshot?: SnapshotFetcher } = {}) {
  useDocumentTitle('My Learning — Business Japanese Hub')
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
      const result = await fetchSnapshot(getAccessToken)
      if (cancelled || requestGeneration !== requestGenerationRef.current) return
      setPageState(result.kind === 'ok' ? { kind: 'ready', ownerId, snapshot: result.snapshot } : { kind: result.kind, ownerId })
    })
    return () => {
      cancelled = true
      requestGenerationRef.current += 1
    }
  }, [authLoading, fetchSnapshot, getAccessToken, membershipState.kind, requestKey, user])

  if (authLoading) return <MyLearningShell><StatePanel title="確認你的學習狀態" body="正在確認登入與會員狀態。" /></MyLearningShell>
  if (!user) return <MyLearningShell><SignedOutState /></MyLearningShell>
  if (membershipState.kind === 'checking') return <MyLearningShell><StatePanel title="確認 Plus 存取權" body="正在確認這個帳號的會員狀態。" /></MyLearningShell>
  if (membershipState.kind === 'non-member') return <MyLearningShell><NonMemberState /></MyLearningShell>
  if (membershipState.kind === 'unavailable') return <MyLearningShell><StatePanel title="目前無法確認會員狀態" body="會員權限暫時無法確認，學習紀錄在確認前不會顯示。" action={<button className="btn btn--secondary" type="button" onClick={retryMembership}>重試</button>} /></MyLearningShell>
  if (currentPageState.kind === 'signed-out') return <MyLearningShell><SignedOutState /></MyLearningShell>
  if (currentPageState.kind === 'non-member') return <MyLearningShell><NonMemberState /></MyLearningShell>
  if (currentPageState.kind === 'unavailable') return <MyLearningShell><StatePanel title="學習紀錄暫時無法取得" body="目前無法讀取你的已儲存 evidence；不會用本機資料替代。" action={<button className="btn btn--secondary" type="button" onClick={() => setRequestKey((current) => current + 1)}>重試</button>} /></MyLearningShell>
  if (currentPageState.kind !== 'ready') return <MyLearningShell><StatePanel title="載入你的學習紀錄" body="正在讀取已儲存的 Practice evidence。" /></MyLearningShell>

  return <MyLearningContent snapshot={currentPageState.snapshot} />
}

function MyLearningShell({ children }: { children: ReactNode }) {
  return <section className="page my-learning-page" lang="zh-TW" aria-labelledby="my-learning-title"><div className="my-learning-page__intro"><p className="product-mode-page__eyebrow" lang="en">My Learning · Practice</p><h1 className="page__title" id="my-learning-title">把下一次練習接在上一次之後</h1><p className="page__lead">這裡只顯示已由 Web Test 儲存的作答 evidence，幫你回到最值得繼續的地方。</p></div>{children}</section>
}

function SignedOutState() {
  return <section className="my-learning-page__state" aria-labelledby="my-learning-sign-in-title"><h2 id="my-learning-sign-in-title">登入後查看你的學習紀錄</h2><p>登入後，已儲存的 Web Test 作答與複習項目會在不同裝置間保留。</p><AuthPanel /><Link className="page__action" to="/practice/web-test">前往 Web Test 練習入口</Link></section>
}

function NonMemberState() {
  return <section className="my-learning-page__state" aria-labelledby="my-learning-member-title"><h2 id="my-learning-member-title">My Learning 是 Plus 會員學習紀錄</h2><p>成為 Plus 會員後，系統會保存你的 Practice 作答、錯題與下一步。</p><Link className="btn btn--primary" to="/plus">了解 Plus</Link></section>
}

function MyLearningContent({ snapshot }: { snapshot: PracticeLearningSnapshot }) {
  const nextAction = snapshot.nextAction.kind === 'start-practice'
    ? { title: '從 Web Test 開始', body: '完成一題後，這裡才會出現你的實際作答紀錄。', href: '/practice/web-test', label: '開始 Web Test 練習' }
    : snapshot.nextAction.kind === 'review-mistake'
      ? actionFor(snapshot.nextAction.item, true)
      : actionFor(snapshot.nextAction.item, false)
  const empty = snapshot.recentAttempts.length === 0
  return <>
    <section className="my-learning-page__next" aria-labelledby="my-learning-next-title"><p className="my-learning-page__section-label">下一步</p><h2 id="my-learning-next-title">{empty ? '從下一題開始建立你的學習紀錄' : nextAction.title}</h2><p>{empty ? '目前還沒有已儲存的 Practice 作答。' : nextAction.body}</p>{nextAction.href ? <Link className="btn btn--primary" to={nextAction.href}>{nextAction.label}</Link> : <p role="status">這筆紀錄目前無法安全開啟，請從最新的 Web Test 入口選擇練習範圍。</p>}</section>
    {(snapshot.actionableMistakes.length > 0 || !empty) && <section className="my-learning-page__section" aria-labelledby="my-learning-review-title"><div><p className="my-learning-page__section-label">Review</p><h2 id="my-learning-review-title">最近答錯的題目</h2><p>之後答對同一題，它就會從錯題複習清單中移除。</p></div>{snapshot.actionableMistakes.length > 0 ? <ul className="my-learning-page__review-list">{snapshot.actionableMistakes.map((item) => { const action = actionFor(item, true); return <li key={`${item.contentId}:${item.questionId}`}><span>{categoryLabelFor(item)}</span>{action.href ? <Link to={action.href}>複習這一題</Link> : <span role="status">目前無法安全開啟</span>}</li> })}</ul> : <p>目前沒有可複習的錯題。</p>}</section>}
    {!empty && <section className="my-learning-page__section" aria-labelledby="my-learning-recent-title"><p className="my-learning-page__section-label">Evidence</p><h2 id="my-learning-recent-title">最近的 Practice 作答</h2><ul className="my-learning-page__recent-list">{snapshot.recentAttempts.slice(0, 5).map((attempt) => <li key={`${attempt.contentId}:${attempt.questionId}:${attempt.createdAt}`}><span>{categoryLabelFor(attempt)}</span><span>{attempt.correct ? '回答正確' : '回答不正確'}</span><time dateTime={attempt.createdAt}>{new Date(attempt.createdAt).toLocaleDateString('zh-TW')}</time></li>)}</ul></section>}
    {!empty && <section className="my-learning-page__section" aria-labelledby="my-learning-signal-title"><p className="my-learning-page__section-label">分類訊號</p><h2 id="my-learning-signal-title">哪裡值得留意</h2>{snapshot.weakArea ? <p>{weakAreaCategoryLabel(snapshot.weakArea)}：最近 {snapshot.weakArea.sampleCount} 題中有 {snapshot.weakArea.incorrectCount} 題答錯，正答率 {snapshot.weakArea.accuracyPercent}%。</p> : <p>目前的作答樣本還不足以支持分類訊號。</p>}</section>}
  </>
}

const UNKNOWN_CATEGORY_LABEL = '目前分類'

function actionFor(item: PracticeReviewItem, review: boolean): { title: string; body: string; href: string | null; label: string } {
  const href = safeRunnerHref(item, review)
  return review
    ? { title: '複習最近答錯的題目', body: '從同一個目前可用的題目版本重新作答。', href, label: '複習這一題' }
    : { title: '繼續 SPI 練習', body: `接著練習「${categoryLabelFor(item)}」；系統沒有保存單一 session 位置。`, href, label: '繼續這個類別' }
}

function categoryLabelFor(item: Pick<PracticeReviewItem, 'contentId' | 'contentRevision' | 'testFamily' | 'domain' | 'category'>): string {
  if (!catalog || item.contentId !== catalog.releaseIdentity.contentId || item.contentRevision !== catalog.releaseIdentity.revision) return UNKNOWN_CATEGORY_LABEL
  return practiceDiscoveryCategoryLabel(catalog.releaseIdentity.contentId, item.testFamily, item.domain, item.category) ?? UNKNOWN_CATEGORY_LABEL
}

function weakAreaCategoryLabel(weakArea: NonNullable<PracticeLearningSnapshot['weakArea']>): string {
  if (!catalog) return UNKNOWN_CATEGORY_LABEL
  return practiceDiscoveryCategoryLabel(catalog.releaseIdentity.contentId, 'spi', weakArea.domain, weakArea.category) ?? UNKNOWN_CATEGORY_LABEL
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
