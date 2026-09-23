import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const globalCss = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8')
const shopCss = readFileSync(join(process.cwd(), 'src/styles/shop.css'), 'utf8')
const editorialCss = readFileSync(join(process.cwd(), 'src/styles/editorial-v2.css'), 'utf8')
const productIaCss = readFileSync(join(process.cwd(), 'src/styles/product-ia.css'), 'utf8')
const spiCss = readFileSync(join(process.cwd(), 'src/styles/spi-explainer.css'), 'utf8')
const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

describe('responsive typography contract', () => {
  it('uses balanced, strict Japanese heading breaks with normal fallback and phrase atoms', () => {
    expect(globalCss).toMatch(/h1,[\s\S]*?\{[^}]*text-wrap:\s*balance;[^}]*line-break:\s*strict;[^}]*word-break:\s*normal;[^}]*word-break:\s*auto-phrase;/)
    expect(globalCss).toMatch(/\.phrase\s*\{[^}]*display:\s*inline-block;[^}]*white-space:\s*nowrap;/)
    expect(editorialCss).toMatch(/\.storefront-masthead \.page__title\s*\{[^}]*overflow-wrap:\s*normal;/)
    expect(editorialCss).toMatch(/\.storefront-section-heading h2\s*\{[^}]*overflow-wrap:\s*normal;/)
    expect(spiCss).toMatch(/\.spi-explainer__hero h1\s*\{[^}]*overflow-wrap:\s*normal;/)
  })

  it('keeps the existing responsive heading scale and prevents wrapping on real UI primitives', () => {
    expect(tokensCss).toContain('--editorial-home-title-size: clamp(3rem, 7.2vw, 6.4rem)')
    expect(tokensCss).toContain('--editorial-home-title-mobile-size: clamp(2.65rem, 14vw, 4.25rem)')
    expect(shopCss).toMatch(/\.btn\s*\{[^}]*flex-shrink:\s*0;[^}]*white-space:\s*nowrap;/)
    expect(globalCss).toMatch(/\.site-nav__link\s*\{[^}]*white-space:\s*nowrap;/)
    expect(productIaCss).toMatch(/\.learning-modes__link-label\s*\{[^}]*white-space:\s*nowrap;/)
    expect(spiCss).toMatch(/\.spi-explainer__chips li\s*\{[^}]*flex-shrink:\s*0;[^}]*white-space:\s*nowrap;/)
    expect(shopCss).toMatch(/\.entitlement-label\s*\{[^}]*white-space:\s*nowrap;/)
  })
})
