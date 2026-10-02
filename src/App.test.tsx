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
import { setLocalePreference } from './i18n/strings'

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
    expect(heading).toHaveTextContent('「試験の日本語」から「日本のビジネス社会で使う日本語」へ。')
  })

  it('keeps the Library SPA root Japanese for a dormant locale preference', async () => {
    setLocalePreference('zh-CN')
    renderShellRoutes(['/'])
    await waitFor(() => expect(document.documentElement).toHaveAttribute('lang', 'ja'))
    setLocalePreference(null)
  })

  it('serves the public SPI explainer route with the required editorial structure and practice CTA', () => {
    window.history.replaceState(null, '', '/practice/web-test/about-spi')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: "SPIとは？日本での就職・転職前に知っておきたいWebテスト" })).toBeInTheDocument()
    for (const heading of [
      "SPI 3とは？", "SPIでは何を測る？", "SPI 3の主な種類", "SPIの受検方法は？",
      "SPIの試験時間はどのくらい？", "SPIで問われる「速さと正確さ」", "N1に合格していてもSPIが難しいのはなぜ？",
      "外国人にとって、SPIはJLPTより難しく感じることも", "外国人がつまずく大きな要因：頭の中で「翻訳」している",
      "「速く解く」とは？", "「正確に解く」とは？", "大手企業を目指すなら、SPIは「一応対策した」で終わらせない",
      "正答率90％を高い練習目標にする", "能力検査で高得点でも、必ず通過できるとは限らない", "日本の採用試験はSPIだけではない",
      "外国人は何から準備すればいい？", "日本で働きたい外国人の方へ、Davidからのアドバイス",
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getAllByText("Davidの視点")).toHaveLength(3)
    expect(screen.getByRole('complementary', { name: "Davidの視点：Webテストが選考に与える影響" })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: "Davidの視点：Webテストの準備不足と選考結果" })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: "Davidの視点：SPI対策の出発点" })).toBeInTheDocument()
    expect(screen.getByText(/Davidが知る就職活動中の学生や転職活動中の社会人の中には、日本人・外国人を問わず、Webテストの準備不足で選考の初期段階に不合格となった方が多くいます。/)).toBeInTheDocument()
    expect(screen.getByText(/N1は、日本語ができることを示すもの。SPIは、日本企業が日本語で働けるかどうかを判断し始める場です。/)).toBeInTheDocument()
    const timingTable = screen.getByRole('table', { name: "SPI 3の試験時間の目安" })
    expect(within(timingTable).getByRole('row', { name: /性格検査 約30〜40分/ })).toBeInTheDocument()
    expect(within(timingTable).getByRole('row', { name: /能力検査 約35〜70分/ })).toBeInTheDocument()
    expect(within(timingTable).getByRole('row', { name: /実際の試験時間 いずれも実施方式によって異なります。実際の時間は企業からの案内を確認してください。/ })).toBeInTheDocument()
    expect(within(timingTable).getByRole('row', { name: /編集上の注記 出典に記載された概略/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "就職・転職向けWebテストを練習する" })).toHaveAttribute('href', '/practice/web-test')
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

    fireEvent.click(screen.getByRole('link', { name: '学ぶ' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '学ぶ' })).toBeInTheDocument(),
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

    fireEvent.click(screen.getByRole('link', { name: '学ぶ' }))
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
      expect(screen.getByRole('heading', { name: '「試験の日本語」から「日本のビジネス社会で使う日本語」へ。' })).toBeInTheDocument(),
    )
    expect(scrollToSpy).not.toHaveBeenCalledWith(0, 0)
  })
})
