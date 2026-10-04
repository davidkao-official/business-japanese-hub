import { act, fireEvent, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { Header } from '../components/Header'
import { LanguageControl } from '../components/LanguageControl'
import { LegalPage } from '../app/legal/LegalPage'
import { renderWithAppProviders } from '../test/appProviders'
import { getActiveLocale, LOCALE_STORAGE_KEY, setLocalePreference, useLocale, useStrings } from './strings'

describe('Japanese-only V1 presentation', () => {
  it.each(['zh-TW', 'zh-CN', 'en'] as const)('keeps the saved %s preference without exposing it', (locale) => {
    setLocalePreference(locale)
    expect(getActiveLocale()).toBe('ja')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(locale)
    const { result } = renderHook(() => ({ locale: useLocale(), strings: useStrings() }))
    expect(result.current.locale).toBe('ja')
    expect(result.current.strings.legal.title).toBe('法律情報')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: LOCALE_STORAGE_KEY })))
    expect(result.current.locale).toBe('ja')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(locale)
  })

  it('pins Japanese even with an English browser and unavailable storage', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'languages')!
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['en-US'] })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(getActiveLocale()).toBe('ja')
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'languages', original)
  })

  it('renders no language picker in the header, mobile sheet, or standalone control', () => {
    renderWithAppProviders(<><Header /><LanguageControl /></>)
    expect(screen.queryByRole('button', { name: /表示言語/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    expect(screen.queryByRole('radiogroup', { name: /表示言語/ })).not.toBeInTheDocument()
  })

  it('renders the Japanese legal document for a saved Chinese preference', () => {
    setLocalePreference('zh-CN')
    renderWithAppProviders(<Routes><Route path="/legal/:slug" element={<LegalPage />} /></Routes>, { initialEntries: ['/legal/refunds'] })
    expect(screen.getByRole('heading', { name: '返品・返金ポリシー' })).toHaveAttribute('lang', 'ja')
    expect(document.querySelector('.legal-doc__body')).toHaveAttribute('lang', 'ja')
    expect(screen.queryByText(/简体中文版本/)).not.toBeInTheDocument()
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
  })
})
