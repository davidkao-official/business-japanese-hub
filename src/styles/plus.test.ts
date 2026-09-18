import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const plusCss = readFileSync(join(process.cwd(), 'src/styles/plus.css'), 'utf8')

describe('Plus membership presentation styles', () => {
  it('uses the shared theme tokens instead of page-local colors', () => {
    expect(plusCss).toContain('var(--color-surface)')
    expect(plusCss).toContain('var(--color-accent-soft)')
    expect(plusCss).toContain('var(--focus-ring-color)')
    expect(plusCss).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('keeps explicit mobile, focus, and reduced-motion contracts', () => {
    expect(plusCss).toContain('@media (max-width: 47.99rem)')
    expect(plusCss).toContain(':focus-visible')
    expect(plusCss).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
