import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { Link, Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { SpiExplainerPage } from './SpiExplainerPage'

const SPI_EXPLAINER_DESCRIPTION =
  'SPI 是什麼？給想在日本求職的外國人求職者：說明 SPI 3 與 Web Test 的測驗內容、作答時間與準備方向。'

afterEach(() => {
  cleanup()
})

function renderSpiExplainerRoute() {
  return renderWithAppProviders(
    <Routes>
      <Route
        path="/practice/web-test/about-spi"
        element={(
          <>
            <SpiExplainerPage />
            <Link to="/practice/web-test">前往 Web Test</Link>
          </>
        )}
      />
      <Route path="/practice/web-test" element={<p>Web Test hub</p>} />
    </Routes>,
    { initialEntries: ['/practice/web-test/about-spi'] },
  )
}

describe('SPI explainer route description', () => {
  it('sets a route-specific SPI description and restores the prior description on route leave', () => {
    const description = document.createElement('meta')
    description.name = 'description'
    description.content = '原有的頁面描述'
    document.head.append(description)
    const original = description.content

    try {
      renderSpiExplainerRoute()

      expect(description.content).toBe(SPI_EXPLAINER_DESCRIPTION)

      fireEvent.click(screen.getByRole('link', { name: '前往 Web Test' }))
      expect(screen.getByText('Web Test hub')).toBeInTheDocument()
      expect(description.content).toBe(original)
    } finally {
      description.remove()
    }
  })

  it('creates the description while mounted and removes it again on unmount', () => {
    expect(document.querySelector('meta[name="description"]')).toBeNull()

    renderSpiExplainerRoute()
    const created = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    expect(created?.content).toBe(SPI_EXPLAINER_DESCRIPTION)

    cleanup()
    expect(document.querySelector('meta[name="description"]')).toBeNull()
  })
})
