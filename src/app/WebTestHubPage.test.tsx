import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Link, Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import {
  WebTestCategoryPage,
  WebTestFamilyPage,
  WebTestHubPage,
  WebTestRunnerEntryPage,
} from './WebTestHubPage'
import { preparePrivatePracticeQuestionBankRelease } from '../content-delivery/privatePracticeQuestionBank'
import { nonProprietaryPracticeQuestionBankFixture } from '../practice-web-test/fixtures/nonProprietaryPracticeFixture'

const fetchPracticePayloadMock = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: 'signed-out' }))
const submitPracticeAttemptMock = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: 'ok' }))
vi.mock('../practice-web-test/client', () => ({ fetchPracticePayload: fetchPracticePayloadMock, submitPracticeAttempt: submitPracticeAttemptMock }))

afterEach(() => {
  cleanup()
  submitPracticeAttemptMock.mockClear()
  document.querySelector('meta[data-test-web-test-description]')?.remove()
  vi.unstubAllGlobals()
})

function renderWebTestAt(path: string, options: Parameters<typeof renderWithAppProviders>[1] = {}) {
  return renderWithAppProviders(
    <Routes>
      <Route path="/practice/web-test" element={<WebTestHubPage />} />
      <Route path="/practice/web-test/:family" element={<WebTestFamilyPage />} />
      <Route path="/practice/web-test/:family/:domain" element={<WebTestCategoryPage />} />
      <Route path="/practice/web-test/:family/:domain/:category" element={<WebTestRunnerEntryPage />} />
    </Routes>,
    { initialEntries: [path], ...options },
  )
}

function syntheticRuntimePayload(promptJa: string, category = 'vocabulary-in-context') {
  const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', nonProprietaryPracticeQuestionBankFixture)
  if (!release.ok) throw new Error(release.reason)
  const question = {
    ...release.value.payload.questionBank.questions[0]!,
    id: `synthetic-${category}`,
    testFamily: 'spi' as const,
    domain: 'verbal' as const,
    category,
    promptJa,
  }
  return {
    ...release.value.payload,
    questionBank: { ...release.value.payload.questionBank, questions: [question] },
    supportOverlays: [],
  }
}

