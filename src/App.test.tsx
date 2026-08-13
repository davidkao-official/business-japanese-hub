import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'
import { BookPage } from './app/BookPage'
import { LibraryPage } from './app/LibraryPage'

/**
 * Smoke tests for the application shell. These exercise only the
 * platform-level chrome (routing, landmarks, i18n defaults) and are
 * intentionally independent of the content model.
 */
describe('application shell', () => {
  it('renders the semantic landmarks', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument() // <header>
    expect(screen.getByRole('navigation')).toBeInTheDocument() // <nav>
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

  it('renders the library route as a placeholder page', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<LibraryPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'マイライブラリ' }),
    ).toBeInTheDocument()
  })

  it('surfaces the slug param on the book route', () => {
    render(
      <MemoryRouter initialEntries={['/books/nihongo-notebook']}>
        <Routes>
          <Route path="/books/:slug" element={<BookPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('book-slug')).toHaveTextContent('nihongo-notebook')
  })
})
