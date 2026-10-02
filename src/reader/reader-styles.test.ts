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
const globalCss = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8')

describe('Reader heading theme isolation (#191)', () => {
  for (const appTheme of ['system', 'light', 'dark']) {
    for (const readerTheme of ['light', 'sepia', 'dark']) {
      it(`uses Reader text roles with app ${appTheme} / Reader ${readerTheme}`, () => {
        const style = document.createElement('style')
        // Imports are already supplied explicitly; jsdom cannot load relative CSS.
        style.textContent = `${tokensCss}\n${globalCss.replace(/@import[^;]+;/g, '')}\n${readerCss}`
        document.head.append(style)
        const root = document.documentElement
        const previousTheme = root.getAttribute('data-theme')
        const previousReaderTheme = root.getAttribute('data-reader-theme')
        const fixture = document.createElement('div')
        fixture.innerHTML = `<main class="reader-shell">
          <h1 class="reader-chapter-header__title">章の見出し</h1>
          <div class="reader-blocks"><h2 class="reader-heading">節</h2><h3 class="reader-heading">項</h3><h4 class="reader-heading">小見出し</h4></div>
          <h2 class="reader-marginalia__title">語彙</h2>
        </main>
        <div class="reader-dialog"><h2 class="reader-dialog__title">読書設定</h2><h3 class="reader-settings__label">テーマ</h3></div>`
        document.body.append(fixture)
        if (appTheme === 'system') root.removeAttribute('data-theme')
        else root.setAttribute('data-theme', appTheme)
        root.setAttribute('data-reader-theme', readerTheme)
        try {
          // jsdom reports the cascaded custom-property reference rather than
          // resolving its colour. Guard the actual CSS cascade, not pixel QA.
          for (const heading of fixture.querySelectorAll('h1, h2, h3, h4')) {
            const muted = heading.matches('.reader-marginalia__title, .reader-settings__label')
            expect(getComputedStyle(heading).color).toBe(muted ? 'var(--reader-muted)' : 'var(--reader-text)')
          }
          expect(getComputedStyle(root).getPropertyValue('--reader-text').trim()).toBe({
            light: '#21241f', sepia: '#43372b', dark: '#e8e4d9',
          }[readerTheme])
        } finally {
          fixture.remove()
          style.remove()
          if (previousTheme === null) root.removeAttribute('data-theme')
          else root.setAttribute('data-theme', previousTheme)
          if (previousReaderTheme === null) root.removeAttribute('data-reader-theme')
          else root.setAttribute('data-reader-theme', previousReaderTheme)
        }
      })
    }
  }
})

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
    // `\s*` (not `\s+`) so `letter-spacing:0;` — without whitespace after the
    // colon — is also rejected. The lookahead absorbs optional whitespace on
    // both sides of `normal` so a deliberate `normal` cancellation is allowed
    // even though the outer `\s*` can also match zero-width.
    expect(readerCss).not.toMatch(/letter-spacing:\s*(?!\s*normal\s*;)[^;]+;/)
  })
})
