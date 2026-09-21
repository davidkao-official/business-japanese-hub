import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BookPage } from './app/BookPage'
import { HomePage } from './app/HomePage'
import { LibraryPage } from './app/LibraryPage'
import { NotFoundPage } from './app/NotFoundPage'
import { ProductModePage } from './app/ProductModePage'
import { Layout } from './components/Layout'
import { renderWithAppProviders } from './test/appProviders'

/** Test-only page exposing raw router actions so tests can drive push / POP. */
function RouterProbePage() {
  const navigate = useNavigate()
  return (
    <div>
      <h1>Router probe</h1>
      <button type="button" onClick={() => navigate('/library')}>
        push to library
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        go back
      </button>
    </div>
  )
}

/** Renders the platform chrome (Layout) with representative IA + legacy routes. */
function renderShellRoutes(initialEntries: string[]) {
  return renderWithAppProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="learn" element={<ProductModePage mode="learn" />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>,
    { initialEntries },
  )
}

/**
 * Smoke tests for the application shell. These exercise only the
 * platform-level chrome (routing, landmarks, i18n defaults) and are
 * intentionally independent of the content model.
 */
describe('application shell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    window.history.replaceState(null, '', '/')
  })
  it('renders the semantic landmarks', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument() // <header>
    // The header holds the primary site nav; the footer also exposes a secondary
    // legal-links nav, so scope the main-nav assertion to the banner.
    expect(within(screen.getByRole('banner')).getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument() // <main>
    expect(screen.getByRole('contentinfo')).toBeInTheDocument() // <footer>
  })

  it('renders a skip link pointing at the main landmark', () => {
    render(<App />)

    const skipLink = screen.getByRole('link', { name: '本文へスキップ' })
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  it('renders the home heading (ja default)', () => {
    render(<App />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('ビジネス日本語ハブ')
  })

  it('serves the public SPI explainer route with the required editorial structure and practice CTA', () => {
    window.history.replaceState(null, '', '/practice/web-test/about-spi')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'SPI是什麼？在日本求職前一定要知道的 網路測驗' })).toBeInTheDocument()
    for (const heading of [
      'SPI 3 是什麼？', 'SPI 主要在測什麼？', 'SPI 3 的主要種類', 'SPI 怎麼考？',
      'SPI 大概要考多久？', 'SPI 真正考的是「快速＋正確」', '為什麼很多 N1 合格者還是覺得 SPI 很難？',
      '對外國人而言，SPI 往往比 JLPT 更難', '外國人最大的問題：腦中還在「翻譯」',
      '什麼叫做「快速解題」？', '什麼叫做「正確解題」？', '想進大型企業，SPI 不能只是「有準備就好」',
      '正答率 90% 可以當作高標準目標', '能力測驗高分，也不代表一定會通過', '日本求職不只有 SPI',
      '外國人應該怎麼開始準備？', 'David 給想在日本工作的外國人的建議',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getAllByText('David 觀點')).toHaveLength(3)
    expect(screen.getByRole('complementary', { name: 'David 觀點：Web Test 對選考的影響' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'David 觀點：未準備 Web Test 的選考結果' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'David 觀點：SPI 的準備起點' })).toBeInTheDocument()
    expect(screen.getByText(/David 認識許多正在找工作的學生/)).toBeInTheDocument()
    expect(screen.getByText(/N1，是證明你會日文。SPI，是日本企業開始判斷你能不能用日文工作的地方。/)).toBeInTheDocument()
    const timingTable = screen.getByRole('table', { name: 'SPI 3 作答時間參考' })
    expect(within(timingTable).getByRole('row', { name: /性格検査 約 30–40 分鐘/ })).toBeInTheDocument()
    expect(within(timingTable).getByRole('row', { name: /能力検査 約 35–70 分鐘/ })).toBeInTheDocument()
    expect(within(timingTable).getByRole('row', { name: /實際應考時間 兩者皆依實施方式而異；實際時間請以企業通知為準/ })).toBeInTheDocument()
    expect(within(timingTable).getByRole('row', { name: /編輯說明 這是來源提供的概略資訊/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '日本求職網路測驗刷題' })).toHaveAttribute('href', '/practice/web-test')
    expect(screen.queryByText(/David 監修/)).not.toBeInTheDocument()
  })

  it('renders the library route with the signed-out state', async () => {
    renderWithAppProviders(
      <Routes>
        <Route path="/library" element={<LibraryPage />} />
      </Routes>,
      { initialEntries: ['/library'] },
    )

    expect(screen.getByRole('heading', { name: 'マイライブラリ' })).toBeInTheDocument()
    expect(
      await screen.findByText('ログインすると、購入した書籍と読書の進捗がここに表示されます。'),
    ).toBeInTheDocument()
  })

  it('renders a direct nested route beneath the production deployment basename', async () => {
    vi.stubEnv('BASE_URL', '/business-japanese-hub/')
    window.history.replaceState(null, '', '/business-japanese-hub/library')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'マイライブラリ' })).toBeInTheDocument()
  })

  it('surfaces the slug param on the book route', () => {
    renderWithAppProviders(
      <Routes>
        <Route path="/books/:slug" element={<BookPage />} />
      </Routes>,
      { initialEntries: ['/books/nihongo-notebook'] },
    )

    expect(screen.getByTestId('book-slug')).toHaveTextContent('nihongo-notebook')
  })

  it('moves focus to the main landmark after client-side navigation', async () => {
    renderShellRoutes(['/'])

    const main = screen.getByRole('main')
    // A fresh page load must not steal focus.
    expect(document.activeElement).not.toBe(main)

    fireEvent.click(screen.getByRole('link', { name: 'Learn' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Learn' })).toBeInTheDocument(),
    )
    expect(document.activeElement).toBe(main)
  })

  it('keeps the historical Library route out of primary navigation', () => {
    renderShellRoutes(['/library'])

    expect(screen.getByRole('heading', { name: 'マイライブラリ' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('banner')).getByRole('navigation').querySelector('a[href="/library"]'),
    ).toBeNull()
  })

  it('does not expose an unmatched historical Library descendant as current', () => {
    renderShellRoutes(['/library/missing'])

    expect(
      within(screen.getByRole('banner')).getByRole('navigation').querySelector('a[href="/library"]'),
    ).toBeNull()
    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
  })

  it('resets scroll to the top on a forward (push) navigation', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderShellRoutes(['/'])

    fireEvent.click(screen.getByRole('link', { name: 'Learn' }))
    await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 0))
  })

  it('does not force a scroll reset on a POP (back) navigation', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderWithAppProviders(
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="probe" element={<RouterProbePage />} />
          <Route path="library" element={<LibraryPage />} />
        </Route>
      </Routes>,
      { initialEntries: ['/', '/probe'], initialIndex: 1 },
    )

    fireEvent.click(screen.getByRole('button', { name: 'go back' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'ビジネス日本語ハブ' })).toBeInTheDocument(),
    )
    expect(scrollToSpy).not.toHaveBeenCalledWith(0, 0)
  })
})
