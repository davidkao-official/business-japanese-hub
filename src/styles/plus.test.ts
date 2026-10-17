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

  it('limits the boxed membership link and hover treatment to desktop header tools', () => {
    const style = document.createElement('style')
    style.textContent = plusCss
    document.head.append(style)

    const desktop = document.createElement('div')
    desktop.className = 'site-header__tools'
    const desktopLink = document.createElement('a')
    desktopLink.className = 'site-nav__link--membership'
    desktop.append(desktopLink)

    const mobile = document.createElement('nav')
    mobile.className = 'mobile-menu'
    const mobileLink = document.createElement('a')
    mobileLink.className = 'site-nav__link--membership'
    mobile.append(mobileLink)

    const footer = document.createElement('footer')
    footer.className = 'site-footer'
    const footerLink = document.createElement('a')
    footerLink.className = 'site-nav__link--membership'
    footer.append(footerLink)

    const membershipRules = [...(style.sheet?.cssRules ?? [])]
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .filter((rule) => rule.selectorText.includes('.site-nav__link--membership'))
    const boxRule = membershipRules.find((rule) => rule.style.border !== '')
    const hoverRule = membershipRules.find((rule) => rule.selectorText.includes(':hover'))

    expect(boxRule).toBeDefined()
    expect(hoverRule).toBeDefined()
    expect(boxRule?.selectorText).toMatch(/^\.site-header__tools\s+\.site-nav__link--membership$/)
    expect(hoverRule?.selectorText).toMatch(/^\.site-header__tools\s+\.site-nav__link--membership:hover$/)
    expect(desktopLink.matches(boxRule!.selectorText)).toBe(true)
    expect(mobileLink.matches(boxRule!.selectorText)).toBe(false)
    expect(footerLink.matches(boxRule!.selectorText)).toBe(false)
    expect(desktopLink.matches(hoverRule!.selectorText.replace(':hover', ''))).toBe(true)
    expect(mobileLink.matches(hoverRule!.selectorText.replace(':hover', ''))).toBe(false)
    expect(footerLink.matches(hoverRule!.selectorText.replace(':hover', ''))).toBe(false)

    style.remove()
  })
})
