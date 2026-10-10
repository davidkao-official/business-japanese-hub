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
import { getActiveLocale, getStrings, LOCALE_STORAGE_KEY, setLocalePreference } from '../i18n/strings'
import { FREE_SPI_SAMPLE_CONTENT_ID, FREE_SPI_SAMPLE_REVISION } from '../practice-web-test/freeSample'

const hookLearningUiOverrides = vi.hoisted(() => ({
  current: null as { webChooseAnswer?: string; webNumberAnswer?: string } | null,
}))
const fetchPracticePayloadMock = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: 'signed-out' }))
const submitPracticeAttemptMock = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: 'ok' }))
vi.mock('../practice-web-test/client', () => ({ fetchPracticePayload: fetchPracticePayloadMock, submitPracticeAttempt: submitPracticeAttemptMock }))
vi.mock('../i18n/strings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/strings')>()
  return {
    ...actual,
    useStrings: (...args: Parameters<typeof actual.useStrings>) => {
      const strings = actual.useStrings(...args)
      const overrides = hookLearningUiOverrides.current
      return overrides ? { ...strings, learningUi: { ...strings.learningUi, ...overrides } } : strings
    },
  }
})

afterEach(() => {
  cleanup()
  hookLearningUiOverrides.current = null
  setLocalePreference(null)
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

function syntheticIssue212Payload(checkpointIds: string[][] = [[], [], []], checkpointVersion = 1) {
  const base = syntheticRuntimePayload('Issue 212 第1問')
  const sourceQuestion = base.questionBank.questions[0]!
  const questions = [1, 2, 3].map((position) => ({
    ...sourceQuestion,
    id: `issue212-control-q${position}`,
    promptJa: `Issue 212 第${position}問`,
    coreExplanation: { ...sourceQuestion.coreExplanation, concise: `Issue 212 第${position}問の解説` },
    itemAnalysis: {
      ...sourceQuestion.itemAnalysis,
      diagnosticCheckpoints: { registryVersion: 1, ids: checkpointIds[position - 1] ?? [] },
    },
  }))
  const checkpoints = checkpointIds.flatMap((ids, questionIndex) => ids.map((id) => ({
    id,
    version: checkpointVersion,
    questionId: questions[questionIndex]!.id,
    questionVersion: questions[questionIndex]!.version,
    dimension: 'meaning' as const,
    promptJa: `${id} の合成確認問題`,
    answer: {
      input: { kind: 'number' as const },
      expectedAnswer: { kind: 'number' as const, value: 3 },
      scoring: { kind: 'numeric' as const },
    },
  })))
  return {
    payload: {
      ...base,
      questionBank: { ...base.questionBank, questions },
      checkpointRegistry: { version: 1, checkpoints },
      supportOverlays: [],
    },
    questions,
  }
}

describe('Web Test discovery and runner-entry routes', () => {
  it('labels question counts as inventory in Japanese and dormant Traditional Chinese', () => {
    expect(getStrings('ja').learningUi.webPublishedCountSuffix).toBe('問収録')
    expect(getStrings('zh-TW').learningUi.webPublishedCountSuffix).toBe('題收錄')
  })

  it.each([
    '/practice/web-test/spi',
    '/practice/web-test/spi/verbal',
    '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning',
  ])('separates the Japanese practice label from the family name at %s', (path) => {
    renderWebTestAt(path)
    expect(document.querySelector('.product-mode-page__eyebrow')).toHaveTextContent(/^練習 · SPI(?: · 言語)?$/)
  })

  it('uses the hook-supplied UI snapshot for both primary and diagnostic answer inputs', async () => {
    hookLearningUiOverrides.current = {
      webChooseAnswer: 'Hook snapshot choice label',
      webNumberAnswer: 'Hook snapshot number label',
    }
    const { payload } = syntheticIssue212Payload([['hook-snapshot-checkpoint']])
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'ok', payload })

    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'hook-snapshot-member' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: payload.questionBank.questions[0]!.promptJa })).toBeInTheDocument())
    expect(screen.getByRole('group', { name: 'Hook snapshot choice label' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('radio')[0]!)
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    expect(screen.getByLabelText('Hook snapshot number label')).toBeInTheDocument()
  })

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

  it('lets a signed-out visitor practice the public Free sample with a Japanese explanation, without saving', async () => {
    fetchPracticePayloadMock.mockClear()
    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning')

    expect(screen.getByRole('heading', { name: "文脈と語句の意味" })).toBeInTheDocument()
    expect(screen.getByText("時間を計らず練習 · 5 問収録")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: /計画や事業が途中で行き詰まり/ })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '無料サンプル問題' })).toBeInTheDocument()
    expect(screen.getByText('1／2 問目')).toBeInTheDocument()
    expect(fetchPracticePayloadMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('radio', { name: '逡巡' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    expect(screen.getByText(/頓挫（とんざ）は、計画や事業が途中で行き詰まること/)).toBeInTheDocument()
    expect(screen.getAllByText('ログインしていないため、この解答は保存されません。').length).toBeGreaterThan(0)
    expect(submitPracticeAttemptMock).not.toHaveBeenCalled()
    const next = screen.getByRole('button', { name: '次の問題へ' })
    expect(next).toBeEnabled()
    fireEvent.click(next)
    expect(screen.getByRole('heading', { name: /先方の事情を/ })).toBeInTheDocument()
  })

  it('falls back to the Free sample for a signed-in non-member and saves against the sample release', async () => {
    fetchPracticePayloadMock.mockClear()
    fetchPracticePayloadMock.mockResolvedValueOnce({ kind: 'forbidden' })
    renderWebTestAt('/practice/web-test/spi/nonverbal/rate-and-work?mode=untimed-learning', { session: { id: 'free-account' } })

    await waitFor(() => expect(screen.getByRole('heading', { name: /分速 80m で歩くと/ })).toBeInTheDocument())
    expect(screen.getByText(/解答はこのアカウントに保存され/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '6 分' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    expect(submitPracticeAttemptMock).toHaveBeenCalledWith(expect.objectContaining({
      contentId: FREE_SPI_SAMPLE_CONTENT_ID,
      revision: FREE_SPI_SAMPLE_REVISION,
      questionId: 'spi-free-nv-rate-01',
      questionVersion: 1,
      answer: 'b',
    }), expect.any(Function), 'free-account')
  })

  it('returns a My Learning review link for a Free sample mistake to that exact question without a member fetch', async () => {
    fetchPracticePayloadMock.mockClear()
    renderWebTestAt('/practice/web-test/spi/verbal/semantic-relation?mode=untimed-learning&review=spi-free-v-relation-02&reviewVersion=1', { session: { id: 'free-account' } })

    await waitFor(() => expect(screen.getByRole('heading', { name: /鉛筆：文房具/ })).toBeInTheDocument())
    expect(screen.getByText('1／1 問目')).toBeInTheDocument()
    expect(fetchPracticePayloadMock).not.toHaveBeenCalled()
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

  it.each(['matching', 'absent', 'mismatched-version'] as const)('keeps V1 feedback Japanese with %s support overlays through the member flow', async (overlayCase) => {
    fetchPracticePayloadMock.mockClear()
    setLocalePreference('zh-TW')
    expect(getActiveLocale()).toBe('ja')
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
        supportOverlays: overlayCase === 'absent' ? [] : [
          { questionId: first.id, questionVersion: first.version + (overlayCase === 'mismatched-version' ? 1 : 0), version: 1, byLocale: { 'zh-Hant': { concise: '合成提示。', whatIsAsked: '請依序排列。', representationExplanation: '這是合成表示。', commonMisread: '不要倒置順序。', keyTerms: [{ termId: 'term-choice', surface: '選択', meaning: '選擇', note: '合成備註' }] } } },
          { questionId: second.id, questionVersion: second.version + (overlayCase === 'mismatched-version' ? 1 : 0), version: 1, byLocale: { 'zh-Hant': { whatIsAsked: '請選擇第二個選項。' } } },
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
    expect(screen.getByText('順序を確認します。')).toHaveAttribute('lang', 'ja')
    expect(screen.getByText('二番を先にすることが求められています。')).toHaveAttribute('lang', 'ja')
    for (const text of ['合成提示。', '請依序排列。', '這是合成表示。', '不要倒置順序。']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
    expect(screen.queryByText(/選擇|合成備註/)).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: '甲' })).toBeInTheDocument()
    expect(screen.getByText('該当')).toBeInTheDocument()
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-TW')
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
    expect(screen.getByText(sourceQuestion.coreExplanation.concise)).toHaveAttribute('lang', 'ja')
    expect(screen.getByText(sourceQuestion.coreExplanation.whatIsAskedJa)).toHaveAttribute('lang', 'ja')
    expect(screen.queryByText('請選擇第二個選項。')).not.toBeInTheDocument()
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

  it.each(['signed-out', 'unavailable'] as const)(
    'associates a retained Q2 %s retry with Q2 and continues to Q3 after same-user reauthentication',
    async (interruption) => {
      const base = syntheticRuntimePayload('第1問の合成問題')
      const sourceQuestion = base.questionBank.questions[0]!
      const questions = [1, 2, 3].map((position) => ({
        ...sourceQuestion,
        id: `issue212-synthetic-q${position}`,
        promptJa: `第${position}問の合成問題`,
        coreExplanation: {
          ...sourceQuestion.coreExplanation,
          concise: `第${position}問の合成解説`,
        },
      }))
      const payload = { ...base, questionBank: { ...base.questionBank, questions } }
      fetchPracticePayloadMock.mockReset()
        .mockResolvedValue({ kind: 'signed-out' })
        .mockResolvedValueOnce({ kind: 'ok', payload })
        .mockResolvedValueOnce({ kind: 'ok', payload })
      submitPracticeAttemptMock.mockReset()
        .mockResolvedValueOnce({ kind: 'ok' })
        .mockResolvedValueOnce({ kind: interruption })
        .mockResolvedValueOnce({ kind: 'ok' })

      const rendered = renderWebTestAt(
        '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning',
        { session: { id: 'issue212-member-a' } },
      )
      await waitFor(() => expect(screen.getByRole('heading', { name: '第1問の合成問題' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('radio', { name: '二番' }))
      fireEvent.click(screen.getByRole('button', { name: '解答する' }))
      await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
      expect(screen.getByRole('heading', { name: '第2問の合成問題' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: '二番' }))
      fireEvent.click(screen.getByRole('button', { name: '解答する' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
      expect(screen.getByRole('button', { name: '次の問題へ' })).toBeDisabled()
      const originalQ2Attempt = submitPracticeAttemptMock.mock.calls[1]![0]
      expect(originalQ2Attempt).toEqual(expect.objectContaining({
        questionId: questions[1]!.id,
        questionVersion: questions[1]!.version,
        clientIdempotencyKey: expect.any(String),
      }))

      act(() => rendered.authClient.emitAuthStateChange(null))
      expect(screen.getByRole('heading', { name: 'ログインが必要です' })).toBeInTheDocument()
      expect(screen.queryByText('第2問の合成解説')).not.toBeInTheDocument()
      act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-member-a' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }))
      await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
      expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(3)
      expect(submitPracticeAttemptMock.mock.calls[2]![0]).toEqual(originalQ2Attempt)

      // On unchanged main/PR215, the saved retry has no associated Q2 feedback context.
      expect(screen.getByText('第2問の合成解説')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: '第1問の合成問題' })).not.toBeInTheDocument()
      const next = screen.getByRole('button', { name: '次の問題へ' })
      expect(next).toBeEnabled()
      fireEvent.click(next)
      expect(screen.getByRole('heading', { name: '第3問の合成問題' })).toBeInTheDocument()
      expect(screen.getByText('3／3 問目')).toBeInTheDocument()
    },
  )

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

  it('keeps a wrong Q1 and checkpoint ledger while reauthenticating Q2, then finishes Q3 with accurate totals', async () => {
    const { payload, questions } = syntheticIssue212Payload([['issue212-q1-check'], ['issue212-q2-check-1', 'issue212-q2-check-2'], ['issue212-q3-check']])
    fetchPracticePayloadMock.mockReset()
      .mockResolvedValue({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok', payload })
      .mockResolvedValueOnce({ kind: 'ok', payload })
    submitPracticeAttemptMock.mockReset()
      .mockResolvedValueOnce({ kind: 'ok' })
      .mockResolvedValueOnce({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok' })
      .mockResolvedValueOnce({ kind: 'ok' })

    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'issue212-control-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: questions[0]!.promptJa })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '一番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    fireEvent.change(screen.getByLabelText('数値を入力'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '確認問題に解答する' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))

    expect(screen.getByRole('heading', { name: questions[1]!.promptJa })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    fireEvent.change(screen.getByLabelText('数値を入力'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '確認問題に解答する' }))
    fireEvent.click(screen.getByRole('button', { name: '次の確認問題へ' }))
    fireEvent.change(screen.getByLabelText('数値を入力'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '確認問題に解答する' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ログインの有効期限が切れたため、保存を確認できません。'))
    const originalQ2Attempt = structuredClone(submitPracticeAttemptMock.mock.calls[1]![0])

    act(() => rendered.authClient.emitAuthStateChange(null))
    expect(screen.getByRole('heading', { name: 'ログインが必要です' })).toBeInTheDocument()
    act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-control-a' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: questions[1]!.promptJa })).toBeInTheDocument()
    expect(screen.getByText('issue212-q2-check-2 の合成確認問題')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    expect(submitPracticeAttemptMock.mock.calls[2]![0]).toEqual(originalQ2Attempt)
    expect(originalQ2Attempt).toEqual(expect.objectContaining({
      questionId: questions[1]!.id,
      questionVersion: questions[1]!.version,
      checkpointResponses: [
        { checkpointId: 'issue212-q2-check-1', checkpointVersion: 1, response: 3 },
        { checkpointId: 'issue212-q2-check-2', checkpointVersion: 1, response: 4 },
      ],
    }))
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))

    expect(screen.getByRole('heading', { name: questions[2]!.promptJa })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    fireEvent.change(screen.getByLabelText('数値を入力'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '確認問題に解答する' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))

    expect(screen.getByText('正解 2／3 問（正答率 67%） · 解答を保存しました。')).toBeInTheDocument()
    expect(screen.getByText('文脈と語句の意味：2／3')).toBeInTheDocument()
    expect(screen.getByText('確認問題の不正解：1／4')).toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(4)
  })

  it('preserves an invalid-time Q1 as partial-save evidence through Q2 reauth and Q3 completion', async () => {
    const { payload, questions } = syntheticIssue212Payload()
    fetchPracticePayloadMock.mockReset()
      .mockResolvedValue({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok', payload })
      .mockResolvedValueOnce({ kind: 'ok', payload })
    submitPracticeAttemptMock.mockReset()
      .mockResolvedValueOnce({ kind: 'invalid-response-time' })
      .mockResolvedValueOnce({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok' })
      .mockResolvedValueOnce({ kind: 'ok' })
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'issue212-invalid-time-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: questions[0]!.promptJa })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    nowSpy.mockReturnValue(3_601_001)
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('解答時間が記録可能な範囲を超えたため、保存できません。'))
    expect(screen.getByRole('button', { name: '次の問題へ' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))

    expect(screen.getByRole('heading', { name: questions[1]!.promptJa })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ログインの有効期限が切れたため、保存を確認できません。'))
    const originalQ2Attempt = structuredClone(submitPracticeAttemptMock.mock.calls[1]![0])
    act(() => rendered.authClient.emitAuthStateChange(null))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-invalid-time-a' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: questions[1]!.promptJa })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    expect(submitPracticeAttemptMock.mock.calls[2]![0]).toEqual(originalQ2Attempt)
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))

    expect(screen.getByRole('heading', { name: questions[2]!.promptJa })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
    expect(screen.getByText('正解 3／3 問（正答率 100%） · 解答時間が記録可能な範囲を超えたため、一部の解答は保存されていません。')).toBeInTheDocument()
    expect(screen.getByText('文脈と語句の意味：3／3')).toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(4)
    nowSpy.mockRestore()
  })

  it.each(['newer-q2-version', 'checkpoint-version', 'checkpoint-order', 'checkpoint-identity'] as const)(
    'refuses to replay the retained Q2 attempt after refreshed %s context changes',
    async (change) => {
      const initial = syntheticIssue212Payload(change === 'newer-q2-version' ? undefined : [[], ['issue212-cp-a', 'issue212-cp-b'], []])
      let refreshedPayload = initial.payload
      if (change === 'newer-q2-version') {
        const q2 = initial.questions[1]!
        refreshedPayload = {
          ...initial.payload,
          questionBank: {
            ...initial.payload.questionBank,
            questions: [initial.questions[0]!, q2, { ...q2, version: q2.version + 1, promptJa: 'Issue 212 第2問 v2' }, initial.questions[2]!],
          },
        }
      } else {
        const refreshedIds = change === 'checkpoint-order'
          ? [[], ['issue212-cp-b', 'issue212-cp-a'], []]
          : change === 'checkpoint-identity'
            ? [[], ['issue212-cp-new-a', 'issue212-cp-new-b'], []]
            : [[], ['issue212-cp-a', 'issue212-cp-b'], []]
        const refreshed = syntheticIssue212Payload(refreshedIds, change === 'checkpoint-version' ? 2 : 1)
        refreshedPayload = {
          ...refreshed.payload,
          questionBank: {
            ...refreshed.payload.questionBank,
            questions: refreshed.questions.map((question, index) => ({
              ...question,
              id: initial.questions[index]!.id,
              version: initial.questions[index]!.version,
            })),
          },
          checkpointRegistry: {
            ...refreshed.payload.checkpointRegistry!,
            checkpoints: refreshed.payload.checkpointRegistry!.checkpoints.map((checkpoint) => ({
              ...checkpoint,
              questionId: initial.questions[1]!.id,
              questionVersion: initial.questions[1]!.version,
            })),
          },
        }
      }
      fetchPracticePayloadMock.mockReset()
        .mockResolvedValue({ kind: 'signed-out' })
        .mockResolvedValueOnce({ kind: 'ok', payload: initial.payload })
        .mockResolvedValueOnce({ kind: 'ok', payload: refreshedPayload })
      submitPracticeAttemptMock.mockReset()
        .mockResolvedValueOnce({ kind: 'ok' })
        .mockResolvedValueOnce({ kind: 'unavailable' })

      const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'issue212-context-a' } })
      await waitFor(() => expect(screen.getByRole('heading', { name: initial.questions[0]!.promptJa })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('radio', { name: '二番' }))
      fireEvent.click(screen.getByRole('button', { name: '解答する' }))
      await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
      expect(screen.getByRole('heading', { name: initial.questions[1]!.promptJa })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: '二番' }))
      fireEvent.click(screen.getByRole('button', { name: '解答する' }))

      if (change !== 'newer-q2-version') {
        for (let checkpointIndex = 0; checkpointIndex < 2; checkpointIndex += 1) {
          fireEvent.change(screen.getByLabelText('数値を入力'), { target: { value: '3' } })
          fireEvent.click(screen.getByRole('button', { name: '確認問題に解答する' }))
          if (checkpointIndex === 0) fireEvent.click(screen.getByRole('button', { name: '次の確認問題へ' }))
        }
      }
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('解答が保存されたか確認できません。'))
      const originalQ2Attempt = structuredClone(submitPracticeAttemptMock.mock.calls[1]![0])
      if (change !== 'newer-q2-version') {
        expect(originalQ2Attempt.checkpointResponses).toHaveLength(2)
      }
      act(() => rendered.authClient.emitAuthStateChange(null))
      act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-context-a' }))
      await waitFor(() => expect(screen.getByRole('heading', { name: initial.questions[0]!.promptJa })).toBeInTheDocument())
      expect(screen.queryByRole('button', { name: '保存を再試行' })).not.toBeInTheDocument()
      expect(screen.queryByText('解答を保存しました。')).not.toBeInTheDocument()
      expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(2)
      expect(submitPracticeAttemptMock.mock.calls[1]![0]).toEqual(originalQ2Attempt)
    },
  )

  it('keeps repeated in-flight Q2 retries on one exact attempt and ignores late older completions', async () => {
    let resolveOriginal!: (result: { kind: 'ok' | 'unavailable' }) => void
    let resolveFirstRetry!: (result: { kind: 'ok' | 'unavailable' }) => void
    let resolveNewestRetry!: (result: { kind: 'ok' | 'unavailable' }) => void
    const originalResult = new Promise<{ kind: 'ok' | 'unavailable' }>((resolve) => { resolveOriginal = resolve })
    const firstRetryResult = new Promise<{ kind: 'ok' | 'unavailable' }>((resolve) => { resolveFirstRetry = resolve })
    const newestRetryResult = new Promise<{ kind: 'ok' | 'unavailable' }>((resolve) => { resolveNewestRetry = resolve })
    const { payload, questions } = syntheticIssue212Payload([[], ['issue212-repeat-q2-check'], []])
    fetchPracticePayloadMock.mockReset()
      .mockResolvedValue({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok', payload })
      .mockResolvedValueOnce({ kind: 'ok', payload })
      .mockResolvedValueOnce({ kind: 'ok', payload })
    submitPracticeAttemptMock.mockReset()
      .mockResolvedValueOnce({ kind: 'ok' })
      .mockImplementationOnce(() => originalResult)
      .mockImplementationOnce(() => firstRetryResult)
      .mockImplementationOnce(() => newestRetryResult)
      .mockResolvedValueOnce({ kind: 'ok' })

    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'issue212-repeat-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: questions[0]!.promptJa })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))

    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    fireEvent.change(screen.getByLabelText('数値を入力'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '確認問題に解答する' }))
    await waitFor(() => expect(screen.getByText('解答を保存しています。')).toBeInTheDocument())
    const originalQ2Attempt = structuredClone(submitPracticeAttemptMock.mock.calls[1]![0])

    act(() => rendered.authClient.emitAuthStateChange(null))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-repeat-a' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }))
    await waitFor(() => expect(screen.getByText('解答を保存しています。')).toBeInTheDocument())

    act(() => rendered.authClient.emitAuthStateChange(null))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-repeat-a' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }))
    await waitFor(() => expect(screen.getByText('解答を保存しています。')).toBeInTheDocument())
    const firstRetrySnapshot = structuredClone(submitPracticeAttemptMock.mock.calls[2]![0])
    const newestRetrySnapshot = structuredClone(submitPracticeAttemptMock.mock.calls[3]![0])

    act(() => resolveOriginal({ kind: 'ok' }))
    act(() => resolveFirstRetry({ kind: 'unavailable' }))
    await Promise.resolve()
    expect(screen.getByText('解答を保存しています。')).toBeInTheDocument()
    expect(screen.queryByText('解答を保存しました。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次の問題へ' })).toBeDisabled()
    expect(firstRetrySnapshot).toEqual(originalQ2Attempt)
    expect(newestRetrySnapshot).toEqual(originalQ2Attempt)

    act(() => resolveNewestRetry({ kind: 'ok' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    expect(screen.getByText('解答を保存しました。')).toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(4)
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
    expect(screen.getByRole('heading', { name: questions[2]!.promptJa })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByText('解答を保存しました。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
    expect(screen.getByText('正解 3／3 問（正答率 100%） · 解答を保存しました。')).toBeInTheDocument()
    expect(screen.getByText('文脈と語句の意味：3／3')).toBeInTheDocument()
    expect(screen.getByText('確認問題の不正解：0／1')).toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(5)
  })

  it('clears a signed-out A attempt across A to B to A before loading A again', async () => {
    const payloadA = syntheticIssue212Payload().payload
    const payloadB = {
      ...payloadA,
      questionBank: {
        ...payloadA.questionBank,
        questions: payloadA.questionBank.questions.map((question, index) => ({ ...question, promptJa: `User B Q${index + 1}` })),
      },
    }
    fetchPracticePayloadMock.mockReset()
      .mockResolvedValue({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok', payload: payloadA })
      .mockResolvedValueOnce({ kind: 'ok', payload: payloadB })
      .mockResolvedValueOnce({ kind: 'ok', payload: payloadA })
    submitPracticeAttemptMock.mockReset().mockResolvedValueOnce({ kind: 'signed-out' })

    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'issue212-user-a' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Issue 212 第1問' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())

    act(() => rendered.authClient.emitAuthStateChange(null))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-user-b' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'User B Q1' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '保存を再試行' })).not.toBeInTheDocument()
    act(() => rendered.authClient.emitAuthStateChange({ id: 'issue212-user-a' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Issue 212 第1問' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '保存を再試行' })).not.toBeInTheDocument()
    expect(screen.queryByText('解答を保存しました。')).not.toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(1)
  })

  it('discards a signed-out attempt when the same user switches into a review scope', async () => {
    const { payload, questions } = syntheticIssue212Payload()
    fetchPracticePayloadMock.mockReset()
      .mockResolvedValue({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok', payload })
      .mockResolvedValueOnce({ kind: 'ok', payload })
    submitPracticeAttemptMock.mockReset().mockResolvedValueOnce({ kind: 'signed-out' })
    const reviewPath = `/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning&review=${encodeURIComponent(questions[0]!.id)}&reviewVersion=${questions[0]!.version}`

    renderWithAppProviders(
      <Routes>
        <Route path="/practice/web-test/:family/:domain/:category" element={<><WebTestRunnerEntryPage /><Link to={reviewPath}>Open exact review</Link></>} />
      </Routes>,
      { initialEntries: ['/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning'], session: { id: 'issue212-review-a' } },
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: questions[0]!.promptJa })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('link', { name: 'Open exact review' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: questions[0]!.promptJa })).toBeInTheDocument())
    expect(screen.getByText('1／1 問目')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存を再試行' })).not.toBeInTheDocument()
    expect(screen.queryByText('解答を保存しました。')).not.toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(1)
  })

  it('does not replay a signed-out answer after changing the practice category route', async () => {
    const initialPayload = syntheticIssue212Payload().payload
    const nextCategoryPayload = syntheticRuntimePayload('Issue 212 別カテゴリ問題', 'reading-inference')
    fetchPracticePayloadMock.mockReset()
      .mockResolvedValue({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok', payload: initialPayload })
      .mockResolvedValueOnce({ kind: 'ok', payload: nextCategoryPayload })
    submitPracticeAttemptMock.mockReset().mockResolvedValueOnce({ kind: 'signed-out' })

    renderWithAppProviders(
      <Routes>
        <Route path="/practice/web-test/:family/:domain/:category" element={<><WebTestRunnerEntryPage /><Link to="/practice/web-test/spi/verbal/reading-inference?mode=untimed-learning">Switch category</Link></>} />
      </Routes>,
      { initialEntries: ['/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning'], session: { id: 'issue212-route-a' } },
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Issue 212 第1問' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('link', { name: 'Switch category' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Issue 212 別カテゴリ問題' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '保存を再試行' })).not.toBeInTheDocument()
    expect(screen.queryByText('解答を保存しました。')).not.toBeInTheDocument()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['stale', '問題が更新されたため、解答は保存されていません。', false],
    ['missing', '問題を取得できないため、解答は保存されていません。', false],
    ['invalid', '解答を確認できず、保存されていません。単元一覧に戻り、問題を読み込み直して解答してください。', false],
    ['forbidden', '現在、このアカウントでは Plus の練習を利用できず、保存を確認できません。', true],
  ] as const)('keeps a retried %s outcome truthful and blocks progression', async (kind, message, canRetry) => {
    const payload = syntheticIssue212Payload().payload
    fetchPracticePayloadMock.mockReset()
      .mockResolvedValue({ kind: 'signed-out' })
      .mockResolvedValueOnce({ kind: 'ok', payload })
      .mockResolvedValueOnce({ kind: 'ok', payload })
    submitPracticeAttemptMock.mockReset()
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind })

    const userId = `issue212-terminal-${kind}`
    const rendered = renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: userId } })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Issue 212 第1問' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    const originalAttempt = structuredClone(submitPracticeAttemptMock.mock.calls[0]![0])
    act(() => rendered.authClient.emitAuthStateChange(null))
    act(() => rendered.authClient.emitAuthStateChange({ id: userId }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
    expect(submitPracticeAttemptMock.mock.calls[1]![0]).toEqual(originalAttempt)
    if (canRetry) expect(screen.getByRole('button', { name: '保存を再試行' })).toBeInTheDocument()
    else expect(screen.queryByRole('button', { name: '保存を再試行' })).not.toBeInTheDocument()
    expect(screen.queryByText('解答を保存しました。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次の問題へ' })).toBeDisabled()
    expect(submitPracticeAttemptMock).toHaveBeenCalledTimes(2)
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