describe('Web Test discovery and runner-entry routes', () => {
  it('sets an independent Japanese recruitment Web Test description and restores the prior route description on leave', () => {
    const description = document.createElement('meta')
    description.name = 'description'
    description.content = '原有頁面描述'
    description.dataset.testWebTestDescription = 'true'
    document.head.append(description)
    const original = description.content

    renderWithAppProviders(
      <Routes>
        <Route path="/practice/web-test" element={(
          <>
            <WebTestHubPage />
            <Link to="/practice">離開 Web Test</Link>
          </>
        )} />
        <Route path="/practice" element={<p>Practice overview</p>} />
      </Routes>,
      { initialEntries: ['/practice/web-test'] },
    )

    expect(description.content).toBe(
      "日本での就職・転職に向けた Web テスト練習。SPI などの選考で求められる読解力、判断力、数的処理を日本語で鍛えます。",
    )
    fireEvent.click(screen.getByRole('link', { name: '離開 Web Test' }))
    expect(screen.getByText('Practice overview')).toBeInTheDocument()
    expect(description.content).toBe(original)
  })

  it('moves from the hub through released SPI domains and categories without a fixture count', () => {
    renderWebTestAt('/practice/web-test')

    expect(screen.getByRole('heading', { name: "就職・転職向けWebテストを練習する" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "SPI を初めて受ける方へ" })).toHaveAttribute(
      'href',
      '/practice/web-test/about-spi',
    )
    const families = screen.getByRole('region', { name: "テストを選ぶ" })
    expect(within(families).getByRole('link', { name: /SPI/ })).toHaveAttribute('href', '/practice/web-test/spi')
    expect(screen.queryByText('玉手箱', { selector: '.web-test-hub__family-title' })).not.toBeInTheDocument()

    cleanup()
    renderWebTestAt('/practice/web-test/spi/verbal')
    const category = screen.getByRole('heading', { name: "文脈と語句の意味" }).closest('li')
    expect(category).not.toBeNull()
    expect(within(category!).getByRole('link', { name: "時間を計らず練習" })).toHaveAttribute(
      'href',
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning',
    )
  })

  it('keeps a valid runner selection directly loadable while signed out', async () => {
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning')

    expect(screen.getByRole('heading', { name: "文脈と語句の意味" })).toBeInTheDocument()
    expect(screen.getByText("時間を計らず練習 · 5 問公開中")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("会員向けの練習を始めるには、ログインしてください。")).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /開始|送出|開始練習/ })).not.toBeInTheDocument()
  })

  it('loads only the persisted question for an exact My Learning review link', async () => {
    const payload = syntheticRuntimePayload('指定複習題的合成題幹')
    const question = payload.questionBank.questions[0]!
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload })
    renderWebTestAt(
      `/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning&review=${encodeURIComponent(question.id)}&reviewVersion=${question.version}`,
      { session: { id: 'synthetic-member' } },
    )

    await waitFor(() => expect(screen.getByRole('heading', { name: '指定複習題的合成題幹' })).toBeInTheDocument())
    expect(screen.getByText("1／1 問目")).toBeInTheDocument()
  })

  it('fails closed when an exact review question is no longer in the current release', async () => {
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('目前版本的合成題幹') })
    renderWebTestAt(
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning&review=removed-question&reviewVersion=1',
      { session: { id: 'synthetic-member' } },
    )

    await waitFor(() => expect(screen.getByRole('heading', { name: "この問題は復習できなくなりました" })).toBeInTheDocument())
    expect(screen.getByText("問題が更新された可能性があります。学習記録に戻り、最新の記録を確認してください。")).toBeInTheDocument()
  })

  it('runs a synthetic member flow with ordering, authored feedback, and truthful category results', async () => {
    fetchPracticePayloadMock.mockClear()
    const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', nonProprietaryPracticeQuestionBankFixture)
    if (!release.ok) throw new Error(release.reason)
    const sourceQuestion = release.value.payload.questionBank.questions[0]!
    const first = {
      ...sourceQuestion,
      id: 'synthetic-ordering-01',
      testFamily: 'spi' as const,
      category: 'vocabulary-in-context',
      promptJa: '表示を順番に並べてください。',
      promptRepresentation: { kind: 'table' as const, columns: ["項目"], rows: [['合成問題']] },
      answer: { input: { kind: 'ordering' as const, choices: [{ id: 'one', textJa: '一番', representation: { kind: 'equation' as const, expression: '1' } }, { id: 'two', textJa: '二番', representation: { kind: 'diagram' as const, altText: '合成図', nodes: [{ id: 'a', label: '起点' }, { id: 'b', label: '終点' }], edges: [{ from: 'a', to: 'b', label: '進む' }] } }] }, expectedAnswer: { kind: 'ordering' as const, choiceIds: ['two', 'one'] }, scoring: { kind: 'exact-order' as const } },
      coreExplanation: { concise: '順序を確認します。', whatIsAskedJa: '二番を先にすることが求められています。', representation: { kind: 'logic-grid' as const, columns: ['職位'], rows: ['甲'], cells: [{ row: '甲', column: '職位', value: 'yes' as const }] } },
      itemAnalysis: { ...sourceQuestion.itemAnalysis, diagnosticCheckpoints: { registryVersion: 1, ids: ['synthetic-checkpoint-01', 'synthetic-checkpoint-02'] } },
    }
    const second = {
      ...sourceQuestion,
      id: 'synthetic-choice-02',
      testFamily: 'spi' as const,
      category: 'vocabulary-in-context',
      promptJa: '二番を選んでください。',
    }
    fetchPracticePayloadMock.mockResolvedValueOnce({
      kind: 'ok',
      payload: {
        ...release.value.payload,
        questionBank: { ...release.value.payload.questionBank, questions: [first, second] },
        checkpointRegistry: { version: 1, checkpoints: [{ id: 'synthetic-checkpoint-01', version: 1, questionId: first.id, questionVersion: first.version, dimension: 'meaning' as const, promptJa: '請輸入三。', answer: { input: { kind: 'number' as const }, expectedAnswer: { kind: 'number' as const, value: 3 }, scoring: { kind: 'numeric' as const } } }, { id: 'synthetic-checkpoint-02', version: 1, questionId: first.id, questionVersion: first.version, dimension: 'execution' as const, promptJa: '請輸入四。', answer: { input: { kind: 'number' as const }, expectedAnswer: { kind: 'number' as const, value: 4 }, scoring: { kind: 'numeric' as const } } }] },
        supportOverlays: [
          { questionId: first.id, questionVersion: first.version, version: 1, byLocale: { 'zh-Hant': { concise: '合成提示。', whatIsAsked: '請依序排列。', representationExplanation: '這是合成表示。', commonMisread: '不要倒置順序。', keyTerms: [{ termId: 'term-choice', surface: '選択', meaning: '選擇', note: '合成備註' }] } } },
          { questionId: second.id, questionVersion: second.version, version: 1, byLocale: { 'zh-Hant': { whatIsAsked: '請選擇第二個選項。' } } },
        ],
      },
    })

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByText("1／2 問目")).toBeInTheDocument())
    expect(screen.getByRole('figure', { name: "問題の図・表" })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: "一番の図・表" })).toBeInTheDocument()
    expect(screen.getByText('起点 → 終点：進む')).toBeInTheDocument()
    expect(screen.queryByText('合成提示。')).not.toBeInTheDocument()
    expect(screen.queryByText('選択')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '二番を上へ' }))
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('二番')
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    nowSpy.mockReturnValue(9000)
    expect(screen.getByText('二番、一番')).toHaveAttribute('lang', 'ja')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: "解答と解説" }))
    expect(screen.getByText('這是合成表示。')).toBeInTheDocument()
    expect(screen.getByText('不要倒置順序。')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: '甲' })).toBeInTheDocument()
    expect(screen.getByText('該当')).toBeInTheDocument()
    expect(screen.getByText('這是合成表示。')).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText('不要倒置順序。')).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText('請輸入三。')).toHaveAttribute('lang', 'ja')
    rendered.authClient.emitAuthStateChange({ id: 'synthetic-member', email: 'refreshed@example.com' })
    await Promise.resolve()
    await waitFor(() => expect(screen.getByText('請輸入三。')).toBeInTheDocument())
    expect(fetchPracticePayloadMock).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText("数値を入力"), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: "確認問題に解答する" }))
    expect(screen.getByText("確認問題：正解")).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /確認問題/ }))
    fireEvent.click(screen.getByRole('button', { name: "次の確認問題へ" }))
    expect(screen.getByText('請輸入四。')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /確認問題/ }))
    fireEvent.change(screen.getByLabelText("数値を入力"), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: "確認問題に解答する" }))
    expect(screen.getByText("確認問題：正解")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("解答を保存しました。")).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: "次の問題へ" }))
    expect(screen.getByText("2／2 問目")).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '二番を選んでください。' }))
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByText("解答を保存しました。")).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: "次の問題へ" }))
    expect(screen.getByText('正解 2／2 問（正答率 100%） · 解答を保存しました。')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: "練習が終わりました" }))
    expect(screen.getByText("文脈と語句の意味：2／2")).toBeInTheDocument()
    expect(screen.getByText('確認問題の不正解：0／2')).toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(2)
    const firstAttempt = submitPracticeAttemptMock.mock.calls[0]![0] as Record<string, unknown>
    expect(Object.keys(firstAttempt).sort()).toEqual([
      'answer', 'checkpointResponses', 'clientIdempotencyKey', 'contentId', 'questionId', 'questionVersion', 'responseTimeMs', 'revision',
    ])
    expect(firstAttempt).toEqual(expect.objectContaining({
      contentId: 'practice-web-test-spi-v1',
      revision: expect.any(String),
      questionId: first.id,
      questionVersion: first.version,
      answer: ['two', 'one'],
      checkpointResponses: [
        { checkpointId: 'synthetic-checkpoint-01', checkpointVersion: 1, response: 3 },
        { checkpointId: 'synthetic-checkpoint-02', checkpointVersion: 1, response: 4 },
      ],
    }))
    expect(firstAttempt.responseTimeMs).toBe(0)
    expect(JSON.stringify(firstAttempt)).not.toMatch(/userId|correct|category|mode|diagnosis|promptJa/)
    nowSpy.mockRestore()
  })

  it('retries a lost response and then allows progression after the attempt is saved', async () => {
    fetchPracticePayloadMock.mockClear()
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValue({ kind: 'ok' })
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('失敗時の合成題幹') })
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '失敗時の合成題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("解答が保存されたか確認できません。"))
    expect(screen.queryByText("解答を保存しました。")).not.toBeInTheDocument()
    const nextButton = screen.getByRole('button', { name: "次の問題へ" })
    expect(nextButton).toBeDisabled()
    fireEvent.click(nextButton)
    expect(screen.getByRole('heading', { name: "解答と解説" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "保存を再試行" }))
    await waitFor(() => expect(screen.getByText("解答を保存しました。")).toBeInTheDocument())
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(2)
    expect(submitPracticeAttemptMock.mock.calls[1]![0]).toEqual(submitPracticeAttemptMock.mock.calls[0]![0])
    fireEvent.click(screen.getByRole('button', { name: "次の問題へ" }))
    expect(screen.getByRole('heading', { name: "練習が終わりました" })).toBeInTheDocument()
  })

  it('treats a stale attempt rejection as terminal and keeps progression blocked', async () => {
    fetchPracticePayloadMock.mockClear()
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind: 'stale' })
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('版本更新の合成題幹') })
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '版本更新の合成題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("問題が更新されたため、解答は保存されていません。"))
    expect(screen.queryByRole('button', { name: "保存を再試行" })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: "次の問題へ" })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: "最新の問題を読み込む" }))
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: "単元一覧へ" })).toBeInTheDocument()
  })

  it.each([
    ['signed-out', "ログインの有効期限が切れたため、保存を確認できません。画面上部から再ログインし、保存を再試行してください。", true],
    ['forbidden', "現在、このアカウントでは Plus の練習を利用できず、保存を確認できません。", true],
    ['missing', "問題を取得できないため、解答は保存されていません。", false],
  ] as const)('keeps a %s attempt result terminal and truthful', async (kind, message, retryable) => {
    fetchPracticePayloadMock.mockClear()
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind })
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload(`${kind} 結果の合成題幹`) })
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: `${kind} 結果の合成題幹` })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
    if (retryable) expect(screen.getByRole('button', { name: "保存を再試行" })).toBeInTheDocument()
    else expect(screen.queryByRole('button', { name: "保存を再試行" })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: "次の問題へ" })).toBeDisabled()
    expect(screen.queryByText("解答を保存しました。")).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: "単元一覧へ" })).toBeInTheDocument()
    if (kind === 'missing') expect(screen.getByRole('button', { name: "最新の問題を読み込む" })).toBeInTheDocument()
  })

  it.each([
    ['invalid', "解答を確認できず、保存されていません。単元一覧に戻り、問題を読み込み直して解答してください。", false],
    ['unavailable', "解答が保存されたか確認できません。", true],
  ] as const)('keeps a %s result from claiming saved or enabling progression', async (kind, message, retryable) => {
    fetchPracticePayloadMock.mockClear()
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind })
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload(`${kind} 結果の合成題幹`) })
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: `${kind} 結果の合成題幹` })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
    if (retryable) expect(screen.getByRole('button', { name: "保存を再試行" })).toBeInTheDocument()
    else expect(screen.queryByRole('button', { name: "保存を再試行" })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: "次の問題へ" })).toBeDisabled()
    expect(screen.queryByText("解答を保存しました。")).not.toBeInTheDocument()
  })

  it('treats an out-of-range response time as terminal without retry and allows the next question', async () => {
    fetchPracticePayloadMock.mockClear()
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind: 'invalid-response-time' })
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('超限時間の合成題幹') })
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '超限時間の合成題幹' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    nowSpy.mockReturnValue(3_601_001)
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("解答時間が記録可能な範囲を超えたため、保存できません。"))
    expect(submitPracticeAttemptMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ responseTimeMs: 3_600_001 }))
    expect(screen.queryByRole('button', { name: "保存を再試行" })).not.toBeInTheDocument()
    const nextButton = screen.getByRole('button', { name: "次の問題へ" })
    expect(nextButton).toBeEnabled()
    fireEvent.click(nextButton)
    expect(screen.getByRole('heading', { name: "練習が終わりました" })).toBeInTheDocument()
    nowSpy.mockRestore()
  })

  it('reports unsaved portions when one attempt is rejected for response time', async () => {
    fetchPracticePayloadMock.mockClear()
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind: 'invalid-response-time' }).mockResolvedValueOnce({ kind: 'ok' })
    const payload = syntheticRuntimePayload('第一題超限時間')
    const first = payload.questionBank.questions[0]!
    fetchPracticePayloadMock.mockResolvedValueOnce({
      kind: 'ok',
      payload: { ...payload, questionBank: { ...payload.questionBank, questions: [first, { ...first, id: 'synthetic-second', promptJa: '第二題正常儲存' }] } },
    })
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '第一題超限時間' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    nowSpy.mockReturnValue(3_601_001)
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("解答時間が記録可能な範囲を超えたため、保存できません。"))
    fireEvent.click(screen.getByRole('button', { name: "次の問題へ" }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '第二題正常儲存' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByText("解答を保存しました。")).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: "次の問題へ" }))
    expect(screen.getByText('正解 2／2 問（正答率 100%） · 解答時間が記録可能な範囲を超えたため、一部の解答は保存されていません。')).toBeInTheDocument()
    expect(screen.queryByText('結果只保留在目前頁面')).not.toBeInTheDocument()
    nowSpy.mockRestore()
  })

  it('ignores a deferred attempt completion after the authenticated runner changes', async () => {
    let resolveFirst!: (result: { kind: 'ok' }) => void
    const firstAttempt = new Promise<{ kind: 'ok' }>((resolve) => { resolveFirst = resolve })
    fetchPracticePayloadMock.mockClear()
    fetchPracticePayloadMock
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('A 題幹') })
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('B 題幹') })
    submitPracticeAttemptMock
      .mockImplementationOnce(() => firstAttempt)
      .mockResolvedValueOnce({ kind: 'unavailable' })
    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'member-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'A 題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByText("解答を保存しています。")).toBeInTheDocument())

    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'B 題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("解答が保存されたか確認できません。"))

    resolveFirst({ kind: 'ok' })
    await Promise.resolve()
    expect(screen.getByRole('alert')).toHaveTextContent("解答が保存されたか確認できません。")
    expect(screen.queryByText("解答を保存しました。")).not.toBeInTheDocument()
  })

  it('retains a signed-out attempt for same-user reauthentication and retries with the same idempotency key', async () => {
    fetchPracticePayloadMock.mockClear()
    fetchPracticePayloadMock
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('重新登入前の題幹') })
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('重新登入後の題幹') })
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind: 'signed-out' }).mockResolvedValueOnce({ kind: 'ok' })
    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'member-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '重新登入前の題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("ログインの有効期限が切れたため、保存を確認できません。画面上部から再ログインし、保存を再試行してください。"))
    const firstAttempt = submitPracticeAttemptMock.mock.calls[0]![0]

    act(() => rendered.authClient.emitAuthStateChange(null))
    expect(screen.getByRole('heading', { name: "ログインが必要です" })).toBeInTheDocument()
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-a' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '重新登入後の題幹' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: "保存を再試行" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "保存を再試行" }))
    await waitFor(() => expect(screen.getByText("解答を保存しました。")).toBeInTheDocument())
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(2)
    expect(submitPracticeAttemptMock.mock.calls[1]![0]).toEqual(firstAttempt)
  })

  it('offers reconciliation after same-user reauthentication invalidates an in-flight completion', async () => {
    let resolveFirst!: (result: { kind: 'ok' }) => void
    const firstAttemptResult = new Promise<{ kind: 'ok' }>((resolve) => { resolveFirst = resolve })
    fetchPracticePayloadMock.mockClear()
    fetchPracticePayloadMock
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('進行中の題幹') })
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('再認證後の題幹') })
    submitPracticeAttemptMock.mockImplementationOnce(() => firstAttemptResult).mockResolvedValueOnce({ kind: 'ok' })
    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'member-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '進行中の題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByText("解答を保存しています。")).toBeInTheDocument())
    const firstAttempt = submitPracticeAttemptMock.mock.calls[0]![0]

    act(() => rendered.authClient.emitAuthStateChange(null))
    expect(screen.getByRole('heading', { name: "ログインが必要です" })).toBeInTheDocument()
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-a' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '再認證後の題幹' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: "保存を再試行" })).toBeInTheDocument()
    act(() => resolveFirst({ kind: 'ok' }))
    await Promise.resolve()
    expect(screen.getByRole('button', { name: "保存を再試行" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "保存を再試行" }))
    await waitFor(() => expect(screen.getByText("解答を保存しました。")).toBeInTheDocument())
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(2)
    expect(submitPracticeAttemptMock.mock.calls[1]![0]).toEqual(firstAttempt)
  })

  it('discards a signed-out attempt when reauthentication belongs to a different user', async () => {
    fetchPracticePayloadMock.mockClear()
    fetchPracticePayloadMock
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('換帳號前の題幹') })
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('換帳號後の題幹') })
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind: 'signed-out' })
    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'member-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '換帳號前の題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: "解答する" }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("ログインの有効期限が切れたため、保存を確認できません。画面上部から再ログインし、保存を再試行してください。"))

    act(() => rendered.authClient.emitAuthStateChange(null))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '換帳號後の題幹' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: "保存を再試行" })).not.toBeInTheDocument()
    expect(screen.queryByText("解答を保存しました。")).not.toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(1)
  })

  it('removes the old ready payload immediately when the authenticated user changes', async () => {
    fetchPracticePayloadMock.mockClear()
    fetchPracticePayloadMock
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('A 私密題幹') })
      .mockReturnValueOnce(new Promise(() => {}))
    const rendered = renderWebTestAt(
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning',
      { session: { id: 'member-a' } },
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'A 私密題幹' })).toBeInTheDocument())

    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b' }))
    expect(screen.queryByRole('heading', { name: 'A 私密題幹' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "練習を読み込んでいます" })).toBeInTheDocument()
  })

  it('removes the old ready payload synchronously when the runner route selection changes', async () => {
    fetchPracticePayloadMock.mockClear()
    fetchPracticePayloadMock
      .mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('A route 私密題幹') })
      .mockReturnValueOnce(new Promise(() => {}))
    renderWithAppProviders(
      <Routes>
        <Route path="/practice/web-test/:family/:domain/:category" element={<><WebTestRunnerEntryPage /><Link to="/practice/web-test/spi/verbal/reading-inference?mode=untimed-learning">切換類別</Link></>} />
      </Routes>,
      { initialEntries: ['/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning'], session: { id: 'member-a' } },
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'A route 私密題幹' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: '切換類別' }))
    expect(screen.queryByRole('heading', { name: 'A route 私密題幹' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "練習を読み込んでいます" })).toBeInTheDocument()
    await waitFor(() => expect(fetchPracticePayloadMock).toHaveBeenCalledTimes(2))
  })

  it.each([
    '/practice/web-test/spi/verbal/vocabulary-in-context?mode=timed-practice',
    '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning&extra=1',
    '/practice/web-test/spi/verbal/private-editorial-label?mode=untimed-learning',
    '/practice/web-test/private-family',
  ])('fails closed for stale or unsupported selection: %s', (path) => {
    renderWebTestAt(path)
    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
  })
})
