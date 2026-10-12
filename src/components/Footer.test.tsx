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

    // merchant-of-record disclosure shows only the localized pending state (#191 B5)
    expect(SELLER_DISCLOSURE.pending).toBe(true)
    expect(screen.getByText('登録名確認中')).toHaveClass('site-footer__seller-pending')
    expect(screen.queryByText(SELLER_DISCLOSURE.name)).not.toBeInTheDocument()
    expect(document.querySelector('.site-footer__seller')).toHaveTextContent(/^販売者：登録名確認中$/)

    // existing footer note is preserved
    expect(screen.getByText('© ビジネス日本語ハブ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ビジネス日本語ハブ' })).toHaveAttribute('href', '/')
  })

  it('leaves appearance in the global header navigation (#208)', () => {
    renderWithAppProviders(<Footer />)

    expect(screen.queryByRole('radiogroup', { name: '外観' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
