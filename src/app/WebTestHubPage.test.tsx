import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('../practice-web-test/client', () => ({ fetchPracticePayload: fetchPracticePayloadMock }))

afterEach(() => {
  cleanup()
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
      answer: { input: { kind: 'ordering' as const, choices: [{ id: 'one', textJa: '一番' }, { id: 'two', textJa: '二番' }] }, expectedAnswer: { kind: 'ordering' as const, choiceIds: ['two', 'one'] }, scoring: { kind: 'exact-order' as const } },
      coreExplanation: { concise: '順序を確認します。', whatIsAskedJa: '二番を先にすることが求められています。', representation: { kind: 'equation' as const, expression: '2 → 1' } },
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
        supportOverlays: [
          { questionId: first.id, questionVersion: first.version, version: 1, byLocale: { 'zh-Hant': { whatIsAsked: '請依序排列。', representationExplanation: '這是合成表示。', commonMisread: '不要倒置順序。' } } },
          { questionId: second.id, questionVersion: second.version, version: 1, byLocale: { 'zh-Hant': { whatIsAsked: '請選擇第二個選項。' } } },
        ],
      },
    })

    renderWebTestAt('/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning', { session: { id: 'synthetic-member' } })
    await waitFor(() => expect(screen.getByText('第 1／2 題')).toBeInTheDocument())
    expect(screen.getByRole('figure', { name: '題目表示' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '二番 上移' }))
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('二番')
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    expect(screen.getByText('二番、一番')).toHaveAttribute('lang', 'ja')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '解答與說明' }))
    expect(screen.getByText('這是合成表示。')).toBeInTheDocument()
    expect(screen.getByText('不要倒置順序。')).toBeInTheDocument()
    expect(screen.queryByText('第 2／2 題')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一題' }))
    expect(screen.getByText('第 2／2 題')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '二番を選んでください。' }))
    fireEvent.click(screen.getByRole('radio', { name: '二番' }))
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    fireEvent.click(screen.getByRole('button', { name: '下一題' }))
    expect(screen.getByText('正確 2／2 題（正答率 100%）；結果只保留在目前頁面。')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '練習完成' }))
    expect(screen.getByText('vocabulary-in-context：2／2')).toBeInTheDocument()
    expect(screen.getByText('Checkpoint：未測量')).toBeInTheDocument()
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
