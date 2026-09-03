import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('landing-page token extensions', () => {
  it('keeps the LP-specific values scoped beside the shared foundation', () => {
    expect(tokensCss).toContain('--section-gap: var(--space-8)')
    expect(tokensCss).toContain('--container-max-width: 72rem')
    expect(tokensCss).toContain('--lp-section-gap: var(--space-8)')
    expect(tokensCss).toContain('--lp-section-gap: 7.5rem')
    expect(tokensCss).toContain('--lp-container-max-width: 75rem')
    expect(tokensCss).toContain('--lp-radius-justified: 0.75rem')
  })

  it('defines the constrained reveal treatment for later LP composition PRs', () => {
    expect(tokensCss).toContain('--lp-reveal-distance: 1rem')
    expect(tokensCss).toContain('--lp-reveal-duration: 600ms')
  })
})
