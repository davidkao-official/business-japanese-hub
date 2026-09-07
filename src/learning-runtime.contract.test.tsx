import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function renderAt(path: string) {
  vi.stubEnv('BASE_URL', '/')
  window.history.replaceState(null, '', path)
  return render(<App />)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

describe('Issue #110 — reusable Learn and Practice presentation surfaces', () => {
  it('surfaces the released Meeting Facilitation course-correction module through Learn', () => {
    renderAt('/learn')

    const main = screen.getByRole('main')
    const moduleLink = within(main).getByRole('link', {
      name: /議論を本筋に戻す|Course Correction/i,
    })

    expect(moduleLink.getAttribute('href')).toMatch(/^\/learn\/.+/)
  })

  it('presents #83 as a Learn unit instead of a paid Book offer and hands off to Practice', () => {
    const learnView = renderAt('/learn')
    const learnMain = screen.getByRole('main')
    const moduleHref = within(learnMain)
      .getByRole('link', { name: /議論を本筋に戻す|Course Correction/i })
      .getAttribute('href')

    expect(moduleHref).toMatch(/^\/learn\/.+/)
    learnView.unmount()

    renderAt(moduleHref!)
    const main = screen.getByRole('main')

    expect(within(main).getByRole('heading', { name: /議論を本筋に戻す/i })).toBeInTheDocument()
    expect(within(main).getByText(/承接\s*→\s*Pivot\s*→\s*收斂/i)).toBeInTheDocument()
    expect(main.querySelector('a[href^="/practice/"]')).not.toBeNull()

    expect(within(main).queryByText(/\$\s*12|12\s*USD/i)).not.toBeInTheDocument()
    expect(
      within(main).queryByRole('button', { name: /購入|purchase|buy/i }),
    ).not.toBeInTheDocument()
    expect(
      within(main).queryByRole('link', { name: /購入|purchase|buy/i }),
    ).not.toBeInTheDocument()
  })

  it('uses a generic Practice destination for the first #83 activity family without SPI-only framing', () => {
    const learnView = renderAt('/learn')
    const learnMain = screen.getByRole('main')
    const moduleHref = within(learnMain)
      .getByRole('link', { name: /議論を本筋に戻す|Course Correction/i })
      .getAttribute('href')
    learnView.unmount()

    const moduleView = renderAt(moduleHref!)
    const moduleMain = screen.getByRole('main')
    const practiceHref = moduleMain.querySelector('a[href^="/practice/"]')?.getAttribute('href')

    expect(practiceHref).toMatch(/^\/practice\/.+/)
    moduleView.unmount()

    renderAt(practiceHref!)
    const main = screen.getByRole('main')

    expect(
      screen.queryByRole('heading', { name: 'ページが見つかりません' }),
    ).not.toBeInTheDocument()
    expect(main).toHaveTextContent(/場面|情境|situational/i)
    expect(main).toHaveTextContent(/書き換え|改寫|rewrite/i)
    expect(main).toHaveTextContent(/立場|上下関係|authority/i)
    expect(main).not.toHaveTextContent(/SPI/i)
  })
})
