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

describe('S2 Source & Gloss foundation', () => {
  it('copies the complete Tachiko 29-role set and records its provenance', () => {
    const roles = [
      'surface-app', 'surface-chrome', 'surface-chrome-tint', 'surface-content', 'surface-inset',
      'text-primary', 'text-secondary', 'text-on-tint', 'text-link', 'text-reference',
      'border-subtle', 'border-control', 'action-primary-background', 'action-primary-hover',
      'action-primary-pressed', 'action-primary-foreground', 'accent-foreground', 'accent-background',
      'grid-canvas', 'grid-line-horizontal', 'grid-line-vertical', 'grid-header-background',
      'grid-header-foreground', 'selection-row-background', 'selection-header-background',
      'selection-header-foreground', 'selection-active-background', 'selection-active-border', 'focus-ring',
    ]
    for (const role of roles) expect(tokensCss).toMatch(new RegExp(`--role-${role}:`))
    expect(roles).toHaveLength(29)
    expect(tokensCss).toContain('Foundations node 21:35588')
    expect(tokensCss).toContain('node 32:75')
    expect(tokensCss).toContain('--role-border-control: #818798')
  })

  it('keeps the Japanese stacks and type, geometry, and breakpoint vocabulary in tokens', () => {
    expect(tokensCss).toContain(':lang(ja)')
    expect(tokensCss).toContain('--font-ja: "Hiragino Sans"')
    expect(tokensCss).toContain('--font-material: "Hiragino Mincho ProN"')
    expect(tokensCss).not.toMatch(/--font-ja:[^;]*(?:Inter|Noto Sans TC|PingFang TC)/)
    expect(tokensCss).toContain('--size-caption: 0.8125rem')
    expect(tokensCss).toContain('--radius-control: 7px')
    expect(tokensCss).toContain('--focus-width: 3px')
    expect(tokensCss).toContain('--bp-sm: 37.5rem')
    expect(tokensCss).toContain('--bp-md: 64rem')
    expect(tokensCss).toContain('--size-small: 0.875rem')
    expect(tokensCss).toContain('--gutter: clamp(16px, 4vw, 40px)')
    expect(tokensCss).toContain('--content-max: 1200px')
    expect(tokensCss).toContain('--header-h: 64px')
    expect(tokensCss).toContain('--bottom-bar-h: 64px')
    expect(tokensCss).toContain('--dur-fast: 120ms')
    expect(tokensCss).toContain('--dur-mark: 260ms')
    expect(tokensCss).toContain('prefers-reduced-motion: reduce')
    expect(tokensCss).toContain('font-synthesis: none')
    expect(tokensCss).toContain('Components 21:35816')
  })

  it('retires Concept C palette definitions and chains its remaining styles through aliases', () => {
    expect(tokensCss).not.toMatch(/--home-[\w-]+\s*:/)
    expect(tokensCss).toContain('--color-bg: var(--role-surface-app)')
  })
})
