import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../../test/appProviders'
import { setLocalePreference } from '../../i18n/strings'
import { LegalIndexPage } from './LegalIndexPage'
import { LegalPage } from './LegalPage'

describe('legal pages', () => {
  it('renders the legal index with every document', () => {
    renderWithAppProviders(<LegalIndexPage />)

    expect(screen.getByRole('heading', { name: '法律情報' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /利用規約/ })).toHaveAttribute('href', '/legal/terms')
    expect(screen.getByRole('link', { name: /プライバシーポリシー/ })).toHaveAttribute(
      'href',
      '/legal/privacy',
    )
    expect(screen.getByRole('link', { name: /特定商取引法に基づく表記/ })).toHaveAttribute(
      'href',
      '/legal/tokushoho',
    )
    expect(screen.getByRole('link', { name: /返品・返金ポリシー/ })).toHaveAttribute(
      'href',
      '/legal/refunds',
    )
  })

  it('renders a document by slug with title, meta, draft notice, and body', () => {
    renderWithAppProviders(
      <Routes>
        <Route path="/legal/:slug" element={<LegalPage />} />
      </Routes>,
      { initialEntries: ['/legal/terms'] },
    )

    expect(screen.getByRole('heading', { name: '利用規約' })).toBeInTheDocument()
    expect(screen.getByText(/版 v1/)).toBeInTheDocument()
    expect(screen.getByText(/ステータス ドラフト/)).toBeInTheDocument()
    // visible draft-review notice (role="note" banner, not the body's final note section)
    expect(screen.getByRole('note')).toHaveTextContent(/ドラフトです。法律専門家による審査前/)
    // a structured body section renders as a heading
    expect(screen.getByRole('heading', { name: '価格・支払' })).toBeInTheDocument()
  })

  it('renders zh-TW legal labels, title, and body from the active locale preference', () => {
    setLocalePreference('zh-TW')

    renderWithAppProviders(
      <Routes>
        <Route path="/legal/:slug" element={<LegalPage />} />
      </Routes>,
      { initialEntries: ['/legal/refunds'] },
    )

    expect(screen.getByRole('heading', { name: '退款政策' })).toBeInTheDocument()
    expect(screen.getByText(/版本 v1/)).toBeInTheDocument()
    expect(screen.getByText(/狀態 草稿/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/本頁內容為草稿/)
    expect(screen.getByRole('heading', { name: '台灣消費者保護法與 7 日解除權' })).toBeInTheDocument()
  })

  it('renders a not-found state for an unknown slug', () => {
    renderWithAppProviders(
      <Routes>
        <Route path="/legal/:slug" element={<LegalPage />} />
      </Routes>,
      { initialEntries: ['/legal/nope'] },
    )

    expect(
      screen.getByRole('heading', { name: '指定された文書は見つかりませんでした。' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '法律情報の一覧に戻る' })).toHaveAttribute(
      'href',
      '/legal',
    )
  })
})
