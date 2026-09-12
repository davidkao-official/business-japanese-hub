import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Link, Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import {
  WebTestCategoryPage,
  WebTestFamilyPage,
  WebTestHubPage,
  WebTestRunnerEntryPage,
} from './WebTestHubPage'

afterEach(() => {
  cleanup()
  document.querySelector('meta[data-test-web-test-description]')?.remove()
})

function renderWebTestAt(path: string) {
  return renderWithAppProviders(
    <Routes>
      <Route path="/practice/web-test" element={<WebTestHubPage />} />
      <Route path="/practice/web-test/:family" element={<WebTestFamilyPage />} />
      <Route path="/practice/web-test/:family/:domain" element={<WebTestCategoryPage />} />
      <Route path="/practice/web-test/:family/:domain/:category" element={<WebTestRunnerEntryPage />} />
    </Routes>,
    { initialEntries: [path] },
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
