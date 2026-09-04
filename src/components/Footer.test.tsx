import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { SELLER_DISCLOSURE } from '../legal-content'
import { Footer } from './Footer'

describe('footer', () => {
  it('renders legal links, the seller disclosure, and the existing note', () => {
    renderWithAppProviders(<Footer />)

    // legal index + document links
    expect(screen.getByRole('link', { name: '法律情報' })).toHaveAttribute('href', '/legal')
    expect(screen.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/legal/terms')
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    )
    expect(screen.getByRole('link', { name: '特定商取引法に基づく表記' })).toHaveAttribute(
      'href',
      '/legal/tokushoho',
    )
    expect(screen.getByRole('link', { name: '返品・返金ポリシー' })).toHaveAttribute(
      'href',
      '/legal/refunds',
    )

    // merchant-of-record disclosure uses the pending placeholder
    expect(screen.getByText(SELLER_DISCLOSURE.name)).toBeInTheDocument()
    expect(screen.getByText('（登録名確認中）')).toBeInTheDocument()

    // existing footer note is preserved
    expect(screen.getByText('© ビジネス日本語ハブ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ビジネス日本語ハブ' })).toHaveAttribute('href', '/')
  })
})
