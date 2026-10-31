import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStrings, SUPPORTED_LOCALES } from '../i18n/strings'
import type { PlusMembershipAccessRepository } from '../lib/membership/access'
import { renderWithAppProviders } from '../test/appProviders'
import { PlusPage } from './PlusPage'

const { fetchPlusCheckoutOpenMock } = vi.hoisted(() => ({ fetchPlusCheckoutOpenMock: vi.fn() }))

vi.mock('../lib/membership/checkout', () => ({
  fetchPlusCheckoutOpen: fetchPlusCheckoutOpenMock,
  startPlusCheckout: vi.fn(),
  submitHostedCheckout: vi.fn(),
}))

const shopCss = readFileSync(join(process.cwd(), 'src/styles/shop.css'), 'utf8')

beforeEach(() => {
  fetchPlusCheckoutOpenMock.mockReset()
  fetchPlusCheckoutOpenMock.mockResolvedValue(null)
})

describe('PlusPage', () => {
  it('presents Early Access as NT$299 per month without an active NT$399 or annual offer', () => {
    renderWithAppProviders(<PlusPage />)

    const priceAmount = screen.getByText('NT$299')
    expect(priceAmount).toBeInTheDocument()
    expect(priceAmount).toHaveClass('price')
    expect(priceAmount).not.toHaveAttribute('lang')
    expect(priceAmount.closest('[lang="en"]')).toBeNull()
    expect(priceAmount.parentElement).toHaveClass('plus-price__amount')
    expect(shopCss).toMatch(/\.price\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s)
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

    expect(screen.getByText('Plus の提供予定内容')).toBeInTheDocument()
    expect(screen.getAllByText(/会員向け教材は準備中です/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/公開中なのは架空のオリジナル教材サンプル/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('練習').length).toBeGreaterThan(0)
    expect(screen.getAllByText('読む').length).toBeGreaterThan(0)
    expect(screen.getAllByText('学習記録').length).toBeGreaterThan(0)
    expect(await screen.findByText('ログインして会員状態を確認')).toBeInTheDocument()
    expect(screen.queryByText('Unlocked Plus content')).not.toBeInTheDocument()
  })

  it('shows the checkout sign-in prompt only when the server reports checkout open', async () => {
    fetchPlusCheckoutOpenMock.mockResolvedValue('test-consent-1')
    renderWithAppProviders(<PlusPage />)

    expect(await screen.findByText('お申し込みにはログインが必要です。')).toBeInTheDocument()
  })

  it('keeps the CTA disabled until the recurring-billing consent is checked', async () => {
    fetchPlusCheckoutOpenMock.mockResolvedValue('test-consent-1')
    const membershipAccessRepository: PlusMembershipAccessRepository = {
      getAccess: vi.fn(async () => 'non-member' as const),
    }
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository,
    })

    const cta = await screen.findByRole('button', { name: 'Plus に申し込む' })
    expect(cta).toBeDisabled()
  })

  it('shows the payment re-check state after returning from ECPay', async () => {
    fetchPlusCheckoutOpenMock.mockResolvedValue('test-consent-1')
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository: { getAccess: vi.fn(async () => 'non-member' as const) },
      initialEntries: ['/plus?checkout=returned'],
    })

    expect(await screen.findByText('お支払い結果を確認しています')).toBeInTheDocument()
  })
})
