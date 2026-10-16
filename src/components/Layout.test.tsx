import { configure, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { Layout } from './Layout'

function ReaderRoute() {
  const navigate = useNavigate()
  return (
    <>
      <Link to="/books/example">書籍へ戻る</Link>
      <button type="button" onClick={() => navigate(-1)}>Go back</button>
    </>
  )
}

function renderRoutes(initialEntries: string[]) {
  const routes = (
    <Routes>
      <Route path="/books/example/read/chapter" element={<ReaderRoute />} />
      <Route element={<Layout />}>
        <Route path="/books/example" element={<Link to="/library">Open library</Link>} />
        <Route path="/library" element={<ReaderRoute />} />
      </Route>
    </Routes>
  )
  return renderWithAppProviders(routes, { initialEntries })
}

describe.each([false, true])('Layout route focus (StrictMode=%s)', (strict) => {
  beforeEach(() => {
    configure({ reactStrictMode: strict })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    configure({ reactStrictMode: false })
    vi.restoreAllMocks()
  })

  it('does not focus main or scroll on an initial page load', () => {
    renderRoutes(['/books/example'])

    expect(screen.getByRole('main')).not.toHaveFocus()
    expect(document.activeElement).toBe(document.body)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('does not focus main or scroll when reloading a pushed history entry', async () => {
    const previousHistoryState: unknown = window.history.state
    window.history.replaceState({ usr: null, key: 'reloaded', idx: 2 }, '')
    vi.resetModules()
    let view: ReturnType<typeof render> | undefined

    try {
      // Reload Layout and its providers/router together to preserve context identity.
      const [
        { Layout: ReloadedLayout },
        { BrowserRouter },
        { AuthProvider },
        { AppearanceProvider },
        { createMockAuthClient },
      ] = await Promise.all([
        import('./Layout'),
        import('react-router-dom'),
        import('@business-japanese-hub/platform-auth'),
        import('../lib/appearance/AppearanceContext'),
        import('../test/appProviders'),
      ])

      view = render(
        <AppearanceProvider>
          <AuthProvider authClient={createMockAuthClient(null)}>
            <BrowserRouter>
              <ReloadedLayout />
            </BrowserRouter>
          </AuthProvider>
        </AppearanceProvider>,
      )

      expect(screen.getByRole('main')).not.toHaveFocus()
      expect(document.activeElement).toBe(document.body)
      expect(window.scrollTo).not.toHaveBeenCalled()
    } finally {
      view?.unmount()
      window.history.replaceState(previousHistoryState, '')
      vi.resetModules()
    }
  })

  it('focuses main and resets scroll on a PUSH from outside Layout', async () => {
    const user = userEvent.setup()
    renderRoutes(['/books/example/read/chapter'])
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')

    await user.click(screen.getByRole('link', { name: '書籍へ戻る' }))

    expect(screen.getByRole('main')).toHaveFocus()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0)
  })

  it('focuses main without scrolling on a POP from outside Layout', async () => {
    const user = userEvent.setup()
    renderRoutes(['/library', '/books/example', '/books/example/read/chapter'])
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')

    await user.click(screen.getByRole('button', { name: 'Go back' }))

    expect(screen.getByRole('main')).toHaveFocus()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('still focuses main on navigation within Layout', async () => {
    const user = userEvent.setup()
    renderRoutes(['/books/example'])
    const main = screen.getByRole('main')
    const focus = vi.spyOn(main, 'focus')

    await user.click(screen.getByRole('link', { name: 'Open library' }))

    expect(main).toHaveFocus()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 0)

    vi.mocked(window.scrollTo).mockClear()
    await user.click(screen.getByRole('button', { name: 'Go back' }))

    expect(screen.getByRole('main')).toBe(main)
    expect(main).toHaveFocus()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
