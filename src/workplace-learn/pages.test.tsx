// Dormant resources remain testable for future fully launched locales.
// The unmocked V1 contract is covered in i18n/v1Locale.test.tsx.
vi.mock('../i18n/locales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/locales')>()
  return { ...actual, LAUNCHED_LOCALES: actual.SUPPORTED_LOCALES }
})

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
    ['ja', '場面', '自分で言い換える', '例文を自分の職場で起こりそうな場面に置き換え、伝える事実、次の行動、相手に合った語調を選んで書き直してみましょう。', '自分の表現を書いてみる', '学習記録に保存'],
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
    const ui = getStrings(locale)
    expect(document.title).toBe(`${entry.title} — ${ui.learningModes.modes.learn.title} — ${ui.app.name}`)
    if (locale === 'ja') expect(document.title).not.toMatch(/Learn/)
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

  it.each([
    ['lesson', 'GET', sampleWorkplaceLearnItem],
    ['lesson', 'PUT', sampleWorkplaceLearnItem],
    ['lesson', 'DELETE', sampleWorkplaceLearnItem],
    ['vocabulary', 'GET', sampleWorkplaceVocabularyItem],
    ['vocabulary', 'PUT', sampleWorkplaceVocabularyItem],
    ['vocabulary', 'DELETE', sampleWorkplaceVocabularyItem],
  ] as const)(
    'recovers the Free %s save control after a %s 401 with a same-user token refresh',
    async (kind, failedMethod, item) => {
      setLocalePreference('zh-TW')
      vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
      const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
      const methods: string[] = []
      const authorizationHeaders: string[] = []
      let getCount = 0
      vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        methods.push(method)
        authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
        if (method === 'GET') {
          getCount += 1
          if (failedMethod === 'GET' && getCount === 1) return Promise.resolve(new Response('{}', { status: 401 }))
          if (failedMethod === 'PUT' && getCount === 1) return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))
          if (failedMethod === 'DELETE' && getCount === 1) return Promise.resolve(new Response(JSON.stringify({ items: [{
            itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:00:00.000Z', current: true,
          }] }), { status: 200 }))
          const recoveredSave = failedMethod !== 'DELETE'
          return Promise.resolve(new Response(JSON.stringify({ items: recoveredSave ? [{
            itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true,
          }] : [] }), { status: 200 }))
        }
        if (method === failedMethod) return Promise.resolve(new Response('{}', { status: 401 }))
        throw new Error(`Unexpected save request: ${method}`)
      }))

      const route = kind === 'lesson' ? `/learn/workplace/${entry.slug}` : `/learn/vocabulary/${entry.slug}`
      const Page = kind === 'lesson' ? WorkplaceLessonPage : WorkplaceVocabularyPage
      const view = renderWithAppProviders(
        <Routes><Route path={kind === 'lesson' ? '/learn/workplace/:slug' : '/learn/vocabulary/:slug'} element={
          <Page catalogEntries={[entry]} publicItems={[item]} />
        } /></Routes>,
        { initialEntries: [route], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
      )

      if (failedMethod === 'PUT') {
        fireEvent.click(await screen.findByRole('button', { name: '儲存到 My Learning' }))
      } else if (failedMethod === 'DELETE') {
        fireEvent.click(await screen.findByRole('button', { name: '移除儲存' }))
      }
      await waitFor(() => {
        expect(methods).toEqual(failedMethod === 'GET' ? ['GET'] : ['GET', failedMethod])
        expect(screen.getByRole('region', { name: '儲存到 My Learning' })).toHaveTextContent('登入後可儲存教材；此功能提供 Plus 會員使用。')
      })

      const refreshedToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'refreshed' }))}.signature`
      vi.spyOn(view.authClient, 'getAccessToken').mockResolvedValue(refreshedToken)
      act(() => view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' }))

      const authoritativeState = failedMethod === 'DELETE' ? '儲存到 My Learning' : '移除儲存'
      expect(await screen.findByRole('button', { name: authoritativeState })).toBeInTheDocument()
      expect(methods).toEqual(failedMethod === 'GET' ? ['GET', 'GET'] : ['GET', failedMethod, 'GET'])
      expect(authorizationHeaders.at(-1)).toBe(`Bearer ${refreshedToken}`)
    },
  )

  it.each([
    ['lesson', sampleWorkplaceLearnItem],
    ['vocabulary', sampleWorkplaceVocabularyItem],
  ] as const)(
    'recovers an ordinary Free %s manual retry when its held 401 follows same-user refresh',
    async (kind, item) => {
      setLocalePreference('zh-TW')
      vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
      const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
      const methods: string[] = []
      const authorizationHeaders: string[] = []
      const requestUrls: string[] = []
      const readSignals: AbortSignal[] = []
      let resolveManualRead!: (response: Response) => void
      const pendingManualRead = new Promise<Response>((resolve) => { resolveManualRead = resolve })
      const savedRow = { itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true }
      vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        methods.push(method)
        authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
        requestUrls.push(String(input))
        if (init?.signal) readSignals.push(init.signal as AbortSignal)
        if (method === 'GET') {
          if (methods.length === 1) return Promise.resolve(new Response('{}', { status: 503 }))
          if (methods.length === 2) return pendingManualRead
          if (methods.length === 3) return Promise.resolve(new Response(JSON.stringify({ items: [savedRow] }), { status: 200 }))
        }
        throw new Error(`Unexpected save request: ${method}`)
      }))
      const route = kind === 'lesson' ? `/learn/workplace/${entry.slug}` : `/learn/vocabulary/${entry.slug}`
      const Page = kind === 'lesson' ? WorkplaceLessonPage : WorkplaceVocabularyPage
      const view = renderWithAppProviders(
        <Routes><Route path={kind === 'lesson' ? '/learn/workplace/:slug' : '/learn/vocabulary/:slug'} element={
          <Page catalogEntries={[entry]} publicItems={[item]} />
        } /></Routes>,
        { initialEntries: [route], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
      )

      expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()
      expect(methods).toEqual(['GET'])
      const oldToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'ordinary-manual-old' }))}.signature`
      const freshToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'ordinary-manual-fresh' }))}.signature`
      let currentToken = oldToken
      vi.spyOn(view.authClient, 'getAccessToken').mockImplementation(async () => currentToken)
      fireEvent.click(screen.getByRole('button', { name: '重試' }))
      await waitFor(() => expect(methods).toEqual(['GET', 'GET']))
      expect(authorizationHeaders[1]).toBe(`Bearer ${oldToken}`)

      currentToken = freshToken
      await act(async () => {
        view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
        for (let i = 0; i < 12; i += 1) await Promise.resolve()
      })
      expect(methods).toEqual(['GET', 'GET'])
      expect(readSignals[1]?.aborted).toBe(false)

      await act(async () => {
        resolveManualRead(new Response('{}', { status: 401 }))
        for (let i = 0; i < 12; i += 1) await Promise.resolve()
      })
      expect(await screen.findByRole('button', { name: '移除儲存' })).toBeEnabled()
      expect(methods).toEqual(['GET', 'GET', 'GET'])
      expect(authorizationHeaders[2]).toBe(`Bearer ${freshToken}`)
      expect(requestUrls.every((url) => new URL(url).searchParams.get('itemId') === item.id)).toBe(true)
      expect(screen.queryByRole('button', { name: '儲存到 My Learning' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: '儲存到 My Learning' })).not.toHaveTextContent('登入後可儲存教材；此功能提供 Plus 會員使用。')
    },
  )

  it('queues a fresh-token read when the initial save-state GET returns 401 after same-user refresh', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const item = sampleWorkplaceLearnItem
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
    const methods: string[] = []
    const authorizationHeaders: string[] = []
    const readSignals: AbortSignal[] = []
    let resolveInitialRead!: (response: Response) => void
    const pendingInitialRead = new Promise<Response>((resolve) => { resolveInitialRead = resolve })
    const savedRow = { itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true }
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      methods.push(method)
      authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
      if (init?.signal) readSignals.push(init.signal as AbortSignal)
      if (method === 'GET') {
        if (methods.filter((requestMethod) => requestMethod === 'GET').length === 1) return pendingInitialRead
        return Promise.resolve(new Response(JSON.stringify({ items: [savedRow] }), { status: 200 }))
      }
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    await waitFor(() => expect(methods).toEqual(['GET']))
    const firstAuthorization = authorizationHeaders[0]
    const refreshedToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'initial-read-refresh' }))}.signature`
    vi.spyOn(view.authClient, 'getAccessToken').mockResolvedValue(refreshedToken)
    await act(async () => {
      view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
      for (let i = 0; i < 12; i += 1) await Promise.resolve()
    })
    expect(methods).toEqual(['GET'])
    expect(readSignals[0]?.aborted).toBe(false)

    await act(async () => {
      resolveInitialRead(new Response('{}', { status: 401 }))
      for (let i = 0; i < 12; i += 1) await Promise.resolve()
    })
    expect(await screen.findByRole('button', { name: '移除儲存' })).toBeInTheDocument()
    expect(methods).toEqual(['GET', 'GET'])
    expect(firstAuthorization).not.toBe(`Bearer ${refreshedToken}`)
    expect(authorizationHeaders.at(-1)).toBe(`Bearer ${refreshedToken}`)
  })

  it.each([
    ['lesson', 'PUT', 'success', sampleWorkplaceLearnItem],
    ['lesson', 'PUT', '401', sampleWorkplaceLearnItem],
    ['lesson', 'DELETE', 'success', sampleWorkplaceLearnItem],
    ['lesson', 'DELETE', '401', sampleWorkplaceLearnItem],
    ['vocabulary', 'PUT', 'success', sampleWorkplaceVocabularyItem],
    ['vocabulary', 'PUT', '401', sampleWorkplaceVocabularyItem],
    ['vocabulary', 'DELETE', 'success', sampleWorkplaceVocabularyItem],
    ['vocabulary', 'DELETE', '401', sampleWorkplaceVocabularyItem],
  ] as const)(
    'defers the refreshed %s save-state GET until a pending %s %s settles',
    async (kind, method, mutationOutcome, item) => {
      setLocalePreference('zh-TW')
      vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
      const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
      const methods: string[] = []
      const authorizationHeaders: string[] = []
      let serverSaved = method === 'DELETE'
      let resolveMutation!: (response: Response) => void
      const mutationSignals: AbortSignal[] = []
      const pendingMutation = new Promise<Response>((resolve) => { resolveMutation = resolve })
      const savedRow = () => ({ itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true })
      vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const requestMethod = init?.method ?? 'GET'
        methods.push(requestMethod)
        authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
        if (requestMethod === 'GET') {
          return Promise.resolve(new Response(JSON.stringify({ items: serverSaved ? [savedRow()] : [] }), { status: 200 }))
        }
        if (requestMethod === method) {
          if (init?.signal) mutationSignals.push(init.signal as AbortSignal)
          return pendingMutation
        }
        throw new Error(`Unexpected save request: ${requestMethod}`)
      }))
      const route = kind === 'lesson' ? `/learn/workplace/${entry.slug}` : `/learn/vocabulary/${entry.slug}`
      const Page = kind === 'lesson' ? WorkplaceLessonPage : WorkplaceVocabularyPage
      const view = renderWithAppProviders(
        <Routes><Route path={kind === 'lesson' ? '/learn/workplace/:slug' : '/learn/vocabulary/:slug'} element={
          <Page catalogEntries={[entry]} publicItems={[item]} />
        } /></Routes>,
        { initialEntries: [route], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
      )

      const mutationButton = method === 'PUT' ? '儲存到 My Learning' : '移除儲存'
      fireEvent.click(await screen.findByRole('button', { name: mutationButton }))
      await waitFor(() => expect(methods).toEqual(['GET', method]))
      const firstRefreshToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'refresh-1' }))}.signature`
      const latestRefreshToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'refresh-2' }))}.signature`
      let currentToken = firstRefreshToken
      vi.spyOn(view.authClient, 'getAccessToken').mockImplementation(async () => currentToken)
      await act(async () => {
        view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
        for (let i = 0; i < 12; i += 1) await Promise.resolve()
      })
      currentToken = latestRefreshToken
      await act(async () => {
        view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
        for (let i = 0; i < 12; i += 1) await Promise.resolve()
      })
      if (methods.length > 2) {
        const preSettlementButton = method === 'PUT' ? '儲存到 My Learning' : '移除儲存'
        await waitFor(() => expect(screen.getByRole('button', { name: preSettlementButton })).toBeEnabled())
      }

      const methodsBeforeSettlement = [...methods]
      const mutationWasAbortedBeforeSettlement = mutationSignals.at(-1)?.aborted

      const mutationSucceeded = mutationOutcome === 'success'
      if (mutationSucceeded) serverSaved = method === 'PUT'
      await act(async () => {
        resolveMutation(method === 'PUT'
          ? mutationSucceeded
            ? new Response(JSON.stringify(savedRow()), { status: 200 })
            : new Response('{}', { status: 401 })
          : mutationSucceeded
            ? new Response(JSON.stringify({ itemId: item.id, kind: item.kind, revision: null, serverTimestamp: '2026-09-24T09:02:00.000Z' }), { status: 200 })
            : new Response('{}', { status: 401 }))
        await Promise.resolve()
      })

      const authoritativeButton = serverSaved ? '移除儲存' : '儲存到 My Learning'
      await waitFor(() => expect(screen.getByRole('button', { name: authoritativeButton })).toBeEnabled())
      expect(methodsBeforeSettlement).toEqual(['GET', method])
      expect(mutationWasAbortedBeforeSettlement).toBe(false)
      expect(methods).toEqual(['GET', method, 'GET'])
      expect(authorizationHeaders.at(-1)).toBe(`Bearer ${latestRefreshToken}`)
      expect(methods.filter((requestMethod) => requestMethod === method)).toHaveLength(1)
    },
  )

  it.each([
    ['lesson', 'PUT', sampleWorkplaceLearnItem],
    ['lesson', 'DELETE', sampleWorkplaceLearnItem],
    ['vocabulary', 'PUT', sampleWorkplaceVocabularyItem],
    ['vocabulary', 'DELETE', sampleWorkplaceVocabularyItem],
  ] as const)(
    'keeps an uncertain %s %s unavailable through later same-user refreshes',
    async (kind, method, item) => {
      setLocalePreference('zh-TW')
      vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
      const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
      const methods: string[] = []
      const authorizationHeaders: string[] = []
      let serverSaved = method === 'DELETE'
      let rejectMutation!: (reason?: unknown) => void
      const mutationSignals: AbortSignal[] = []
      const pendingMutation = new Promise<Response>((_resolve, reject) => { rejectMutation = reject })
      const savedRow = () => ({ itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true })
      vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const requestMethod = init?.method ?? 'GET'
        methods.push(requestMethod)
        authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
        if (requestMethod === 'GET') {
          return Promise.resolve(new Response(JSON.stringify({ items: serverSaved ? [savedRow()] : [] }), { status: 200 }))
        }
        if (requestMethod === method) {
          if (init?.signal) mutationSignals.push(init.signal as AbortSignal)
          return pendingMutation
        }
        throw new Error(`Unexpected save request: ${requestMethod}`)
      }))
      const route = kind === 'lesson' ? `/learn/workplace/${entry.slug}` : `/learn/vocabulary/${entry.slug}`
      const Page = kind === 'lesson' ? WorkplaceLessonPage : WorkplaceVocabularyPage
      const view = renderWithAppProviders(
        <Routes><Route path={kind === 'lesson' ? '/learn/workplace/:slug' : '/learn/vocabulary/:slug'} element={
          <Page catalogEntries={[entry]} publicItems={[item]} />
        } /></Routes>,
        { initialEntries: [route], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
      )

      const actionButton = method === 'PUT' ? '儲存到 My Learning' : '移除儲存'
      fireEvent.click(await screen.findByRole('button', { name: actionButton }))
      await waitFor(() => expect(methods).toEqual(['GET', method]))
      await act(async () => {
        rejectMutation(new Error('connection lost after dispatch'))
        await Promise.resolve()
      })
      expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()

      const firstRefreshToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'uncertainty-refresh-1' }))}.signature`
      const latestRefreshToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'uncertainty-refresh-2' }))}.signature`
      let currentToken = firstRefreshToken
      vi.spyOn(view.authClient, 'getAccessToken').mockImplementation(async () => currentToken)
      await act(async () => {
        view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
        for (let i = 0; i < 12; i += 1) await Promise.resolve()
      })
      currentToken = latestRefreshToken
      await act(async () => {
        view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
        for (let i = 0; i < 12; i += 1) await Promise.resolve()
      })

      const equivalentEntry = { ...entry }
      view.rerender(
        <Routes><Route path={kind === 'lesson' ? '/learn/workplace/:slug' : '/learn/vocabulary/:slug'} element={
          <Page catalogEntries={[equivalentEntry]} publicItems={[item]} />
        } /></Routes>,
      )
      await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve() })

      if (methods.length > 2) {
        const precommitButton = method === 'PUT' ? '儲存到 My Learning' : '移除儲存'
        await waitFor(() => expect(screen.getByRole('button', { name: precommitButton })).toBeEnabled())
      }
      const precommitMethods = [...methods]
      serverSaved = method === 'PUT'
      await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve() })

      expect(screen.getByText('目前無法確認儲存狀態。')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '儲存到 My Learning' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
      expect(precommitMethods).toEqual(['GET', method])
      expect(methods).toEqual(['GET', method])

      fireEvent.click(screen.getByRole('button', { name: '重試' }))
      const authoritativeButton = serverSaved ? '移除儲存' : '儲存到 My Learning'
      expect(await screen.findByRole('button', { name: authoritativeButton })).toBeInTheDocument()
      expect(methods).toEqual(['GET', method, 'GET'])
      expect(authorizationHeaders.at(-1)).toBe(`Bearer ${latestRefreshToken}`)
      expect(methods.filter((requestMethod) => requestMethod === method)).toHaveLength(1)
      expect(mutationSignals.at(-1)?.aborted).toBe(false)
    },
  )

  it('clears an uncertain save owner marker when a different active account takes over', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const item = sampleWorkplaceLearnItem
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
    const methods: string[] = []
    const authorizationHeaders: string[] = []
    let oldOwnerCommitted = false
    let rejectPut!: (reason?: unknown) => void
    const pendingPut = new Promise<Response>((_resolve, reject) => { rejectPut = reject })
    const nextOwnerToken = `header.${btoa(JSON.stringify({ sub: 'member-2', jti: 'new-active-owner' }))}.signature`
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const authorization = new Headers(init?.headers).get('Authorization') ?? ''
      methods.push(method)
      authorizationHeaders.push(authorization)
      if (method === 'GET') {
        const items = authorization === `Bearer ${nextOwnerToken}` || !oldOwnerCommitted ? [] : [{
          itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true,
        }]
        return Promise.resolve(new Response(JSON.stringify({ items }), { status: 200 }))
      }
      if (method === 'PUT') return pendingPut
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    fireEvent.click(await screen.findByRole('button', { name: '儲存到 My Learning' }))
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT']))
    await act(async () => {
      rejectPut(new Error('connection lost after dispatch'))
      await Promise.resolve()
    })
    expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()

    vi.spyOn(view.authClient, 'getAccessToken').mockResolvedValue(nextOwnerToken)
    act(() => view.authClient.emitAuthStateChange({ id: 'member-2', email: 'other@example.com' }))
    expect(await screen.findByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
    expect(authorizationHeaders.at(-1)).toBe(`Bearer ${nextOwnerToken}`)

    oldOwnerCommitted = true
    expect(screen.getByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
  })

  it('keeps an aborted same-identity save retryable after an equivalent entry rerender', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const item = sampleWorkplaceLearnItem
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
    const methods: string[] = []
    let serverSaved = false
    let resolvePut!: (response: Response) => void
    const putSignals: AbortSignal[] = []
    const pendingPut = new Promise<Response>((resolve) => { resolvePut = resolve })
    const savedRow = { itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true }
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      methods.push(method)
      if (method === 'GET') return Promise.resolve(new Response(JSON.stringify({ items: serverSaved ? [savedRow] : [] }), { status: 200 }))
      if (method === 'PUT') {
        if (init?.signal) putSignals.push(init.signal as AbortSignal)
        return pendingPut
      }
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    fireEvent.click(await screen.findByRole('button', { name: '儲存到 My Learning' }))
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT']))
    expect(putSignals.at(-1)?.aborted).toBe(false)

    const equivalentEntry = { ...entry }
    view.rerender(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[equivalentEntry]} publicItems={[item]} />} /></Routes>,
    )
    await waitFor(() => expect(putSignals.at(-1)?.aborted).toBe(true))
    serverSaved = true
    await act(async () => {
      resolvePut(new Response(JSON.stringify(savedRow), { status: 200 }))
      for (let i = 0; i < 12; i += 1) await Promise.resolve()
    })

    expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT'])

    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('button', { name: '移除儲存' })).toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
    expect(methods.filter((method) => method === 'PUT')).toHaveLength(1)
  })

  it('clears an uncertain save marker when the workplace entry changes', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const originalItem = sampleWorkplaceLearnItem
    const originalEntry = workplaceLearnCatalog.find((candidate) => candidate.id === originalItem.id)!
    const nextItem: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem,
      id: 'workplace-learn-sample-status-update-next',
      title: '次の職場サンプル',
    }
    const nextEntry = toWorkplaceLearnCatalogEntry(nextItem)
    const methods: string[] = []
    const requestUrls: string[] = []
    let oldEntryCommitted = false
    let rejectPut!: (reason?: unknown) => void
    const pendingPut = new Promise<Response>((_resolve, reject) => { rejectPut = reject })
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const url = String(input)
      methods.push(method)
      requestUrls.push(url)
      if (method === 'GET') {
        const itemId = new URL(url).searchParams.get('itemId')
        const items = itemId === originalItem.id && oldEntryCommitted ? [{
          itemId: originalItem.id, kind: originalItem.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true,
        }] : []
        return Promise.resolve(new Response(JSON.stringify({ items }), { status: 200 }))
      }
      if (method === 'PUT') return pendingPut
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[originalEntry]} publicItems={[originalItem]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${originalEntry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    fireEvent.click(await screen.findByRole('button', { name: '儲存到 My Learning' }))
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT']))
    await act(async () => {
      rejectPut(new Error('connection lost after dispatch'))
      await Promise.resolve()
    })
    expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()

    view.rerender(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[nextEntry]} publicItems={[nextItem]} />} /></Routes>,
    )
    expect(await screen.findByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
    expect(requestUrls.at(-1)).toContain(`itemId=${nextItem.id}`)

    oldEntryCommitted = true
    expect(screen.getByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
  })

  it('retains uncertainty until an explicit retry GET succeeds despite refresh during and after retry', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const item = sampleWorkplaceLearnItem
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
    const methods: string[] = []
    const authorizationHeaders: string[] = []
    let serverSaved = false
    let rejectPut!: (reason?: unknown) => void
    let resolveFirstRetry!: (response: Response) => void
    const firstRetrySignals: AbortSignal[] = []
    const pendingPut = new Promise<Response>((_resolve, reject) => { rejectPut = reject })
    const pendingFirstRetry = new Promise<Response>((resolve) => { resolveFirstRetry = resolve })
    const savedRow = () => ({ itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true })
    let getCount = 0
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      methods.push(method)
      authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
      if (method === 'PUT') return pendingPut
      if (method === 'GET') {
        getCount += 1
        if (getCount === 1) return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))
        if (getCount === 2) {
          if (init?.signal) firstRetrySignals.push(init.signal as AbortSignal)
          return pendingFirstRetry
        }
        if (getCount === 3) return Promise.resolve(new Response(JSON.stringify({ items: serverSaved ? [savedRow()] : [] }), { status: 200 }))
      }
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    const saveButton = await screen.findByRole('button', { name: '儲存到 My Learning' })
    const beforeRetryToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'before-manual-retry' }))}.signature`
    let currentToken = beforeRetryToken
    vi.spyOn(view.authClient, 'getAccessToken').mockImplementation(async () => currentToken)
    fireEvent.click(saveButton)
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT']))
    await act(async () => {
      rejectPut(new Error('connection lost after dispatch'))
      await Promise.resolve()
    })
    expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()

    serverSaved = true
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT', 'GET']))
    const latestToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'after-manual-retry-refresh' }))}.signature`
    currentToken = latestToken
    await act(async () => {
      view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
      for (let i = 0; i < 12; i += 1) await Promise.resolve()
    })

    if (methods.length > 3) {
      await waitFor(() => expect(screen.getByRole('button', { name: '移除儲存' })).toBeEnabled())
    }
    const methodsWhileRetryHeld = [...methods]
    const retryWasAbortedByRefresh = firstRetrySignals.at(-1)?.aborted
    await act(async () => {
      resolveFirstRetry(new Response('{}', { status: 401 }))
      for (let i = 0; i < 12; i += 1) await Promise.resolve()
    })

    expect(await screen.findByText('目前無法確認儲存狀態。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '儲存到 My Learning' })).not.toBeInTheDocument()
    expect(methodsWhileRetryHeld).toEqual(['GET', 'PUT', 'GET'])
    expect(retryWasAbortedByRefresh).toBe(false)

    await act(async () => {
      view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' })
      for (let i = 0; i < 12; i += 1) await Promise.resolve()
    })
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()

    const equivalentEntry = { ...entry }
    view.rerender(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[equivalentEntry]} publicItems={[item]} />} /></Routes>,
    )
    await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve() })
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('button', { name: '移除儲存' })).toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET', 'GET'])
    expect(authorizationHeaders.at(-1)).toBe(`Bearer ${latestToken}`)
    expect(methods.filter((method) => method === 'PUT')).toHaveLength(1)
  })

  it('keeps the pending mutation when same-user refresh arrives during token acquisition', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const item = sampleWorkplaceLearnItem
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
    const methods: string[] = []
    const authorizationHeaders: string[] = []
    let serverSaved = false
    let resolveToken!: (token: string | null) => void
    let resolvePut!: (response: Response) => void
    const mutationSignals: AbortSignal[] = []
    const pendingToken = new Promise<string | null>((resolve) => { resolveToken = resolve })
    const pendingPut = new Promise<Response>((resolve) => { resolvePut = resolve })
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      methods.push(method)
      authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
      if (method === 'GET') {
        const items = serverSaved ? [{ itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true }] : []
        return Promise.resolve(new Response(JSON.stringify({ items }), { status: 200 }))
      }
      if (method === 'PUT') {
        if (init?.signal) mutationSignals.push(init.signal as AbortSignal)
        return pendingPut
      }
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    const saveButton = await screen.findByRole('button', { name: '儲存到 My Learning' })
    const getAccessToken = vi.spyOn(view.authClient, 'getAccessToken').mockReturnValue(pendingToken)
    getAccessToken.mockClear()
    fireEvent.click(saveButton)
    await waitFor(() => expect(getAccessToken).toHaveBeenCalledTimes(1))
    expect(methods).toEqual(['GET'])

    const refreshedToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'token-acquired-after-refresh' }))}.signature`
    act(() => view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' }))
    expect(methods).toEqual(['GET'])
    await act(async () => {
      resolveToken(refreshedToken)
      await Promise.resolve()
    })

    await waitFor(() => expect(methods).toEqual(['GET', 'PUT']))
    expect(authorizationHeaders.at(-1)).toBe(`Bearer ${refreshedToken}`)
    expect(mutationSignals.at(-1)?.aborted).toBe(false)
    serverSaved = true
    await act(async () => {
      resolvePut(new Response(JSON.stringify({ itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true }), { status: 200 }))
      await Promise.resolve()
    })
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT', 'GET']))
    expect(await screen.findByRole('button', { name: '移除儲存' })).toBeEnabled()
    expect(methods.filter((method) => method === 'PUT')).toHaveLength(1)
  })

  it('aborts a pending save on account change and discards its late success', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const item = sampleWorkplaceLearnItem
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
    const methods: string[] = []
    const authorizationHeaders: string[] = []
    let resolvePut!: (response: Response) => void
    const putSignals: AbortSignal[] = []
    const pendingPut = new Promise<Response>((resolve) => { resolvePut = resolve })
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      methods.push(method)
      authorizationHeaders.push(new Headers(init?.headers).get('Authorization') ?? '')
      if (method === 'GET') return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      if (method === 'PUT') {
        if (init?.signal) putSignals.push(init.signal as AbortSignal)
        return pendingPut
      }
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    fireEvent.click(await screen.findByRole('button', { name: '儲存到 My Learning' }))
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT']))
    const refreshedToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'refresh-before-account-switch' }))}.signature`
    const nextOwnerToken = `header.${btoa(JSON.stringify({ sub: 'member-2', jti: 'new-owner' }))}.signature`
    let currentToken = refreshedToken
    vi.spyOn(view.authClient, 'getAccessToken').mockImplementation(async () => currentToken)
    act(() => view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' }))
    expect(methods).toEqual(['GET', 'PUT'])
    expect(putSignals.at(-1)?.aborted).toBe(false)

    currentToken = nextOwnerToken
    act(() => view.authClient.emitAuthStateChange({ id: 'member-2', email: 'other@example.com' }))
    expect(await screen.findByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(putSignals.at(-1)?.aborted).toBe(true)
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
    expect(authorizationHeaders.at(-1)).toBe(`Bearer ${nextOwnerToken}`)

    await act(async () => {
      resolvePut(new Response(JSON.stringify({ itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true }), { status: 200 }))
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
  })

  it('aborts a pending save when the released workplace entry revision changes', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const privateItem: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem,
      id: 'private-workplace-revision-switch-test',
      slug: 'private-workplace-revision-switch-test',
      title: 'Revision switch lesson',
      access: 'plus',
      sampleLabel: undefined,
      relatedVocabularyIds: [],
    }
    const firstRevision = 'a'.repeat(64)
    const nextRevision = 'b'.repeat(64)
    const firstEntry = toWorkplaceLearnCatalogEntry(privateItem, { contentId: privateItem.id, revision: firstRevision })
    const nextEntry = toWorkplaceLearnCatalogEntry(privateItem, { contentId: privateItem.id, revision: nextRevision })
    const methods: string[] = []
    let resolvePut!: (response: Response) => void
    const putSignals: AbortSignal[] = []
    const pendingPut = new Promise<Response>((resolve) => { resolvePut = resolve })
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      methods.push(method)
      if (method === 'GET') return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      if (method === 'PUT') {
        if (init?.signal) putSignals.push(init.signal as AbortSignal)
        return pendingPut
      }
      throw new Error(`Unexpected save request: ${method}`)
    }))
    const loadPayload = vi.fn().mockResolvedValue({ kind: 'ok', item: privateItem })
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[firstEntry]} publicItems={[]} loadPayload={loadPayload} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${firstEntry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') } },
    )

    fireEvent.click(await screen.findByRole('button', { name: '儲存到 My Learning' }))
    await waitFor(() => expect(methods).toEqual(['GET', 'PUT']))
    view.rerender(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[nextEntry]} publicItems={[]} loadPayload={loadPayload} />} /></Routes>,
    )

    expect(await screen.findByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(putSignals.at(-1)?.aborted).toBe(true)
    expect(methods).toEqual(['GET', 'PUT', 'GET'])

    await act(async () => {
      resolvePut(new Response(JSON.stringify({ itemId: privateItem.id, kind: privateItem.kind, revision: firstRevision, savedAt: '2026-09-24T09:01:00.000Z', current: true }), { status: 200 }))
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: '儲存到 My Learning' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    expect(methods).toEqual(['GET', 'PUT', 'GET'])
  })

  it('ignores a deferred same-user recovery GET after account and membership change', async () => {
    setLocalePreference('zh-TW')
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const item = sampleWorkplaceLearnItem
    const entry = workplaceLearnCatalog.find((candidate) => candidate.id === item.id)!
    const methods: string[] = []
    let getCount = 0
    let resolveRecovery!: (response: Response) => void
    const recoverySignals: AbortSignal[] = []
    const pendingRecovery = new Promise<Response>((resolve) => { resolveRecovery = resolve })
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      methods.push(method)
      if (method !== 'GET') throw new Error(`Unexpected save request: ${method}`)
      getCount += 1
      if (getCount === 1) return Promise.resolve(new Response('{}', { status: 401 }))
      if (init?.signal) recoverySignals.push(init.signal as AbortSignal)
      return pendingRecovery
    }))
    const membershipRepository = {
      getAccess: vi.fn(async (userId: string) => userId === 'member-1' ? 'active' as const : 'non-member' as const),
    }
    const view = renderWithAppProviders(
      <Routes><Route path="/learn/workplace/:slug" element={<WorkplaceLessonPage catalogEntries={[entry]} publicItems={[item]} />} /></Routes>,
      { initialEntries: [`/learn/workplace/${entry.slug}`], session: { id: 'member-1', email: 'member@example.com' }, membershipAccessRepository: membershipRepository },
    )

    await waitFor(() => {
      expect(methods).toEqual(['GET'])
      expect(screen.getByRole('region', { name: '儲存到 My Learning' })).toHaveTextContent('登入後可儲存教材；此功能提供 Plus 會員使用。')
    })
    const sameUserToken = `header.${btoa(JSON.stringify({ sub: 'member-1', jti: 'recovery-pending' }))}.signature`
    const nextUserToken = `header.${btoa(JSON.stringify({ sub: 'member-2', jti: 'new-owner' }))}.signature`
    vi.spyOn(view.authClient, 'getAccessToken').mockResolvedValueOnce(sameUserToken).mockResolvedValue(nextUserToken)
    act(() => view.authClient.emitAuthStateChange({ id: 'member-1', email: 'member@example.com' }))
    await waitFor(() => expect(methods).toEqual(['GET', 'GET']))

    act(() => view.authClient.emitAuthStateChange({ id: 'member-2', email: 'other@example.com' }))
    expect(await screen.findByText('儲存 Workplace Learn 教材需要 Plus 會員。')).toBeInTheDocument()
    expect(recoverySignals.at(-1)?.aborted).toBe(true)
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()

    await act(async () => {
      resolveRecovery(new Response(JSON.stringify({ items: [{
        itemId: item.id, kind: item.kind, revision: null, savedAt: '2026-09-24T09:01:00.000Z', current: true,
      }] }), { status: 200 }))
      await Promise.resolve()
    })
    expect(screen.getByText('儲存 Workplace Learn 教材需要 Plus 會員。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除儲存' })).not.toBeInTheDocument()
    expect(methods).toEqual(['GET', 'GET'])
  })
})
