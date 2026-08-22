import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { PurchaseCTA } from './PurchaseCTA'
import { paidKeigoBook } from '../content/fixtures/paid-test-books'
import { jpConsentInfo, twConsentInfo } from '../lib/purchase/checkoutConsent'

const { legalReadyMock } = vi.hoisted(() => ({ legalReadyMock: vi.fn(() => true) }))
vi.mock('../legal-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../legal-content')>()
  return { ...actual, isPaidLaunchLegalReady: legalReadyMock }
})

const signedInUser = { id: 'u-1', email: 'reader@example.com' }

async function clickPurchase() {
  const button = await screen.findByRole('button', { name: /購入する/ })
  expect(button).toBeEnabled()
  fireEvent.click(button)
}

describe('PurchaseCTA — consumer-jurisdiction declaration + consent flow (#25)', () => {
  beforeEach(() => legalReadyMock.mockReturnValue(true))

  it('fails closed before auth or compliance while committed legal data is not launch-ready', async () => {
    legalReadyMock.mockReturnValue(false)
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
    })

    await clickPurchase()

    expect(screen.getByText('決済は準備中です。')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ログイン' })).not.toBeInTheDocument()
    expect(screen.queryByText('お住まいの国・地域を選択してください')).not.toBeInTheDocument()
    expect(executor).not.toHaveBeenCalled()
  })

  it('requires authentication before collecting checkout compliance evidence', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
    })

    await clickPurchase()

    expect(screen.getByText('購入を続けるにはログインまたはアカウント作成が必要です。')).toBeInTheDocument()
    expect(screen.queryByText('お住まいの国・地域を選択してください')).not.toBeInTheDocument()
    expect(executor).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'reader@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログインして続ける' }))

    expect(await screen.findByText('お住まいの国・地域を選択してください')).toBeInTheDocument()
    expect(executor).not.toHaveBeenCalled()
  })

  it('moves keyboard focus into each checkout step and restores the purchase trigger on cancel', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    const purchase = await screen.findByRole('button', { name: /購入する/ })
    purchase.focus()
    fireEvent.click(purchase)

    const declaration = screen.getByRole('region', { name: 'お住まいの国・地域を選択してください' })
    await waitFor(() => expect(declaration).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: /戻る|キャンセル/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /購入する/ })).toHaveFocus())
  })

  it('focuses the email field when checkout requires authentication', async () => {
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: vi.fn(),
    })

    await clickPurchase()

    await waitFor(() => expect(screen.getByLabelText('メールアドレス')).toHaveFocus())
  })

  it('asks for a consumer-jurisdiction declaration before checkout (unresolved fails closed)', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()

    // The declaration step appears; no executor call yet.
    expect(screen.getByText('お住まいの国・地域を選択してください')).toBeInTheDocument()
    expect(executor).not.toHaveBeenCalled()
  })

  it('declared JP displays the exact versioned disclosures before payment handoff', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    const evidence = jpConsentInfo()
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()
    fireEvent.click(screen.getByRole('button', { name: '日本の消費者' }))

    // Selecting JP must not hand off to payment before the evidence is visible.
    expect(executor).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText(evidence.noticeHeading)).toBeInTheDocument()
    expect(screen.getByText(evidence.noticeText)).toBeInTheDocument()
    expect(screen.getByText(evidence.consentHeading)).toBeInTheDocument()
    expect(screen.getByText(evidence.consentText)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))

    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({
        jurisdiction: 'JP',
        consentGranted: true,
        noticeTextSnapshot: evidence.noticeText,
        consentTextSnapshot: evidence.consentText,
      }),
    )
  })

  it('declared TW still requires the TW pre-delivery consent checkbox (fail closed)', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    const evidence = twConsentInfo()
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()
    fireEvent.click(screen.getByRole('button', { name: '台湾の消費者' }))

    // The TW pre-delivery notice + consent statement are the versioned evidence shown.
    expect(screen.getByText(evidence.noticeText)).toBeInTheDocument()
    expect(screen.getByText(evidence.consentText)).toBeInTheDocument()

    const confirm = screen.getByRole('button', { name: '同意して購入する' })

    // Unchecked → blocked, executor never called.
    fireEvent.click(confirm)
    expect(screen.getByRole('alert')).toHaveTextContent(
      '購入を続けるには上記に同意する必要があります。',
    )
    expect(executor).not.toHaveBeenCalled()

    // Checked → submission proceeds with the built ConsentSubmission.
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(confirm)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({
        jurisdiction: 'TW',
        consentGranted: true,
        noticeTextSnapshot: evidence.noticeText,
        consentTextSnapshot: evidence.consentText,
      }),
    )
  })

  it('an explicit TW jurisdiction prop skips the declaration step and shows consent', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="TW" />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()

    // No declaration step; the TW consent step is shown directly.
    expect(screen.queryByText('お住まいの国・地域を選択してください')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({ jurisdiction: 'TW', consentGranted: true }),
    )
  })

  it('an explicit JP jurisdiction prop skips declaration but still shows disclosures first', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    const evidence = jpConsentInfo()
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="JP" />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()

    expect(screen.queryByText('お住まいの国・地域を選択してください')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText(evidence.noticeText)).toBeInTheDocument()
    expect(screen.getByText(evidence.consentText)).toBeInTheDocument()
    expect(executor).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({ jurisdiction: 'JP', consentGranted: true }),
    )
  })

  it('does not double-submit a purchase (one executor call per intent)', async () => {
    let resolveExec!: (result: { ok: true; orderId: string; status: 'pending' }) => void
    const executor = vi.fn(
      async () =>
        new Promise<{ ok: true; orderId: string; status: 'pending' }>((res) => {
          resolveExec = res
        }),
    )
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="TW" />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()
    fireEvent.click(screen.getByRole('checkbox'))
    const confirm = screen.getByRole('button', { name: '同意して購入する' })
    fireEvent.click(confirm)
    // A second click while the submission is in flight must not start a second checkout.
    fireEvent.click(confirm)

    expect(executor).toHaveBeenCalledTimes(1)
    resolveExec({ ok: true, orderId: 'order-1', status: 'pending' })
  })

  it('retries the exact consent snapshot after an expired session is reauthenticated', async () => {
    const executor = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'signed_out' } as const)
      .mockResolvedValueOnce({ ok: true, orderId: 'order-1', status: 'pending' } as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="JP" />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()
    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))

    expect(await screen.findByText('購入を続けるにはログインまたはアカウント作成が必要です。')).toBeInTheDocument()
    expect(executor).toHaveBeenCalledTimes(1)
    const originalConsent = executor.mock.calls[0]?.[1]

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'reader@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログインして続ける' }))

    await waitFor(() => expect(executor).toHaveBeenCalledTimes(2))
    expect(executor.mock.calls[1]?.[1]).toBe(originalConsent)
  })

  it('turns a stale-tab already-owned race into a Library recovery action', async () => {
    const executor = vi.fn().mockResolvedValue({ ok: false, reason: 'already_owned' } as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="JP" />, {
      purchaseExecutor: executor,
      session: signedInUser,
    })

    await clickPurchase()
    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))

    expect(await screen.findByText('取得済み')).toBeInTheDocument()
    const libraryLink = screen.getByRole('link', { name: 'ライブラリへ' })
    expect(libraryLink).toHaveAttribute('href', '/library')
    expect(libraryLink).toHaveFocus()
    expect(screen.queryByText('決済は準備中です。')).not.toBeInTheDocument()
  })

  it('does not carry an already-owned result across authenticated identities', async () => {
    const executor = vi.fn().mockResolvedValue({ ok: false, reason: 'already_owned' } as const)
    const { authClient } = renderWithAppProviders(
      <PurchaseCTA book={paidKeigoBook} jurisdiction="JP" />,
      { purchaseExecutor: executor, session: signedInUser },
    )

    await clickPurchase()
    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))
    expect(await screen.findByText('取得済み')).toBeInTheDocument()

    authClient.emitAuthStateChange({ id: 'u-2', email: 'other@example.com' })

    expect(await screen.findByRole('button', { name: /購入する/ })).toBeInTheDocument()
    expect(screen.queryByText('取得済み')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ライブラリへ' })).not.toBeInTheDocument()
  })
})
