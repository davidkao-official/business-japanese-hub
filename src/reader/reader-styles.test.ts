/**
 * Design-contract guards for the reader stylesheet — they pin the locked
 * baseline from docs/ui-ux-research.md and the issue #5 brief so a future
 * design pass cannot silently regress it:
 *
 *   - mobile 17px / 1.82 leading / 18px gutter / single column
 *   - desktop 18px / 1.80 leading / 34em target measure (≈34 full-width glyphs,
 *     under the JLREQ 40-glyph cap)
 *   - TOC rail only ≥1024px (64rem); right marginalia only ≥1280px (80rem)
 *   - NO break-all, no 1000px-wide body, no global letter-spacing, no bubbles
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readerCss = readFileSync(join(process.cwd(), 'src/styles/reader.css'), 'utf8')
const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('reader design contract', () => {
  it('keeps the locked typographic baseline in the tokens', () => {
    expect(tokensCss).toContain('--reader-body-mobile: 1.0625rem') // 17px mobile
    expect(tokensCss).toContain('--reader-body-desktop: 1.125rem') // 18px desktop
    expect(tokensCss).toContain('--reader-leading-mobile: 1.82')
    expect(tokensCss).toContain('--reader-leading-desktop: 1.8')
    expect(tokensCss).toContain('--reader-measure: 34em') // ≈34 glyphs, under the 40 cap
    expect(tokensCss).toContain('--reader-measure-max: 40rem') // 640px absolute ceiling
    expect(tokensCss).toContain('--reader-gutter-mobile: 1.125rem') // 18px gutter
  })

  it('gates desktop chrome and marginalia behind explicit breakpoints', () => {
    expect(readerCss).toContain('@media (min-width: 64rem)') // collapsible TOC rail ≥1024px
    expect(readerCss).toContain('@media (min-width: 80rem)') // right marginalia ≥1280px
  })

  it('avoids the §7 anti-patterns as real CSS values', () => {
    expect(readerCss).not.toMatch(/word-break:\s*break-all/)
    expect(readerCss).not.toMatch(/overflow-wrap:\s*break-all/)
    expect(readerCss).not.toContain('max-width: 1000px')
    expect(readerCss).not.toMatch(/\bbubble\b/) // no message-bubble styling
  })

  it('applies no global letter-spacing (only deliberate `normal` cancellations)', () => {
    expect(readerCss).not.toMatch(/letter-spacing:\s+(?!normal)[^;]+;/)
  })
})
