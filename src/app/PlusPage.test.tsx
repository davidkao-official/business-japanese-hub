import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getStrings, SUPPORTED_LOCALES } from '../i18n/strings'
import { renderWithAppProviders } from '../test/appProviders'
import { PlusPage } from './PlusPage'

describe('PlusPage', () => {
  it('presents Early Access as NT$299 per month without an active NT$399 or annual offer', () => {
    renderWithAppProviders(<PlusPage />)

    expect(screen.getByText('NT$299')).toBeInTheDocument()
    expect(screen.getByText('/ 月')).toBeInTheDocument()
    expect(screen.getByText(/年額プランは現在購入できません/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NT\$399|NT\$3,990/)
    expect(screen.queryByRole('button', { name: /購入|支払い/ })).not.toBeInTheDocument()

    for (const locale of SUPPORTED_LOCALES) {
      const plus = getStrings(locale).plus
      expect(plus.priceAmount).toBe('NT$299')
      expect(JSON.stringify(plus)).not.toMatch(/NT\$399|NT\$3,990/)
    }
  })

  it('shows a bounded signed-out preview of the current Plus learning surfaces', async () => {
    renderWithAppProviders(<PlusPage />)

    expect(screen.getByText('Plus プレビュー')).toBeInTheDocument()
    expect(screen.getAllByText('Practice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Read').length).toBeGreaterThan(0)
    expect(screen.getAllByText('My Learning').length).toBeGreaterThan(0)
    expect(await screen.findByText('ログインして会員状態を確認')).toBeInTheDocument()
    expect(screen.queryByText('Unlocked Plus content')).not.toBeInTheDocument()
  })
})
