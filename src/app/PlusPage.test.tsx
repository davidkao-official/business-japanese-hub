import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStrings, SUPPORTED_LOCALES } from '../i18n/strings'
import type {
  PlusMembershipAccessRepository,
  PlusSubscriptionProjection,
} from '../lib/membership/access'
import { renderWithAppProviders } from '../test/appProviders'
import { PlusPage } from './PlusPage'

const { fetchPlusCheckoutOpenMock, cancelPlusMembershipMock } = vi.hoisted(() => ({
  fetchPlusCheckoutOpenMock: vi.fn(),
  cancelPlusMembershipMock: vi.fn(),
}))

vi.mock('../lib/membership/checkout', () => ({
  fetchPlusCheckoutOpen: fetchPlusCheckoutOpenMock,
  startPlusCheckout: vi.fn(),
  submitHostedCheckout: vi.fn(),
}))

vi.mock('../lib/membership/cancel', () => ({
  cancelPlusMembership: cancelPlusMembershipMock,
}))

const shopCss = readFileSync(join(process.cwd(), 'src/styles/shop.css'), 'utf8')

beforeEach(() => {
  fetchPlusCheckoutOpenMock.mockReset()
  fetchPlusCheckoutOpenMock.mockResolvedValue(null)
  cancelPlusMembershipMock.mockReset()
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
      getAccess: vi.fn(async () => ({ access: 'non-member' as const, subscription: undefined })),
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
      membershipAccessRepository: { getAccess: vi.fn(async () => ({ access: 'non-member' as const, subscription: undefined })) },
      initialEntries: ['/plus?checkout=returned'],
    })

    expect(await screen.findByText('お支払い結果を確認しています')).toBeInTheDocument()
  })

  it('lets an active member cancel after an explicit confirmation', async () => {
    cancelPlusMembershipMock.mockResolvedValue({
      kind: 'canceled',
      accessUntil: '2026-12-01T00:00:00.000Z',
    })
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository: { getAccess: vi.fn(async () => ({ access: 'active' as const, subscription: undefined })) },
    })

    fireEvent.click(await screen.findByRole('button', { name: '解約する' }))
    expect(screen.getByText('解約しますか？次回以降の課金は行われません。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '解約を確定する' }))

    expect(
      await screen.findByText(/解約しました。.*まで Plus を利用できます。/),
    ).toBeInTheDocument()
    expect(cancelPlusMembershipMock).toHaveBeenCalledTimes(1)
  })

  it('does not offer cancellation to non-members', async () => {
    const membershipAccessRepository: PlusMembershipAccessRepository = {
      getAccess: vi.fn(async () => ({ access: 'non-member' as const, subscription: undefined })),
    }
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository,
    })

    await waitFor(() => expect(membershipAccessRepository.getAccess).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: '解約する' })).not.toBeInTheDocument()
  })

  it('shows the period end after a reload when the subscription is already cancelled', async () => {
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository: membershipRepository('active', {
        status: 'canceled',
        accessUntil: '2099-12-01T00:00:00.000Z',
      }),
    })

    expect(
      await screen.findByText(/解約しました。.*まで Plus を利用できます。/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '解約する' })).not.toBeInTheDocument()
  })

  it('renders nothing for a cancelled subscription whose paid period has ended', async () => {
    const membershipAccessRepository = membershipRepository('non-member', {
      status: 'canceled',
      accessUntil: '2020-01-01T00:00:00.000Z',
    })
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository,
    })

    await waitFor(() => expect(membershipAccessRepository.getAccess).toHaveBeenCalled())
    expect(screen.queryByText(getStrings('ja').plus.cancel.body)).not.toBeInTheDocument()
  })

  it('lets a lapsed non-member stop the retries with a lapsed note above the button', async () => {
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository: membershipRepository('non-member', {
        status: 'active',
        accessUntil: '2099-12-01T00:00:00.000Z',
      }),
    })

    expect(
      await screen.findByText(getStrings('ja').plus.cancel.lapsedNote),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解約する' })).toBeInTheDocument()
  })

  it('offers cancellation for a cancel_requested subscription', async () => {
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository: membershipRepository('active', {
        status: 'cancel_requested',
        accessUntil: '2099-12-01T00:00:00.000Z',
      }),
    })

    expect(await screen.findByRole('button', { name: '解約する' })).toBeInTheDocument()
    expect(screen.queryByText(getStrings('ja').plus.cancel.lapsedNote)).not.toBeInTheDocument()
  })

  it('renders nothing when the server could not project a subscription', async () => {
    const membershipAccessRepository = membershipRepository('active', null)
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository,
    })

    await waitFor(() => expect(membershipAccessRepository.getAccess).toHaveBeenCalled())
    expect(screen.queryByText(getStrings('ja').plus.cancel.body)).not.toBeInTheDocument()
  })

  it('shows the plain cancellation result for a lapsed non-member', async () => {
    cancelPlusMembershipMock.mockResolvedValue({
      kind: 'canceled',
      accessUntil: '2020-01-01T00:00:00.000Z',
    })
    renderWithAppProviders(<PlusPage />, {
      session: { id: 'u-1', email: 'reader@example.com' },
      membershipAccessRepository: membershipRepository('non-member', {
        status: 'active',
        accessUntil: '2099-12-01T00:00:00.000Z',
      }),
    })

    fireEvent.click(await screen.findByRole('button', { name: '解約する' }))
    fireEvent.click(screen.getByRole('button', { name: '解約を確定する' }))

    expect(await screen.findByText('解約しました。')).toBeInTheDocument()
    expect(screen.queryByText(/まで Plus を利用できます/)).not.toBeInTheDocument()
  })
})

function membershipRepository(
  access: 'active' | 'non-member' | 'unavailable',
  subscription: PlusSubscriptionProjection,
): PlusMembershipAccessRepository {
  return { getAccess: vi.fn(async () => ({ access, subscription })) }
}
