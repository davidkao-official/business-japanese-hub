import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { BookActions } from './BookActions'
import { paidKeigoBook } from '../content/fixtures/paid-test-books'

const { legalReadyMock } = vi.hoisted(() => ({ legalReadyMock: vi.fn(() => true) }))
vi.mock('../legal-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../legal-content')>()
  return { ...actual, isPaidLaunchLegalReady: legalReadyMock }
})

describe('BookActions — purchase placeholder while ownership resolves', () => {
  beforeEach(() => legalReadyMock.mockReturnValue(true))

  it('reserves the hidden unavailable-note line while the legal gate is closed', () => {
    legalReadyMock.mockReturnValue(false)
    const { container } = renderWithAppProviders(
      <BookActions book={paidKeigoBook} cta={{ primary: 'purchase' }} loading />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('確認中')
    const reserve = container.querySelector('.purchase-cta > .purchase-cta__note--reserve')
    expect(reserve).toHaveTextContent('決済は準備中です。')
    expect(reserve).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
  })

  it('reserves nothing extra once the legal gate is open', () => {
    const { container } = renderWithAppProviders(
      <BookActions book={paidKeigoBook} cta={{ primary: 'purchase' }} loading />,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(container.querySelector('.purchase-cta__note--reserve')).toBeNull()
  })
})
