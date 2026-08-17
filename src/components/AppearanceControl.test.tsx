import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppearanceProvider } from '../lib/appearance/AppearanceContext'
import { AppearanceControl } from './AppearanceControl'

function renderControl() {
  return render(
    <AppearanceProvider>
      <AppearanceControl />
    </AppearanceProvider>,
  )
}

describe('AppearanceControl', () => {
  it('exposes all three preferences as a labelled radio group', () => {
    renderControl()

    expect(screen.getByRole('radiogroup', { name: '外観' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'システム' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'ライト' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'ダーク' })).toBeInTheDocument()
  })

  it('defaults to system selected and shares one radio group', () => {
    renderControl()

    expect(screen.getByRole('radio', { name: 'システム' })).toBeChecked()
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('name', 'appearance')
    }
  })

  it('selects and persists an explicit preference on click', () => {
    renderControl()

    fireEvent.click(screen.getByRole('radio', { name: 'ダーク' }))

    expect(screen.getByRole('radio', { name: 'ダーク' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'システム' })).not.toBeChecked()
    expect(window.localStorage.getItem('business-japanese-hub.appearance')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('marks the active option visually and switches back to system', () => {
    renderControl()

    fireEvent.click(screen.getByRole('radio', { name: 'ダーク' }))
    const darkLabel = screen.getByRole('radio', { name: 'ダーク' }).closest('label')
    expect(darkLabel).toHaveClass('appearance-control__option--active')

    fireEvent.click(screen.getByRole('radio', { name: 'システム' }))
    expect(screen.getByRole('radio', { name: 'システム' })).toBeChecked()
    expect(window.localStorage.getItem('business-japanese-hub.appearance')).toBe('system')
    const systemLabel = screen.getByRole('radio', { name: 'システム' }).closest('label')
    expect(systemLabel).toHaveClass('appearance-control__option--active')
    expect(darkLabel).not.toHaveClass('appearance-control__option--active')
  })
})
