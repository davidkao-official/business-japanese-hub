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
import { fetchPracticePayload } from '../practice-web-test/client'
import { resolveQuestionCheckpoints, scoreAnswer, selectableQuestions, scoreQuestion, supportOverlay, type RunnerResponse, type RuntimeQuestion } from '../practice-web-test/runtime'
import type { PracticeRepresentation } from '../practice-web-test/contract'
import type { PracticeAnswer } from '../practice-web-test/contract'

const catalog = validatePracticeDiscoveryCatalog(catalogDocument) ? catalogDocument : null

const DOMAIN_LABELS: Record<PracticeDiscoveryDomain['domain'], string> = {
  verbal: '言語',
  nonverbal: '非言語',
}

const MODE_LABELS: Record<PracticeDiscoveryMode, string> = {
  'untimed-learning': '不計時學習',
  'timed-practice': '計時練習',
}

const WEB_TEST_DESCRIPTION = '獨立的日本求職 Web Test 練習入口，協助華語學習者準備 SPI 等選考中的日文閱讀與推理能力。'

function labelForFamily(testFamily: string): string {
  return catalog ? practiceDiscoveryFamilyLabel(catalog.releaseIdentity.contentId, testFamily) ?? '' : ''
}

function labelForCategory(
  testFamily: string,
  domain: PracticeDiscoveryDomain['domain'],
  category: PracticeDiscoveryCategory,
): string {
  return catalog
    ? practiceDiscoveryCategoryLabel(catalog.releaseIdentity.contentId, testFamily, domain, category.category) ?? ''
    : ''
}

function titleFor(...parts: string[]): string {
  return `${parts.join('｜')} — Business Japanese Hub`
}

function CatalogUnavailable() {
  return <NotFoundPage />
}

/** Keeps the Web Test route description scoped to its mounted route lifetime. */
function useWebTestDescription(): void {
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const description = existing ?? document.createElement('meta')
    const created = existing === null
    if (created) {
      description.name = 'description'
      document.head.append(description)
    }
    const previous = description.content
    description.content = WEB_TEST_DESCRIPTION
    return () => {
      if (created) description.remove()
      else description.content = previous
    }
  }, [])
}

