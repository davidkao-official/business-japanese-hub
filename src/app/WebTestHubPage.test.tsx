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
      '獨立的日本求職 Web Test 練習入口，協助華語學習者準備 SPI 等選考中的日文閱讀與推理能力。',
    )
    fireEvent.click(screen.getByRole('link', { name: '離開 Web Test' }))
    expect(screen.getByText('Practice overview')).toBeInTheDocument()
    expect(description.content).toBe(original)
  })

  it('moves from the hub through released SPI domains and categories without a fixture count', () => {
    renderWebTestAt('/practice/web-test')

    expect(screen.getByRole('heading', { name: '日本求職網路測驗刷題' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /SPI/ })).toHaveAttribute('href', '/practice/web-test/spi')
    expect(screen.queryByText('玉手箱', { selector: '.web-test-hub__family-title' })).not.toBeInTheDocument()

    cleanup()
    renderWebTestAt('/practice/web-test/spi/verbal')
    const category = screen.getByRole('heading', { name: '文脈語彙' }).closest('li')
    expect(category).not.toBeNull()
    expect(within(category!).getByRole('link', { name: '不計時學習' })).toHaveAttribute(
      'href',
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning',
    )
  })

  it('keeps a valid runner selection directly loadable while signed out', async () => {
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning')

    expect(screen.getByRole('heading', { name: '文脈語彙' })).toBeInTheDocument()
    expect(screen.getByText('不計時學習 · 5 題已發布')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('請登入後才能載入會員練習內容。')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /開始|送出|開始練習/ })).not.toBeInTheDocument()
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
      promptRepresentation: { kind: 'table' as const, columns: ['項目'], rows: [['合成問題']] },
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
    await waitFor(() => expect(screen.getByText('第 1／2 題')).toBeInTheDocument())
    expect(screen.getByRole('figure', { name: '題目表示' })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: '一番 表示' })).toBeInTheDocument()
    expect(screen.getByText('起点 → 終点：進む')).toBeInTheDocument()
    expect(screen.queryByText('合成提示。')).not.toBeInTheDocument()
    expect(screen.queryByText('選択')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '二番 上移' }))
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('二番')
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    nowSpy.mockReturnValue(9000)
    expect(screen.getByText('二番、一番')).toHaveAttribute('lang', 'ja')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '解答與說明' }))
    expect(screen.getByText('這是合成表示。')).toBeInTheDocument()
    expect(screen.getByText('不要倒置順序。')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: '甲' })).toBeInTheDocument()
    expect(screen.getByText('yes')).not.toHaveAttribute('lang', 'ja')
    expect(screen.getByText('請輸入三。')).toHaveAttribute('lang', 'ja')
    rendered.authClient.emitAuthStateChange({ id: 'synthetic-member', email: 'refreshed@example.com' })
    await Promise.resolve()
    await waitFor(() => expect(screen.getByText('請輸入三。')).toBeInTheDocument())
    expect(fetchPracticePayloadMock).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('數值答案'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '回答檢查點' }))
    expect(screen.getByText('檢查點回答正確')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /理解檢查/ }))
    fireEvent.click(screen.getByRole('button', { name: '下一個檢查點' }))
    expect(screen.getByText('請輸入四。')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /理解檢查/ }))
    fireEvent.change(screen.getByLabelText('數值答案'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '回答檢查點' }))
    expect(screen.getByText('檢查點回答正確')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('作答紀錄已儲存。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '下一題' }))
    expect(screen.getByText('第 2／2 題')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '二番を選んでください。' }))
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() => expect(screen.getByText('作答紀錄已儲存。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '下一題' }))
    expect(screen.getByText('正確 2／2 題（正答率 100%）；作答紀錄已儲存。')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '練習完成' }))
    expect(screen.getByText('文脈語彙：2／2')).toBeInTheDocument()
    expect(screen.getByText('已觀測到檢查點未通過：0／2')).toBeInTheDocument()
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

  it('keeps local feedback truthful when durable attempt storage fails', async () => {
    fetchPracticePayloadMock.mockClear()
    submitPracticeAttemptMock.mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValue({ kind: 'ok' })
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload: syntheticRuntimePayload('失敗時の合成題幹') })
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: '失敗時の合成題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('只保留在目前頁面'))
    expect(screen.queryByText('作答紀錄已儲存。')).not.toBeInTheDocument()
    const nextButton = screen.getByRole('button', { name: '下一題' })
    expect(nextButton).toBeDisabled()
    fireEvent.click(nextButton)
    expect(screen.getByRole('heading', { name: '解答與說明' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重試儲存' }))
    await waitFor(() => expect(screen.getByText('作答紀錄已儲存。')).toBeInTheDocument())
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(2)
    expect(submitPracticeAttemptMock.mock.calls[1]![0]).toEqual(submitPracticeAttemptMock.mock.calls[0]![0])
    fireEvent.click(screen.getByRole('button', { name: '下一題' }))
    expect(screen.getByRole('heading', { name: '練習完成' })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('作答時間超出可接受範圍'))
    expect(submitPracticeAttemptMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ responseTimeMs: 3_600_001 }))
    expect(screen.queryByRole('button', { name: '重試儲存' })).not.toBeInTheDocument()
    const nextButton = screen.getByRole('button', { name: '下一題' })
    expect(nextButton).toBeEnabled()
    fireEvent.click(nextButton)
    expect(screen.getByRole('heading', { name: '練習完成' })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('作答時間超出可接受範圍'))
    fireEvent.click(screen.getByRole('button', { name: '下一題' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '第二題正常儲存' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() => expect(screen.getByText('作答紀錄已儲存。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '下一題' }))
    expect(screen.getByText('正確 2／2 題（正答率 100%）；部分作答未儲存：有作答時間超出可接受範圍，無法完整同步。')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() => expect(screen.getByText('正在儲存作答紀錄。')).toBeInTheDocument())

    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'B 題幹' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('只保留在目前頁面'))

    resolveFirst({ kind: 'ok' })
    await Promise.resolve()
    expect(screen.getByRole('alert')).toHaveTextContent('只保留在目前頁面')
    expect(screen.queryByText('作答紀錄已儲存。')).not.toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: '載入練習' })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: '載入練習' })).toBeInTheDocument()
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
