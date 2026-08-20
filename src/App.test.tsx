import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { BookPage } from './app/BookPage'
import { HomePage } from './app/HomePage'
import { LibraryPage } from './app/LibraryPage'
import { NotFoundPage } from './app/NotFoundPage'
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

/** Renders the platform chrome (Layout) with the home + library routes. */
function renderShellRoutes(initialEntries: string[]) {
  return renderWithAppProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
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

    fireEvent.click(screen.getByRole('link', { name: 'マイライブラリ' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'マイライブラリ' })).toBeInTheDocument(),
    )
    expect(document.activeElement).toBe(main)
  })

  it('marks the Library link as current on its exact route', () => {
    renderShellRoutes(['/library'])

    expect(screen.getByRole('link', { name: 'マイライブラリ' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('does not mark the Library link as current on an unmatched descendant route', () => {
    renderShellRoutes(['/library/missing'])

    expect(screen.getByRole('link', { name: 'マイライブラリ' })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
  })

  it('resets scroll to the top on a forward (push) navigation', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderShellRoutes(['/'])

    fireEvent.click(screen.getByRole('link', { name: 'マイライブラリ' }))
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