export function WebTestHubPage() {
  useDocumentTitle('日本求職網路測驗刷題 — Business Japanese Hub')
  useWebTestDescription()
  if (!catalog) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-hub-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · Web Test</p>
        <h1 className="page__title" id="web-test-hub-title">日本求職網路測驗刷題</h1>
        <p className="page__lead">
          從 SPI 開始，透過日文題幹與解法練習日本求職選考中常見的閱讀與推理能力。
        </p>
      </div>

      <section className="web-test-hub__families" aria-labelledby="web-test-family-title">
        <h2 id="web-test-family-title">選擇測驗類型</h2>
        <ul>
          {catalog.families.map((family) => (
            <li key={family.testFamily}>
              <Link className="web-test-hub__family-link" to={`/practice/web-test/${family.testFamily}`}>
                <span className="web-test-hub__family-title">{labelForFamily(family.testFamily)}</span>
                <span>{releasedCount(family)} 題已發布</span>
                <span>選擇言語或非言語類別</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="web-test-hub__disclaimer">
        本服務為獨立的日本求職 Web Test 練習入口，與 SPI、玉手箱及任何出題或測驗機構無隸屬關係，亦不提供官方題目。
      </p>
    </section>
  )
}

export function WebTestFamilyPage() {
  const { family: familyParam } = useParams()
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  useDocumentTitle(family ? titleFor(labelForFamily(family.testFamily), '日本求職網路測驗刷題') : '頁面不存在')
  if (!catalog || !family) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-family-page-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · {labelForFamily(family.testFamily)}</p>
        <h1 className="page__title" id="web-test-family-page-title">{labelForFamily(family.testFamily)}</h1>
        <p className="page__lead">先選擇要練習的能力範圍。</p>
      </div>
      <section className="web-test-hub__families" aria-labelledby="web-test-domain-title">
        <h2 id="web-test-domain-title">選擇領域</h2>
        <ul>
          {family.domains.map((domain) => (
            <li key={domain.domain}>
              <Link className="web-test-hub__family-link" to={`/practice/web-test/${family.testFamily}/${domain.domain}`}>
                <span className="web-test-hub__family-title">{DOMAIN_LABELS[domain.domain]}</span>
                <span>{releasedCount(domain)} 題已發布</span>
                <span>查看已發布類別</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <Link className="page__action" to="/practice/web-test">返回測驗類型</Link>
    </section>
  )
}

export function WebTestCategoryPage() {
  const { family: familyParam, domain: domainParam } = useParams()
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  const domain = catalog && findPracticeDiscoveryDomain(catalog, familyParam, domainParam)
  useDocumentTitle(
    family && domain
      ? titleFor(DOMAIN_LABELS[domain.domain], labelForFamily(family.testFamily), '日本求職網路測驗刷題')
      : '頁面不存在',
  )
  if (!catalog || !family || !domain) return <CatalogUnavailable />

  return (
    <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-category-page-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · {labelForFamily(family.testFamily)} · {DOMAIN_LABELS[domain.domain]}</p>
        <h1 className="page__title" id="web-test-category-page-title">{DOMAIN_LABELS[domain.domain]}</h1>
        <p className="page__lead">選擇想先練習的類別。</p>
      </div>
      <section className="web-test-hub__families" aria-labelledby="web-test-category-title">
        <h2 id="web-test-category-title">選擇類別</h2>
        <ul>
          {domain.categories.map((category) => (
            <li className="web-test-hub__category" key={category.category}>
              <h3>{labelForCategory(family.testFamily, domain.domain, category)}</h3>
              <p>{category.releasedCount} 題已發布</p>
              <ul className="web-test-hub__mode-list">
                {category.modes.map((mode) => (
                  <li key={mode}>
                    <Link to={runnerEntryHref(family.testFamily, domain.domain, category.category, mode)}>
                      {MODE_LABELS[mode]}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <Link className="page__action" to={`/practice/web-test/${family.testFamily}`}>返回領域</Link>
    </section>
  )
}

/**
 * Stable direct-load handoff for #116. It names a released selection but does
 * not fetch, render, or infer access to proprietary question content.
 */
export function WebTestRunnerEntryPage() {
  const { family: familyParam, domain: domainParam, category: categoryParam } = useParams()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')
  const validSearch = [...searchParams.keys()].length === 1 && searchParams.has('mode')
  const family = catalog && findPracticeDiscoveryFamily(catalog, familyParam)
  const domain = catalog && findPracticeDiscoveryDomain(catalog, familyParam, domainParam)
  const category = catalog && findPracticeDiscoveryCategory(catalog, familyParam, domainParam, categoryParam)
  const validMode = typeof mode === 'string' && category?.modes.includes(mode as PracticeDiscoveryMode)
  const { user, loading: authLoading, getAccessToken } = useAuth()
  const [state, setState] = useState<RunnerState>({ kind: 'idle' })
  const [index, setIndex] = useState(0)
  const [response, setResponse] = useState<RunnerResponse>('')
  const [answers, setAnswers] = useState<Array<{ correct: boolean; category: string; checkpointMeasured: number; checkpointMisses: number; elapsedMs: number }>>([])
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [lastExplanation, setLastExplanation] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ question: RuntimeQuestion; correct: boolean } | null>(null)
  const [checkpointIndex, setCheckpointIndex] = useState<number | null>(null)
  const [checkpointResponse, setCheckpointResponse] = useState<RunnerResponse>('')
  const [checkpointFeedback, setCheckpointFeedback] = useState<boolean | null>(null)
  const startedAt = useRef<number>(0)
  const questionHeadingRef = useRef<HTMLHeadingElement>(null)
  const feedbackHeadingRef = useRef<HTMLHeadingElement>(null)
  const completionHeadingRef = useRef<HTMLHeadingElement>(null)
  const checkpointHeadingRef = useRef<HTMLHeadingElement>(null)
  const userId = user?.id
  const selectionKey = [catalog?.releaseIdentity.revision ?? '', family?.testFamily ?? '', domain?.domain ?? '', category?.category ?? '', mode ?? '', userId ?? ''].join('|')
  useEffect(() => {
    let cancelled = false
    if (!catalog || !family || !domain || !category || !validSearch || !validMode) return
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setState({ kind: userId ? 'loading' : 'idle' })
      setIndex(0)
      setResponse('')
      setAnswers([])
      setFeedback(null)
      setCheckpointIndex(null)
      setCheckpointResponse('')
      setCheckpointFeedback(null)
      setLastCorrect(null)
      setLastExplanation(null)
      startedAt.current = 0
      if (authLoading || !userId) return
      const result = await fetchPracticePayload(catalog.releaseIdentity.contentId, catalog.releaseIdentity.revision, getAccessToken)
      if (cancelled) return
      if (result.kind !== 'ok') { setState({ kind: result.kind }); return }
      const questions = selectableQuestions(result.payload, family!.testFamily, domain!.domain, category!.category, mode!)
      if (questions.length === 0) { setState({ kind: 'unavailable' }); return }
      if (questions.some((entry) => resolveQuestionCheckpoints(result.payload, entry) === null)) { setState({ kind: 'unavailable' }); return }
      setState({ kind: 'ready', payload: result.payload, questions, selectionKey })
      if (questions[0]?.answer.input.kind === 'ordering') setResponse(questions[0].answer.input.choices.map((choice) => choice.id))
      startedAt.current = Date.now()
    })
    return () => { cancelled = true }
  }, [authLoading, userId, getAccessToken, selectionKey, family, domain, category, mode, validMode, validSearch])
  const question = state.kind === 'ready' ? state.questions[index] : undefined
  const finish = index >= (state.kind === 'ready' ? state.questions.length : 0)
  useEffect(() => {
    if (checkpointIndex !== null) checkpointHeadingRef.current?.focus()
    else if (feedback) feedbackHeadingRef.current?.focus()
    else if (question) questionHeadingRef.current?.focus()
    else if (finish) completionHeadingRef.current?.focus()
  }, [feedback, checkpointFeedback, checkpointIndex, question, question?.id, finish])
  useDocumentTitle(
    family && domain && category && validSearch && validMode
      ? titleFor(labelForCategory(family.testFamily, domain.domain, category), DOMAIN_LABELS[domain.domain], labelForFamily(family.testFamily))
      : '頁面不存在',
  )
  if (!catalog || !family || !domain || !category || !validSearch || !validMode) return <CatalogUnavailable />

  const viewState = !authLoading && !user
    ? { kind: 'signed-out' as const }
    : state.kind === 'ready' && state.selectionKey !== selectionKey
      ? { kind: 'loading' as const }
      : state
  return (
      <section className="page web-test-hub" lang="zh-TW" aria-labelledby="web-test-runner-entry-title">
      <div className="web-test-hub__intro">
        <p className="product-mode-page__eyebrow" lang="en">Practice · {labelForFamily(family.testFamily)} · {DOMAIN_LABELS[domain.domain]}</p>
        <h1 className="page__title" id="web-test-runner-entry-title">{labelForCategory(family.testFamily, domain.domain, category)}</h1>
        <p className="page__lead">{MODE_LABELS[mode as PracticeDiscoveryMode]} · {category.releasedCount} 題已發布</p>
      </div>
      <RunnerStateView questionHeadingRef={questionHeadingRef} feedbackHeadingRef={feedbackHeadingRef} completionHeadingRef={completionHeadingRef} checkpointHeadingRef={checkpointHeadingRef} categoryLabel={labelForCategory(family.testFamily, domain.domain, category)} state={viewState} finish={finish} question={question} response={response} answers={answers} feedback={feedback} checkpointIndex={checkpointIndex} checkpointResponse={checkpointResponse} checkpointFeedback={checkpointFeedback} lastCorrect={lastCorrect} lastExplanation={lastExplanation} setResponse={setResponse} setCheckpointResponse={setCheckpointResponse} onSubmit={() => {
        if (!question || state.kind !== 'ready' || response === '') return
        const correct = scoreQuestion(question, response)
        setLastCorrect(correct)
        setLastExplanation(question.coreExplanation.concise)
        setFeedback({ question, correct })
        const checkpoints = state.kind === 'ready' ? resolveQuestionCheckpoints(state.payload, question) ?? [] : []
        setCheckpointIndex(checkpoints.length > 0 ? 0 : null)
        setCheckpointResponse(checkpoints.length > 0 ? initialResponse(checkpoints[0]!.answer) : '')
        setCheckpointFeedback(null)
        setAnswers((current) => [...current, { correct, category: question.category, checkpointMeasured: 0, checkpointMisses: 0, elapsedMs: Date.now() - startedAt.current }])
      }} onCheckpointSubmit={() => {
        if (state.kind !== 'ready' || !question || checkpointIndex === null || checkpointFeedback !== null) return
        const checkpoint = resolveQuestionCheckpoints(state.payload, question)?.[checkpointIndex]
        if (!checkpoint || checkpointResponse === '') return
        const correct = scoreAnswer(checkpoint.answer, checkpointResponse)
        setCheckpointFeedback(correct)
        setAnswers((current) => current.map((answer, position) => position === current.length - 1 ? { ...answer, checkpointMeasured: answer.checkpointMeasured + 1, checkpointMisses: answer.checkpointMisses + (correct ? 0 : 1) } : answer))
      }} onCheckpointNext={() => {
        if (state.kind !== 'ready' || !question || checkpointIndex === null) return
        const checkpoints = resolveQuestionCheckpoints(state.payload, question) ?? []
        if (checkpointIndex + 1 < checkpoints.length) {
          setCheckpointIndex(checkpointIndex + 1)
          setCheckpointResponse(initialResponse(checkpoints[checkpointIndex + 1]!.answer))
          setCheckpointFeedback(null)
        } else {
          const nextQuestion = state.questions[index + 1]
          setIndex((current) => current + 1)
          setResponse(nextQuestion?.answer.input.kind === 'ordering' ? nextQuestion.answer.input.choices.map((choice) => choice.id) : '')
          setFeedback(null)
          setCheckpointIndex(null)
          setCheckpointResponse('')
          setCheckpointFeedback(null)
          setLastCorrect(null)
          setLastExplanation(null)
          startedAt.current = Date.now()
        }
      }} onNext={() => {
        const nextQuestion = state.kind === 'ready' ? state.questions[index + 1] : undefined
        setIndex((current) => current + 1)
        setResponse(nextQuestion?.answer.input.kind === 'ordering' ? nextQuestion.answer.input.choices.map((choice) => choice.id) : '')
        setFeedback(null)
        setCheckpointIndex(null)
        setCheckpointResponse('')
        setCheckpointFeedback(null)
        setLastCorrect(null)
        setLastExplanation(null)
        startedAt.current = Date.now()
      }} />
      <Link className="page__action" to={`/practice/web-test/${family.testFamily}/${domain.domain}`}>返回類別</Link>
    </section>
  )
}

type RunnerState = { kind: 'idle' | 'loading' | 'signed-out' | 'forbidden' | 'unavailable' | 'missing' } | { kind: 'ready'; payload: import('../content-delivery/privatePracticeQuestionBank').PracticeRuntimePayload; questions: RuntimeQuestion[]; selectionKey: string }

function RunnerStateView({ questionHeadingRef, feedbackHeadingRef, completionHeadingRef, checkpointHeadingRef, categoryLabel, state, finish, question, response, answers, feedback, checkpointIndex, checkpointResponse, checkpointFeedback, lastCorrect, lastExplanation, setResponse, setCheckpointResponse, onSubmit, onCheckpointSubmit, onCheckpointNext, onNext }: { questionHeadingRef: RefObject<HTMLHeadingElement | null>; feedbackHeadingRef: RefObject<HTMLHeadingElement | null>; completionHeadingRef: RefObject<HTMLHeadingElement | null>; checkpointHeadingRef: RefObject<HTMLHeadingElement | null>; categoryLabel: string; state: RunnerState; finish: boolean; question?: RuntimeQuestion; response: RunnerResponse; answers: Array<{ correct: boolean; category: string; checkpointMeasured: number; checkpointMisses: number; elapsedMs: number }>; feedback: { question: RuntimeQuestion; correct: boolean } | null; checkpointIndex: number | null; checkpointResponse: RunnerResponse; checkpointFeedback: boolean | null; lastCorrect: boolean | null; lastExplanation: string | null; setResponse: (value: RunnerResponse) => void; setCheckpointResponse: (value: RunnerResponse) => void; onSubmit: () => void; onCheckpointSubmit: () => void; onCheckpointNext: () => void; onNext: () => void }) {
  if (state.kind === 'signed-out') return <section className="web-test-hub__runner-handoff"><h2>需要登入</h2><p>請登入後才能載入會員練習內容。</p></section>
  if (state.kind === 'forbidden') return <section className="web-test-hub__runner-handoff"><h2>需要 Plus 會員資格</h2><p>目前帳號沒有可用的 Plus 練習存取權。</p></section>
  if (state.kind === 'missing' || state.kind === 'unavailable') return <section className="web-test-hub__runner-handoff"><h2>練習暫時無法使用</h2><p>目前無法取得已發布練習內容，請稍後再試。</p></section>
  if (state.kind === 'idle' || state.kind === 'loading') return <section className="web-test-hub__runner-handoff"><h2>載入練習</h2><p>正在確認已發布內容與會員存取權。</p></section>
  if (finish) {
    const categoryResults = Array.from(new Set(answers.map((answer) => answer.category))).map((category) => {
      const categoryAnswers = answers.filter((answer) => answer.category === category)
      return `${categoryLabel}：${categoryAnswers.filter((answer) => answer.correct).length}／${categoryAnswers.length}`
    })
    const correctCount = answers.filter((answer) => answer.correct).length
    const accuracy = answers.length === 0 ? 0 : Math.round((correctCount / answers.length) * 100)
    const measured = answers.reduce((total, answer) => total + answer.checkpointMeasured, 0)
    const misses = answers.reduce((total, answer) => total + answer.checkpointMisses, 0)
    return <section className="web-test-hub__runner-handoff"><h2 ref={completionHeadingRef} tabIndex={-1}>練習完成</h2><p>正確 {correctCount}／{answers.length} 題（正答率 {accuracy}%）；結果只保留在目前頁面。</p>{categoryResults.map((result) => <p key={result}>{result}</p>)}<p>作答時間：{Math.round(answers.reduce((total, answer) => total + answer.elapsedMs, 0) / 1000)} 秒。</p><p>{measured > 0 ? `已觀測到檢查點未通過：${misses}／${measured}` : '檢查點：未測量／資料不足'}</p></section>
  }
  if (state.kind !== 'ready' || !question) return null
  const answer = question.answer
  const overlay = supportOverlay(state.payload, question)
  if (feedback?.question.id === question.id) {
    const checkpoints = state.kind === 'ready' ? resolveQuestionCheckpoints(state.payload, question) ?? [] : []
    const checkpoint = checkpointIndex === null ? undefined : checkpoints[checkpointIndex]
    return <section className="web-test-hub__runner" aria-live="polite"><p role="status">{feedback.correct ? '回答正確' : '回答不正確'}</p><h2 ref={feedbackHeadingRef} tabIndex={-1}>解答與說明</h2><p>正確答案：<span lang="ja">{answerLabel(answer)}</span></p><p lang="ja">{question.coreExplanation.concise}</p><p lang="ja">{question.coreExplanation.whatIsAskedJa}</p>{question.coreExplanation.representation && <RepresentationView representation={question.coreExplanation.representation} label="解答表示" />}{overlay?.concise && <p>{overlay.concise}</p>}{overlay?.whatIsAsked && <p>{overlay.whatIsAsked}</p>}{overlay?.representationExplanation && <p>{overlay.representationExplanation}</p>}{overlay?.commonMisread && <p>{overlay.commonMisread}</p>}{overlay?.keyTerms?.map((term) => <p key={term.termId}><span lang="ja">{term.surface}</span>：{term.meaning}{term.note && `（${term.note}）`}</p>)}{checkpoint && <section aria-labelledby="checkpoint-title"><h3 id="checkpoint-title" ref={checkpointHeadingRef} tabIndex={-1}>理解檢查 {checkpointIndex! + 1}</h3><p lang="ja">{checkpoint.promptJa}</p>{checkpointFeedback !== null ? <><p role="status">{checkpointFeedback ? '檢查點回答正確' : '檢查點回答不正確'}</p><button type="button" onClick={onCheckpointNext}>{checkpointIndex! + 1 < checkpoints.length ? '下一個檢查點' : '下一題'}</button></> : <>{renderInput(checkpoint.answer, checkpointResponse, setCheckpointResponse)}<button type="button" disabled={checkpointResponse === '' || (Array.isArray(checkpointResponse) && checkpointResponse.length === 0)} onClick={onCheckpointSubmit}>回答檢查點</button></>}</section>}{!checkpoint && <button type="button" onClick={onNext}>下一題</button>}</section>
  }
  return <section className="web-test-hub__runner" aria-live="polite">{lastCorrect !== null && <p role="status">{lastCorrect ? '回答正確' : '回答不正確'}{lastExplanation && <>：<span lang="ja">{lastExplanation}</span></>}</p>}<p>第 {answers.length + 1}／{state.questions.length} 題</p><h2 ref={questionHeadingRef} tabIndex={-1} lang="ja">{question.promptJa}</h2>
    {question.promptRepresentation && <RepresentationView representation={question.promptRepresentation} label="題目表示" />}
    {renderInput(answer, response, setResponse)}
    <button type="button" disabled={response === '' || (Array.isArray(response) && response.length === 0)} onClick={onSubmit}>回答</button>
  </section>
}

function RepresentationView({ representation, label }: { representation: PracticeRepresentation; label: string }) {
  if (representation.kind === 'equation') return <figure aria-label={label}><figcaption>{label}</figcaption><pre lang="ja">{representation.expression}</pre></figure>
  if (representation.kind === 'table') return <figure aria-label={label}><figcaption>{label}</figcaption><table><thead><tr>{representation.columns.map((column) => <th lang="ja" key={column} scope="col">{column}</th>)}</tr></thead><tbody>{representation.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td lang="ja" key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></figure>
  if (representation.kind === 'diagram') { const labels = new Map(representation.nodes.map((node) => [node.id, node.label])); return <figure aria-label={label}><figcaption lang="ja">{representation.altText}</figcaption><ul>{representation.nodes.map((node) => <li lang="ja" key={node.id}>{node.label}</li>)}</ul>{representation.edges.map((edge, index) => <p lang="ja" key={`${edge.from}-${edge.to}-${index}`}>{labels.get(edge.from) ?? edge.from} → {labels.get(edge.to) ?? edge.to}{edge.label ? `：${edge.label}` : ''}</p>)}</figure> }
  if (representation.kind === 'elimination') return <figure aria-label={label}><figcaption>{label}</figcaption><ul>{representation.candidates.map((candidate) => <li lang="ja" key={candidate}>{candidate}</li>)}</ul><ol>{representation.steps.map((step) => <li lang="ja" key={step}>{step}</li>)}</ol></figure>
  if (representation.kind === 'logic-grid') return <figure aria-label={label}><figcaption>{label}</figcaption><table><thead><tr>{representation.columns.map((column) => <th lang="ja" key={column} scope="col">{column}</th>)}</tr></thead><tbody>{representation.rows.map((row) => <tr key={row}>{representation.columns.map((column) => <td key={column}>{representation.cells.find((cell) => cell.row === row && cell.column === column)?.value ?? (column === representation.columns[0] ? row : 'unknown')}</td>)}</tr>)}</tbody></table></figure>
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

function renderInput(answer: RuntimeQuestion['answer'], response: RunnerResponse, setResponse: (value: RunnerResponse) => void) {
  if (answer.input.kind === 'short-text') return <label>文字答案<input type="text" value={typeof response === 'string' ? response : ''} onChange={(event) => setResponse(event.currentTarget.value)} /></label>
  if (answer.input.kind === 'number') return <label>數值答案<input type="number" value={typeof response === 'number' ? response : ''} onChange={(event) => setResponse(event.currentTarget.value === '' ? '' : Number(event.currentTarget.value))} /></label>
  if (answer.input.kind === 'ordering') {
    const input = answer.input as Extract<RuntimeQuestion['answer'], { input: { kind: 'ordering' } }>['input']
    const ordered = Array.isArray(response) ? response : input.choices.map((choice) => choice.id)
    return <fieldset><legend>排列順序</legend><ol>{ordered.map((choiceId, position) => { const choice = input.choices.find((entry) => entry.id === choiceId)!; return <li key={choice.id}><span lang="ja">{choice.textJa}</span>{choice.representation && <RepresentationView representation={choice.representation} label={`${choice.textJa} 表示`} />}<button type="button" aria-label={`${choice.textJa} 上移`} disabled={position === 0} onClick={() => setResponse(ordered.map((id, i) => i === position - 1 ? ordered[position]! : i === position ? ordered[position - 1]! : id))}>上移</button><button type="button" aria-label={`${choice.textJa} 下移`} disabled={position === ordered.length - 1} onClick={() => setResponse(ordered.map((id, i) => i === position ? ordered[position + 1]! : i === position + 1 ? ordered[position]! : id))}>下移</button></li> })}</ol></fieldset>
  }
  if (answer.input.kind === 'single-choice' || answer.input.kind === 'multi-select') return <fieldset><legend>選擇答案</legend>{answer.input.choices.map((choice) => <label key={choice.id}><input type={answer.input.kind === 'multi-select' ? 'checkbox' : 'radio'} name="practice-answer" value={choice.id} checked={Array.isArray(response) ? response.includes(choice.id) : response === choice.id} onChange={() => setResponse(answer.input.kind === 'multi-select' ? (Array.isArray(response) ? response.includes(choice.id) ? response.filter((id) => id !== choice.id) : [...response, choice.id] : [choice.id]) : choice.id)} /> <span lang="ja">{choice.textJa}</span>{choice.representation && <RepresentationView representation={choice.representation} label={`${choice.textJa} 表示`} />}</label>)}</fieldset>
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
