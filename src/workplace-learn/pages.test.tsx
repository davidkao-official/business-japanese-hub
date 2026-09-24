import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkplaceLearnCatalogEntry, WorkplaceLearnRuntimeItem } from './types'
import { workplaceLearnCatalog } from './catalog'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from './sample'
import { toWorkplaceLearnCatalogEntry } from './validate'
import { WorkplaceLessonPage, WorkplaceVocabularyIndexPage, WorkplaceVocabularyPage } from './pages'
import { renderWithAppProviders } from '../test/appProviders'
import { getStrings, setLocalePreference } from '../i18n/strings'
import App from '../App'
import { COURSE_CORRECTION_LEARN_SLUG, getLearningUnitByLearnSlug } from '../app/learningUnits'
import { readingCatalog } from '../reading/catalog'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setLocalePreference(null)
  window.history.replaceState(null, '', '/')
})

describe('Workplace Learn routes and details', () => {
  it('uses natural Japanese for the Japanese discovery title', () => {
    expect(getStrings('ja').workplaceLearn.title).toBe('日本の職場で実践する')
  })

  it('routes the public discovery path to vocabulary and lesson details', async () => {
    setLocalePreference('zh-TW')
    window.history.replaceState(null, '', '/learn')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: '日本職場實戰' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /語彙列表/ })[0]).toHaveAttribute('href', '/learn/vocabulary')
    expect(screen.getByText('報告時に事実と次の対応を短く伝える')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '報告時に事実と次の対応を短く伝える' })).toHaveAttribute('lang', 'ja')
    expect(screen.getByText('進捗に遅れが出たときは、状況・影響・次の対応を分けて共有します。')).toHaveAttribute('lang', 'ja')
    fireEvent.click(screen.getAllByRole('link', { name: /語彙列表/ })[0]!)
    expect(await screen.findByRole('heading', { level: 1, name: '日本職場語彙' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /見込み/ }))
    expect(await screen.findByRole('heading', { level: 1, name: '見込み' })).toHaveAttribute('lang', 'ja')
    expect(screen.getByText(sampleWorkplaceVocabularyItem.lead)).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText('見込み', { selector: 'dd' })).toHaveAttribute('lang', 'ja')
    expect(screen.getByText(/預估、預期/)).toBeInTheDocument()
    expect(screen.getByText(/不代表所有公司/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /報告時に事実と次の対応/ })).toHaveAttribute('href', '/learn/workplace/sample-status-update-with-next-step')
  })

  it.each([
    ['ja', '場面', '自分で言い換える', '例文を自分の職場で起こりそうな場面に置き換え、伝える事実、次の行動、相手に合った語調を選んで書き直してみましょう。', '自分の表現を書いてみる', 'My Learning に保存'],
    ['en', 'Situation', 'Try a rewrite', 'Adapt the example to a plausible situation of your own. Choose the facts to share, your next action, and a tone that fits the person you are addressing.', 'Write your own version', 'Save to My Learning'],
    ['zh-CN', '情境', '自己改写看看', '把例句换成自己职场中可能遇到的情境，选择要传达的事实、下一步行动，以及适合对方的语气，再重新写一次。', '写下自己的表达', '保存到 My Learning'],
  ] as const)('keeps %s interface labels in the interface language and marks authored content explicitly', (locale, situationLabel, practiceTitle, prompt, practiceLabel, saveLabel) => {
    setLocalePreference(locale)
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === sampleWorkplaceLearnItem.id)!
    renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[sampleWorkplaceLearnItem]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`] },
    )

    expect(screen.getByRole('heading', { name: situationLabel })).not.toHaveAttribute('lang')
    expect(screen.getByText(sampleWorkplaceLearnItem.situation)).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByRole('heading', { name: practiceTitle })).not.toHaveAttribute('lang')
    expect(screen.getByText(prompt)).not.toHaveAttribute('lang')
    expect(screen.getByText(practiceLabel)).not.toHaveAttribute('lang')
    expect(screen.getByRole('region', { name: saveLabel })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAttribute('lang', 'ja')
  })

  it('keeps the Book-projected Learn slug available on its original route', () => {
    const existing = getLearningUnitByLearnSlug(COURSE_CORRECTION_LEARN_SLUG)
    expect(existing).toBeDefined()
    setLocalePreference('zh-TW')
    window.history.replaceState(null, '', `/learn/${COURSE_CORRECTION_LEARN_SLUG}`)
    render(<App />)
    expect(screen.getByRole('heading', { name: existing!.title })).toBeInTheDocument()
  })

  it('shows a truthful empty state for a vocabulary catalog without entries', () => {
    renderWithAppProviders(
      <Routes><Route path="/learn/vocabulary" element={<WorkplaceVocabularyIndexPage catalogEntries={[]} />} /></Routes>,
      { initialEntries: ['/learn/vocabulary'] },
    )
    expect(screen.getByText('公開中の職場語彙はありません。')).toBeInTheDocument()
  })

  it('does not render an injected Free item when its runtime metadata differs from the catalog', () => {
    setLocalePreference('zh-TW')
    const wrongMetadata: WorkplaceLearnCatalogEntry[] = [{ ...workplaceLearnCatalog[0]!, title: 'Different title' }]
    renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={wrongMetadata} publicItems={[sampleWorkplaceLearnItem]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${wrongMetadata[0]!.slug}`] },
    )
    expect(screen.queryByText(sampleWorkplaceLearnItem.whatToSayJapanese)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('目前無法載入教材')
  })

  it('resolves related Read and Practice items through public registries and renders unknown links as unavailable', () => {
    setLocalePreference('zh-TW')
    const item = {
      ...sampleWorkplaceLearnItem,
      relatedVocabularyIds: [sampleWorkplaceVocabularyItem.id, 'missing-vocabulary-item'],
      relatedLinks: [
        { kind: 'learn' as const, label: '関連語彙を見る', labelLanguage: 'ja' as const, targetId: sampleWorkplaceVocabularyItem.id },
        { kind: 'learn' as const, label: '既存 Learn slug への推測リンク', labelLanguage: 'ja' as const, targetId: COURSE_CORRECTION_LEARN_SLUG },
        { kind: 'read' as const, label: '公開中の記事を読む', labelLanguage: 'ja' as const, targetId: readingCatalog[0]!.id },
        { kind: 'practice' as const, label: '已發布的 SPI 練習', labelLanguage: 'zh-TW' as const, targetId: 'practice-web-test-spi-v1' },
        { kind: 'read' as const, label: '未公開の記事', labelLanguage: 'ja' as const, targetId: 'unknown-read-content' },
        { kind: 'practice' as const, label: '未公開的練習', labelLanguage: 'zh-TW' as const, targetId: 'unknown-practice-content' },
      ],
    }
    const entries = [toWorkplaceLearnCatalogEntry(item), ...workplaceLearnCatalog.filter((entry) => entry.kind === 'vocabulary')]
    renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={entries} publicItems={[item, sampleWorkplaceVocabularyItem]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${item.slug}`] },
    )

    expect(screen.getByRole('link', { name: '関連語彙を見る' })).toHaveAttribute('href', '/learn/vocabulary/sample-mikomi-estimate')
    expect(screen.getByText('既存 Learn slug への推測リンク').closest('.workplace-learn__related-unavailable')).toHaveTextContent('此教材目前無法使用。')
    expect(screen.getByRole('link', { name: '公開中の記事を読む' })).toHaveAttribute('href', `/read/${readingCatalog[0]!.slug}`)
    expect(screen.getByRole('link', { name: '公開中の記事を読む' })).toHaveAttribute('lang', 'ja')
    expect(screen.getByRole('link', { name: '已發布的 SPI 練習' })).toHaveAttribute('href', '/practice/web-test/spi')
    expect(screen.getByRole('link', { name: /見込み/ })).toHaveAttribute('href', '/learn/vocabulary/sample-mikomi-estimate')
    expect(screen.getByRole('link', { name: /見込み/ })).toHaveAttribute('lang', 'ja')
    expect(screen.getByText('未公開の記事').closest('.workplace-learn__related-unavailable')).toHaveTextContent('此教材目前無法使用。')
    expect(screen.getByText('未公開的練習').closest('.workplace-learn__related-unavailable')).toHaveTextContent('此教材目前無法使用。')
    expect(screen.getAllByText('此教材目前無法使用。')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '自己改寫看看' })).toBeInTheDocument()
    expect(screen.getByText(/把例句換成自己職場中可能遇到的情境/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '寫下自己的表達' })).toHaveAttribute('lang', 'ja')
    expect(screen.getByText('此處輸入的內容不會儲存或評分。')).toBeInTheDocument()
  })

  it('renders vocabulary related stable IDs and shows missing terms as unavailable', () => {
    setLocalePreference('zh-TW')
    const item = { ...sampleWorkplaceVocabularyItem, term: '見通し', relatedTermIds: [sampleWorkplaceVocabularyItem.id, 'missing-workplace-term'] }
    const entries = [toWorkplaceLearnCatalogEntry(item), ...workplaceLearnCatalog.filter((entry) => entry.id === sampleWorkplaceLearnItem.id)]
    renderWithAppProviders(
      <Routes><Route path="/learn/vocabulary/:slug" element={<WorkplaceVocabularyPage catalogEntries={entries} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/vocabulary/${item.slug}`] },
    )

    expect(screen.getByText('見通し', { selector: 'dd' })).toHaveAttribute('lang', 'ja')
    expect(screen.getByRole('link', { name: /見込み →/ })).toHaveAttribute('href', `/learn/vocabulary/${item.slug}`)
    expect(screen.getByText('此教材目前無法使用。')).toBeInTheDocument()
  })

  it('clears a loaded Plus body when the authenticated identity changes', async () => {
    const privateItem: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem,
      id: 'private-workplace-lesson-test',
      slug: 'private-workplace-lesson-test',
      title: 'Member only title',
      access: 'plus',
      sampleLabel: undefined,
      whatToSayJapanese: '私有本文の識別用フレーズです。',
      relatedVocabularyIds: [],
    }
    const revision = 'd'.repeat(64)
    const plusEntry = toWorkplaceLearnCatalogEntry(privateItem, { contentId: privateItem.id, revision })
    const repo = { getAccess: vi.fn().mockResolvedValue('active' as const) }
    const loadPayload = vi.fn().mockResolvedValue({ kind: 'ok' as const, item: privateItem })
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[plusEntry]} publicItems={[]} loadPayload={loadPayload} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${plusEntry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: repo },
    )

    expect(await screen.findByText('私有本文の識別用フレーズです。')).toBeInTheDocument()
    act(() => view.authClient.emitAuthStateChange(null))
    await waitFor(() => expect(screen.queryByText('私有本文の識別用フレーズです。')).not.toBeInTheDocument())
    expect(screen.getByText('ログインして会員状態を確認')).toBeInTheDocument()
  })

  it('saves and removes only the stable ID and current revision for an active Plus member', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const privateItem: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem,
      id: 'private-workplace-save-test', slug: 'private-workplace-save-test', title: 'Private lesson',
      access: 'plus', sampleLabel: undefined, relatedVocabularyIds: [],
    }
    const revision = 'e'.repeat(64)
    const plusEntry = toWorkplaceLearnCatalogEntry(privateItem, { contentId: privateItem.id, revision })
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify({ itemId: privateItem.id, kind: 'lesson', revision, savedAt: '2026-09-20T10:00:00.000Z', current: true }), { status: 200 }))
      if (init?.method === 'DELETE') return Promise.resolve(new Response(JSON.stringify({ itemId: privateItem.id, kind: 'lesson', revision, serverTimestamp: '2026-09-20T10:00:01.000Z' }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    }))
    renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[plusEntry]} publicItems={[]} loadPayload={vi.fn().mockResolvedValue({ kind: 'ok', item: privateItem })} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${plusEntry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    const saveButton = await screen.findByRole('button', { name: '儲存到 My Learning' })
    fireEvent.click(saveButton)
    const removeButton = await screen.findByRole('button', { name: '移除儲存' })
    const put = calls.find((call) => call.init?.method === 'PUT')!
    expect(put.url).toBe('https://functions.example.test/workplace-saves')
    expect(JSON.parse(String(put.init?.body))).toEqual({ itemId: privateItem.id, revision })
    expect(JSON.parse(String(put.init?.body))).not.toHaveProperty('kind')
    fireEvent.click(removeButton)
    await waitFor(() => expect(screen.getByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument())
    expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(true)
  })

  it('does not claim a saved preference or offer removal after a new PUT receives 409', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const privateItem: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem, id: 'private-workplace-conflict-test', slug: 'private-workplace-conflict-test',
      title: 'Conflict lesson', access: 'plus', sampleLabel: undefined, relatedVocabularyIds: [],
    }
    const revision = 'b'.repeat(64)
    const plusEntry = toWorkplaceLearnCatalogEntry(privateItem, { contentId: privateItem.id, revision })
    const calls: Array<{ method: string; body?: string }> = []
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined })
      if (init?.method === 'PUT') return Promise.resolve(new Response(JSON.stringify({ error: 'stale' }), { status: 409 }))
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    }))
    renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[plusEntry]} publicItems={[]} loadPayload={vi.fn().mockResolvedValue({ kind: 'ok', item: privateItem })} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${plusEntry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    fireEvent.click(await screen.findByRole('button', { name: '儲存到 My Learning' }))
    expect(await screen.findByText('這次儲存未成功；目前沒有確認到新的儲存紀錄。請重新確認版本後再試。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    expect(calls.map(({ method }) => method)).toEqual(['GET', 'PUT'])
  })

  it('offers removal only when GET confirms an existing stale save row', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const privateItem: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem, id: 'private-workplace-retired-test', slug: 'private-workplace-retired-test',
      title: 'Retired lesson', access: 'plus', sampleLabel: undefined, relatedVocabularyIds: [],
    }
    const revision = 'c'.repeat(64)
    const plusEntry = toWorkplaceLearnCatalogEntry(privateItem, { contentId: privateItem.id, revision })
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push(method)
      if (method === 'DELETE' && calls.filter((call) => call === 'DELETE').length === 1) return Promise.resolve(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }))
      if (method === 'DELETE') return Promise.resolve(new Response(JSON.stringify({ itemId: privateItem.id, kind: 'lesson', revision: 'a'.repeat(64), serverTimestamp: '2026-09-20T10:00:00.000Z' }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ items: [{ itemId: privateItem.id, kind: 'lesson', revision: 'a'.repeat(64), savedAt: '2026-09-19T10:00:00.000Z', current: false }] }), { status: 200 }))
    }))
    renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[plusEntry]} publicItems={[]} loadPayload={vi.fn().mockResolvedValue({ kind: 'ok', item: privateItem })} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${plusEntry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    expect(await screen.findByText('已儲存的教材版本目前無法使用；你可以移除這筆儲存。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '移除儲存' }))
    expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByText('已儲存的教材版本目前無法使用；你可以移除這筆儲存。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '移除儲存' }))
    expect(await screen.findByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(calls).toEqual(['GET', 'DELETE', 'GET', 'DELETE'])
  })
})
