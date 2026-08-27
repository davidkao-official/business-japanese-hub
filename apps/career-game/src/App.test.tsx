import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Career Game application shell', () => {
  it('renders its own semantic surface without Library providers', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'キャリアゲーム' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByText('日本の職場で、次の一手を考える。')).toBeInTheDocument()
  })
})
