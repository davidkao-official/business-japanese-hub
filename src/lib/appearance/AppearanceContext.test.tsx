import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APPEARANCE_STORAGE_KEY } from './appearance'
import { AppearanceProvider, useAppearance } from './AppearanceContext'

function Probe() {
  const { preference, effectiveTheme, setPreference } = useAppearance()
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="effective">{effectiveTheme}</span>
      <button type="button" onClick={() => setPreference('light')}>
        choose light
      </button>
      <button type="button" onClick={() => setPreference('dark')}>
        choose dark
      </button>
      <button type="button" onClick={() => setPreference('system')}>
        choose system
      </button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AppearanceProvider>
      <Probe />
    </AppearanceProvider>,
  )
}

interface MediaQueryListLike {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

function installMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const mql: MediaQueryListLike = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_event: string, cb: () => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_event: string, cb: () => void) => listeners.delete(cb)),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mql))
  return {
    mql,
    setMatches(next: boolean) {
      mql.matches = next
      for (const cb of listeners) cb()
    },
  }
}

function storedValue(): string | null {
  return window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
})

describe('AppearanceProvider', () => {
  it('defaults to system with the OS light theme and applies it to the document', () => {
    renderProbe()

    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(storedValue()).toBeNull()
  })

  it('restores a saved dark preference and applies it to the document', () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')

    renderProbe()

    expect(screen.getByTestId('preference')).toHaveTextContent('dark')
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('persists an explicit preference and updates the document theme', () => {
    renderProbe()

    fireEvent.click(screen.getByRole('button', { name: 'choose dark' }))

    expect(screen.getByTestId('preference')).toHaveTextContent('dark')
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(storedValue()).toBe('dark')

    fireEvent.click(screen.getByRole('button', { name: 'choose light' }))
    expect(screen.getByTestId('preference')).toHaveTextContent('light')
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(storedValue()).toBe('light')
  })

  it('follows live OS theme changes while the preference is system', () => {
    const { setMatches } = installMatchMedia(false)
    renderProbe()

    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => setMatches(true))
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    act(() => setMatches(false))
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('does not follow the OS once an explicit preference is chosen', () => {
    const { setMatches } = installMatchMedia(false)
    renderProbe()
    act(() => setMatches(true))
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')

    // choose light explicitly — the OS change must not re-apply
    fireEvent.click(screen.getByRole('button', { name: 'choose light' }))
    expect(screen.getByTestId('effective')).toHaveTextContent('light')

    act(() => setMatches(true))
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    expect(storedValue()).toBe('light')
  })

  it('fails safe to system when the stored value is invalid', () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'sepia')

    renderProbe()

    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('fails safe to system when storage read throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied')
    })

    renderProbe()

    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('effective')).toHaveTextContent('light')
  })

  it('keeps an explicit preference for the session when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    renderProbe()
    fireEvent.click(screen.getByRole('button', { name: 'choose dark' }))

    expect(screen.getByTestId('preference')).toHaveTextContent('dark')
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('syncs an explicit preference from another tab via the storage event', () => {
    renderProbe()
    expect(screen.getByTestId('preference')).toHaveTextContent('system')

    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: APPEARANCE_STORAGE_KEY }))
    })

    expect(screen.getByTestId('preference')).toHaveTextContent('dark')
    expect(screen.getByTestId('effective')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('starts each test from a neutral document theme (no leakage)', () => {
    // Regression: the provider leaves <html data-theme> set for its mount, so
    // setup.ts resets the shared jsdom document before each test. A prior dark
    // test in this file must not leak theme state into the next test.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
