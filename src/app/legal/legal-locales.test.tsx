import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { setLocalePreference } from '../../i18n/strings'
import { renderWithAppProviders } from '../../test/appProviders'
import { LegalPage } from './LegalPage'

// Future complete-locale launches retain the existing legal-document fallback.
// The real V1 launched-locales list and Japanese legal view are tested separately.
vi.mock('../../i18n/locales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../i18n/locales')>()
  return { ...actual, LAUNCHED_LOCALES: actual.SUPPORTED_LOCALES }
})

describe('dormant legal locales', () => {
  it('retains the Traditional Chinese legal document and labels', () => {
    setLocalePreference('zh-TW')
    renderWithAppProviders(
      <Routes><Route path="/legal/:slug" element={<LegalPage />} /></Routes>,
      { initialEntries: ['/legal/refunds'] },
    )
    expect(screen.getByRole('heading', { name: '退款政策' })).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getByText(/版本 v1/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/本頁內容為草稿/)
    expect(screen.getByRole('heading', { name: '台灣消費者保護法與 7 日解除權' })).toBeInTheDocument()
  })

  it('retains the explicit Simplified Chinese notice for the Traditional Chinese legal fallback', () => {
    setLocalePreference('zh-CN')
    renderWithAppProviders(
      <Routes><Route path="/legal/:slug" element={<LegalPage />} /></Routes>,
      { initialEntries: ['/legal/refunds'] },
    )
    expect(screen.getByRole('heading', { name: '退款政策' })).toHaveAttribute('lang', 'zh-TW')
    expect(document.querySelector('.legal-doc__body')).toHaveAttribute('lang', 'zh-TW')
    expect(screen.getAllByRole('note').some((note) => note.textContent?.includes('简体中文版本'))).toBe(true)
  })
})
